import asyncio
from datetime import datetime, timezone
import logging

from backend.database import SessionLocal
from backend.models import Shipment, ShipmentStatus, Notification, NotificationType, User, UserRole
from backend.utils.email import send_email

logger = logging.getLogger(__name__)

async def background_monitoring_loop():
    """Periodic task to check ETA for transit and spoilage risk for storage."""
    while True:
        try:
            db = SessionLocal()
            now = datetime.now(timezone.utc)
            
            # 1. Check for Shipments that have passed ETA -> Delivered
            in_transit = db.query(Shipment).filter(Shipment.status == ShipmentStatus.in_transit).all()
            for shipment in in_transit:
                try:
                    # eta_hours might be stored as "0.1 hours" or "0.1"
                    eta_str = str(shipment.eta_hours).replace(' hours', '').replace(' hour', '').strip()
                    eta_hours = float(eta_str)
                    created_at = shipment.created_at
                    
                    if created_at:
                        # Ensure created_at is UTC aware if it's naive
                        if created_at.tzinfo is None:
                            created_at = created_at.replace(tzinfo=timezone.utc)
                            
                        elapsed = (now.timestamp() - created_at.timestamp()) / 3600
                        if elapsed >= eta_hours:
                            # Update status to Delivered
                            shipment.status = ShipmentStatus.delivered
                            
                            farmer = db.query(User).filter(User.id == shipment.user_id).first()
                            manager = db.query(User).filter(User.role == UserRole.warehouse_manager).first()
                            
                            # Market price info
                            market_price = "₹120/kg"
                            if shipment.prediction and shipment.prediction.mandi_price_per_kg:
                                market_price = f"₹{shipment.prediction.mandi_price_per_kg}/kg"
                            
                            message = (
                                f"Shipment #{shipment.booking_id} ({shipment.crop}) has arrived at {shipment.destination}.\n\n"
                                f"Detailed Information:\n"
                                f"• Crop: {shipment.crop}\n"
                                f"• Tonnage: {shipment.tonnage} Tons\n"
                                f"• Market Price: {market_price}\n"
                                f"• Farmer: {farmer.name if farmer else 'N/A'}\n"
                                f"• Vehicle Reg: {shipment.vehicle_reg_number or 'N/A'}\n"
                                f"• Arrival Time: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}"
                            )
                            
                            # Notify farmer
                            if farmer:
                                db.add(Notification(
                                    user_id=farmer.id,
                                    shipment_id=shipment.id,
                                    type=NotificationType.arrival_alert,
                                    title="Shipment Delivered!",
                                    message=message
                                ))
                                
                            # Notify manager
                            if manager:
                                db.add(Notification(
                                    user_id=manager.id,
                                    shipment_id=shipment.id,
                                    type=NotificationType.arrival_alert,
                                    title="Incoming Shipment Arrived",
                                    message=message
                                ))
                                
                            # Notify Admin (acting as Industry Buyer since Buyer role isn't distinct)
                            admin = db.query(User).filter(User.role == UserRole.admin).first()
                            if admin:
                                db.add(Notification(
                                    user_id=admin.id,
                                    shipment_id=shipment.id,
                                    type=NotificationType.arrival_alert,
                                    title="Shipment Arrived for Industry",
                                    message=message
                                ))
                                
                except Exception as e:
                    logger.error(f"Error processing shipment {shipment.id}: {e}")

            # 2. Check for Warehouse Spoilage Risk
            in_storage = db.query(Shipment).filter(Shipment.status == ShipmentStatus.in_storage).all()
            for shipment in in_storage:
                try:
                    shelf_days = shipment.shelf_days_calculated
                    created_at = shipment.created_at
                    
                    if created_at and shelf_days:
                        if created_at.tzinfo is None:
                            created_at = created_at.replace(tzinfo=timezone.utc)
                            
                        elapsed_days = (now.timestamp() - created_at.timestamp()) / (3600 * 24)
                        days_left = shelf_days - elapsed_days
                        
                        from backend.models import ColdStorage
                        warehouse = db.query(ColdStorage).filter(ColdStorage.facility_name == shipment.destination).first()
                        
                        hr = days_left * 24.0
                        if warehouse and warehouse.base_temp_c and warehouse.base_temp_c > 10.0:
                            hr = hr / 2.8
                            
                        if hr < 48.0 and shipment.risk_status != "HIGH":
                            shipment.risk_status = "HIGH"
                            # We don't auto-dispatch here anymore, just mark as high risk

                        if hr <= 1.0 and shipment.status == ShipmentStatus.in_storage:
                            # Auto-dispatch logic for <= 1 hour
                            shipment.status = ShipmentStatus.awaiting_pickup
                            
                            manager = db.query(User).filter(User.role == UserRole.warehouse_manager).first()
                            farmer = db.query(User).filter(User.id == shipment.user_id).first()
                            
                            if manager:
                                msg = (
                                    f"CRITICAL: Crop {shipment.crop} (Booking #{shipment.booking_id}) has {hr:.1f} hours left. Auto-dispatched to Industry Buyer!\n\n"
                                    f"Detailed Information:\n"
                                    f"• Crop: {shipment.crop}\n"
                                    f"• Tonnage: {shipment.tonnage} Tons\n"
                                    f"• Hours Left: {hr:.1f} hrs\n"
                                    f"• Farmer: {farmer.name if farmer else 'N/A'}\n"
                                    f"• Action Taken: Auto-routed to nearest available Industry Buyer\n"
                                )
                                db.add(Notification(
                                    user_id=manager.id,
                                    shipment_id=shipment.id,
                                    type=NotificationType.spoilage_warning,
                                    title="Emergency Auto-Dispatch",
                                    message=msg
                                ))
                                if manager.email:
                                    send_email(manager.email, f"Emergency Auto-Dispatch Alert - {shipment.booking_id}", msg)
                                
                except Exception as e:
                    logger.error(f"Error processing storage {shipment.id}: {e}")

            db.commit()
            db.close()
        except Exception as e:
            logger.error(f"Background task error: {e}")
            
        # Run every 60 seconds
        await asyncio.sleep(60)
