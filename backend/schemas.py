"""
schemas.py — Pydantic Request / Response Models
"""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, EmailStr, Field


# ─────────────────────────────────────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    phone: str = Field(..., min_length=10, max_length=15)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: str = Field(default="farmer", pattern="^(farmer|warehouse_manager|admin)$")
    district: Optional[str] = None
    managed_warehouse_id: Optional[int] = None


class UserLogin(BaseModel):
    login_id: str
    password: str

class OTPRequest(BaseModel):
    login_id: str

class OTPVerifyLogin(BaseModel):
    login_id: str
    otp: str

class ForgotPasswordRequest(BaseModel):
    login_id: str

class ResetPasswordRequest(BaseModel):
    login_id: str
    otp: str
    new_password: str = Field(..., min_length=6)

class RegisterOTPRequest(BaseModel):
    email: EmailStr


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    district: Optional[str] = None
    email: Optional[EmailStr] = None


class EmailChangeRequest(BaseModel):
    new_email: EmailStr


class EmailChangeVerify(BaseModel):
    new_email: EmailStr
    otp: str


class UserResponse(BaseModel):
    id: int
    full_name: str
    phone: str
    email: str
    role: str
    district: Optional[str] = None
    managed_warehouse_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ─────────────────────────────────────────────────────────────────────────────
# PREDICTIONS
# ─────────────────────────────────────────────────────────────────────────────
class PredictionCreate(BaseModel):
    crop: str
    district: str
    temperature: float
    humidity: float
    road_condition: str = Field(..., pattern="^(National Highway|State Highway|Rural / Unpaved Road)$")
    actual_transit_days: float = Field(..., gt=0)
    expected_transit_days: float = Field(..., gt=0)
    storage_days: int = Field(..., ge=0)
    quantity_tons: float = Field(..., gt=0)
    arrival_volume: float = 180.0
    avg_market_volume: float = 90.0
    picture_spoilage_prob: Optional[float] = None
    image_data: Optional[str] = None



class FacilityRecommendation(BaseModel):
    facility_name: str
    district: str
    latitude: float
    longitude: float
    physical_distance_km: float
    capacity_mt: float
    available_capacity_tons: float
    mandi_price_per_kg: float
    net_estimated_payout: float
    base_temp_c: float
    
class PredictionResponse(BaseModel):
    id: int
    crop: str
    district: str
    temperature: float
    humidity: float
    road_condition: str
    actual_transit_days: float
    expected_transit_days: float
    storage_days: int
    quantity_tons: float
    spoilage_probability: float
    shelf_life_days: float
    loss_percentage: float
    financial_loss: float
    risk_level: str
    recommended_facility: Optional[str] = None
    facility_distance_km: Optional[float] = None
    mandi_price_per_kg: Optional[float] = None
    f_lat: Optional[float] = None
    f_lng: Optional[float] = None
    cs_lat: Optional[float] = None
    cs_lng: Optional[float] = None
    image_data: Optional[str] = None
    top_facilities: List[FacilityRecommendation] = []
    advisory_transcript_en: Optional[str] = None
    advisory_transcript_kn: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PredictionListResponse(BaseModel):
    predictions: List[PredictionResponse]
    total: int
    page: int
    page_size: int


# ─────────────────────────────────────────────────────────────────────────────
# SHIPMENTS
# ─────────────────────────────────────────────────────────────────────────────
class ShipmentCreate(BaseModel):
    prediction_id: Optional[int] = None
    booking_id: str
    crop: str
    tonnage: float
    destination: str
    route_quality: str
    eta_hours: str
    risk_status: str
    shelf_days_calculated: float
    farmer_name: Optional[str] = None
    farmer_phone: Optional[str] = None
    vehicle_reg_number: Optional[str] = None


class ShipmentUpdate(BaseModel):
    status: Optional[str] = None
    risk_status: Optional[str] = None
    shelf_days_calculated: Optional[float] = None


class ShipmentResponse(BaseModel):
    id: int
    booking_id: str
    crop: str
    tonnage: float
    destination: str
    route_quality: str
    eta_hours: str
    risk_status: str
    shelf_days_calculated: float
    status: str
    farmer_name: Optional[str] = None
    farmer_phone: Optional[str] = None
    vehicle_reg_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# WAREHOUSES
# ─────────────────────────────────────────────────────────────────────────────
class WarehouseUpdate(BaseModel):
    occupancy_pct: Optional[float] = Field(None, ge=0, le=100)
    price_per_ton_day: Optional[float] = Field(None, ge=50, le=500)
    base_temp_c: Optional[float] = None
    capacity_mt: Optional[int] = Field(None, ge=1)


class WarehouseResponse(BaseModel):
    id: int
    facility_id: str
    facility_name: str
    district: str
    latitude: float
    longitude: float
    capacity_mt: int
    occupancy_pct: float
    price_per_ton_day: float
    base_temp_c: float
    operational_status: str
    contact_phone: Optional[str] = None
    manager_id: Optional[int] = None

    class Config:
        from_attributes = True


class InspectionForm(BaseModel):
    shipment_booking_id: str
    bruising: str = Field(..., pattern="^(None|Slight|Severe)$")
    ripeness: str = Field(..., pattern="^(Unripe|Optimal Balance|Overripe / Soft)$")
    core_temp: float = Field(..., ge=0, le=40)


# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATIONS
# ─────────────────────────────────────────────────────────────────────────────
class NotificationResponse(BaseModel):
    id: int
    shipment_id: Optional[int] = None
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationCount(BaseModel):
    unread: int


# ─────────────────────────────────────────────────────────────────────────────
# FARMER DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────
class FarmerDashboardResponse(BaseModel):
    user: UserResponse
    total_predictions: int
    total_shipments: int
    total_tons_shipped: float
    avg_spoilage_rate: float
    total_cost_saved: float
    active_shipments: List[ShipmentResponse]
    recent_predictions: List[PredictionResponse]


class MarketRegisterForm(BaseModel):
    full_name: str = Field(..., min_length=2)
    phone: str = Field(..., min_length=10, max_length=15)
    email: EmailStr
    password: str = Field(..., min_length=6)
    district: str
    crop_type: Optional[str] = None
