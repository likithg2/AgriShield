"""
routers/warehouses.py — Warehouse Management Endpoints
Facility listing, updates, gate inspection, dispatch.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.models import (
    ColdStorage, Shipment, ShipmentStatus, User,
    Notification, NotificationType,
)
from backend.schemas import (
    WarehouseResponse, WarehouseUpdate, InspectionForm, ShipmentResponse,
)
from backend.auth import get_current_user, require_role
from backend.communications import send_email_notification

router = APIRouter(prefix="/api/warehouses", tags=["Warehouses"])


@router.get("/", response_model=list[WarehouseResponse])
def list_warehouses(db: Session = Depends(get_db)):
    """List all cold storage facilities."""
    storages = db.query(ColdStorage).order_by(ColdStorage.district).all()
    return [WarehouseResponse.model_validate(s) for s in storages]


@router.get("/{warehouse_id}", response_model=WarehouseResponse)
def get_warehouse(warehouse_id: int, db: Session = Depends(get_db)):
    """Get a single warehouse by ID."""
    storage = db.query(ColdStorage).filter(ColdStorage.id == warehouse_id).first()
    if not storage:
        raise HTTPException(status_code=404, detail="Warehouse not found.")
    return WarehouseResponse.model_validate(storage)


@router.put("/{warehouse_id}", response_model=WarehouseResponse)
def update_warehouse(
    warehouse_id: int,
    payload: WarehouseUpdate,
    current_user: User = Depends(require_role("warehouse_manager")),
    db: Session = Depends(get_db),
):
    """Update warehouse occupancy, pricing, or temperature (warehouse manager only)."""
    storage = db.query(ColdStorage).filter(ColdStorage.id == warehouse_id).first()
    if not storage:
        raise HTTPException(status_code=404, detail="Warehouse not found.")

    if payload.occupancy_pct is not None:
        storage.occupancy_pct = payload.occupancy_pct
    if payload.price_per_ton_day is not None:
        storage.price_per_ton_day = payload.price_per_ton_day
    if payload.base_temp_c is not None:
        storage.base_temp_c = payload.base_temp_c
    if payload.capacity_mt is not None:
        storage.capacity_mt = payload.capacity_mt

    db.commit()
    db.refresh(storage)
    return WarehouseResponse.model_validate(storage)


@router.post("/{warehouse_id}/inspect", response_model=ShipmentResponse)
def gate_inspection(
    warehouse_id: int,
    payload: InspectionForm,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role("warehouse_manager")),
    db: Session = Depends(get_db),
):
    """
    Gate inspection for an arriving vehicle.
    Updates the shipment's risk status, shelf life, and transitions to 'In Storage'.
    """
    shipment = db.query(Shipment).filter(
        Shipment.booking_id == payload.shipment_booking_id
    ).first()

    warehouse = db.query(ColdStorage).filter(ColdStorage.id == warehouse_id).first()
    facility_name = warehouse.facility_name if warehouse else "the facility"

    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found.")
    if shipment.status not in [ShipmentStatus.in_transit, ShipmentStatus.delivered]:
        raise HTTPException(status_code=400, detail="Shipment is not in transit or delivered.")

    # Calculate new risk based on inspection
    new_risk = "LOW RISK"
    shelf_reduction = 1.0

    if (payload.bruising == "Severe" or
            payload.ripeness == "Overripe / Soft" or
            payload.core_temp > 20.0):
        new_risk = "HIGH RISK"
        shelf_reduction = 0.4
    elif payload.bruising == "Slight" or payload.core_temp > 12.0:
        new_risk = "MEDIUM RISK"
        shelf_reduction = 0.75

    shipment.risk_status = new_risk
    shipment.status = ShipmentStatus.in_storage
    shipment.shelf_days_calculated = shipment.shelf_days_calculated * shelf_reduction

    db.commit()
    db.refresh(shipment)

    # Notify the farmer that their crop has been inspected and stored
    notif = Notification(
        user_id=shipment.user_id,
        shipment_id=shipment.id,
        type=NotificationType.arrival_alert,
        title="Crop Arrived & Inspected",
        message=f"Your batch {shipment.booking_id} ({shipment.crop}, {shipment.tonnage} tons) "
                f"has arrived and been inspected. Quality: {new_risk}. "
                f"Remaining shelf life: {shipment.shelf_days_calculated:.1f} days.",
    )
    db.add(notif)
    
    # Notify warehouse manager/admin for audit
    if current_user.id != shipment.user_id:
        mgr_notif = Notification(
            user_id=current_user.id,
            shipment_id=shipment.id,
            type=NotificationType.arrival_alert,
            title=f"Inspection Complete: {shipment.booking_id}",
            message=f"You inspected & stored batch {shipment.booking_id} ({shipment.crop}, "
                    f"{shipment.tonnage} tons) at {facility_name}. Quality: {new_risk}.",
        )
        db.add(mgr_notif)

    db.commit()

    farmer = db.query(User).filter(User.id == shipment.user_id).first()
    if farmer and farmer.email:
        background_tasks.add_task(send_email_notification, farmer.email, notif.title, notif.message)

    return ShipmentResponse.model_validate(shipment)


@router.post("/{warehouse_id}/dispatch")
def dispatch_shipment(
    warehouse_id: int,
    shipment_id: int,
    background_tasks: BackgroundTasks,
    action: str = "mandi",  # "mandi", "factory", "redirected"
    vehicle_reg_no: str = None,
    current_user: User = Depends(require_role("warehouse_manager")),
    db: Session = Depends(get_db),
):
    """
    Dispatch a stored shipment to market or factory.
    Triggers notification to farmer.
    """
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found.")

    storage = db.query(ColdStorage).filter(ColdStorage.id == warehouse_id).first()
    facility_name = storage.facility_name if storage else "Unknown"

    # Map action to status
    status_map = {
        "mandi": ShipmentStatus.listed_standard,
        "accelerated": ShipmentStatus.listed_accelerated,
        "factory": ShipmentStatus.awaiting_pickup,
        "redirected": ShipmentStatus.redirected,
    }

    new_status = status_map.get(action, ShipmentStatus.listed_standard)
    shipment.status = new_status
    if vehicle_reg_no:
        shipment.vehicle_reg_number = vehicle_reg_no
    db.commit()

    # Notify farmer
    notif = Notification(
        user_id=shipment.user_id,
        shipment_id=shipment.id,
        type=NotificationType.dispatch_alert,
        title=f"Dispatch: {new_status.value}",
        message=f"Your batch {shipment.booking_id} ({shipment.crop}) at {facility_name} "
                f"has been dispatched. New status: {new_status.value}. "
                f"Action taken by warehouse manager.",
    )
    db.add(notif)

    # If there's a warehouse manager, also notify them for audit
    if current_user.id != shipment.user_id:
        mgr_notif = Notification(
            user_id=current_user.id,
            shipment_id=shipment.id,
            type=NotificationType.dispatch_alert,
            title=f"Dispatch Confirmed: {shipment.booking_id}",
            message=f"You dispatched batch {shipment.booking_id} ({shipment.crop}, "
                    f"{shipment.tonnage} tons) from {facility_name}. Status: {new_status.value}.",
        )
        db.add(mgr_notif)

    db.commit()

    farmer = db.query(User).filter(User.id == shipment.user_id).first()
    if farmer and farmer.email:
        background_tasks.add_task(send_email_notification, farmer.email, notif.title, notif.message)
        
    if current_user.id != shipment.user_id and current_user.email:
        background_tasks.add_task(send_email_notification, current_user.email, mgr_notif.title, mgr_notif.message)

    if action == "factory":
        buyer_email = "thearjun006@gmail.com"
        buyer_title = f"Urgent Dispatch Alert: {shipment.booking_id}"
        buyer_message = f"High-risk batch {shipment.booking_id} ({shipment.crop}, {shipment.tonnage} tons) from {facility_name} has been dispatched to your facility for immediate processing."
        background_tasks.add_task(send_email_notification, buyer_email, buyer_title, buyer_message)

    return {
        "message": f"Shipment {shipment.booking_id} dispatched successfully.",
        "status": new_status.value,
    }


class SimulateFaultRequest(BaseModel):
    simulate: bool

@router.post("/{warehouse_id}/simulate-fault")
def simulate_fault(warehouse_id: int, req: SimulateFaultRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role.value not in ["warehouse_manager", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    warehouse = db.query(ColdStorage).filter(ColdStorage.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
        
    if req.simulate:
        warehouse.base_temp_c = 14.5
    else:
        warehouse.base_temp_c = 4.0
        
    db.commit()
    return {"message": "Fault simulated" if req.simulate else "Fault resolved", "base_temp_c": warehouse.base_temp_c}
