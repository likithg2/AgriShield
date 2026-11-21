"""
routers/predictions.py — ML Prediction Endpoints
Run spoilage predictions and view history.
"""

import math
import asyncio
import json
import tempfile
import os
import sys
import logging
import subprocess
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

import numpy as np
import joblib
import joblib.numpy_pickle as npickle
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from sqlalchemy.exc import SQLAlchemyError

from backend.database import get_db
from backend.models import Prediction, User, ColdStorage
from backend.schemas import PredictionCreate, PredictionResponse, PredictionListResponse
from backend.auth import get_current_user
from backend.config import settings
import requests

logger = logging.getLogger(__name__)

# Ensure Cython internal loss module is mapped to sys.modules['_loss'] so that
# unpickling artifacts_v2.pkl succeeds across Linux (Render) and different scikit-learn versions
try:
    import sklearn._loss._loss as _cy_loss
    sys.modules["_loss"] = _cy_loss
except (ImportError, AttributeError):
    try:
        import sklearn._loss as _sk_loss
        sys.modules["_loss"] = _sk_loss
    except ImportError:
        pass


class _SafeNumpyUnpickler(npickle.NumpyUnpickler):
    """Custom unpickler to redirect legacy or version-mismatched '_loss' modules to sklearn._loss._loss."""
    def find_class(self, module, name):
        if module == "_loss":
            try:
                import sklearn._loss._loss as cy_l
                if hasattr(cy_l, name):
                    return getattr(cy_l, name)
            except (ImportError, AttributeError):
                pass
            try:
                import sklearn._loss.loss as sk_l
                if hasattr(sk_l, name):
                    return getattr(sk_l, name)
            except (ImportError, AttributeError):
                pass
        return super().find_class(module, name)


router = APIRouter(prefix="/api/predictions", tags=["Predictions"])

# ── Load ML artifacts once ────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ARTIFACTS_PATH = BASE_DIR / "artifacts_v2.pkl"

_artifacts_cache = None


def _load_artifacts():
    global _artifacts_cache
    if _artifacts_cache is not None:
        return _artifacts_cache
    if not ARTIFACTS_PATH.exists():
        msg = f"Artifacts file does not exist at {ARTIFACTS_PATH}"
        logger.error(msg)
        return f"Error: {msg}"
    
    # Re-verify _loss mapping before unpickling
    if "_loss" not in sys.modules:
        try:
            import sklearn._loss._loss as _cy_loss
            sys.modules["_loss"] = _cy_loss
        except (ImportError, AttributeError):
            try:
                import sklearn._loss as _sk_loss
                sys.modules["_loss"] = _sk_loss
            except ImportError:
                pass

    try:
        _artifacts_cache = joblib.load(ARTIFACTS_PATH)
        return _artifacts_cache
    except Exception as initial_err:
        logger.warning(
            "Standard joblib.load failed (%s). Retrying with SafeNumpyUnpickler fallback...",
            initial_err
        )
        try:
            with open(ARTIFACTS_PATH, "rb") as f:
                unpickler = _SafeNumpyUnpickler(str(ARTIFACTS_PATH), f, ensure_native_byte_order=True)
                _artifacts_cache = unpickler.load()
                return _artifacts_cache
        except Exception as fallback_err:
            import traceback
            tb = traceback.format_exc()
            logger.error("Failed to load artifacts with fallback unpickler: %s\n%s", fallback_err, tb)
            return f"Error loading artifacts: {type(fallback_err).__name__}: {fallback_err}\n{tb}"


# ── Constants (mirrored from ML prediction page) ─────────────────────────────
CROP_MASTER = {
    "Tomato": (7, 25, 1.00, 2.5), "Onion": (60, 10, 0.15, 1.8),
    "Potato": (90, 8, 0.12, 1.7), "Banana": (10, 20, 0.95, 2.2),
    "Mango": (14, 18, 0.80, 2.4), "Grapes": (14, 15, 0.75, 2.3),
    "Pomegranate": (30, 12, 0.55, 2.0), "Cabbage": (5, 35, 1.05, 2.5),
    "Capsicum": (14, 20, 0.85, 2.2), "Cauliflower": (5, 30, 1.05, 2.5),
    "Brinjal": (7, 25, 0.90, 2.3), "Okra": (3, 40, 1.10, 2.7),
    "Spinach": (3, 45, 1.20, 3.0), "Coconut": (60, 5, 0.10, 1.5),
    "Cucumber": (14, 20, 0.90, 2.0),
}

DISTRICT_COORDS = {
    "Bagalkot": (16.18, 75.70), "Ballari": (15.15, 76.92),
    "Belagavi": (15.85, 74.50), "Bengaluru Rural": (13.20, 77.46),
    "Bengaluru Urban": (12.87, 77.68), "Bidar": (17.91, 77.52),
    "Chamarajanagar": (11.93, 76.94), "Chikkaballapur": (13.40, 78.05),
    "Chitradurga": (14.23, 76.40), "Dakshina Kannada": (12.88, 74.88),
    "Davangere": (14.46, 75.92), "Dharwad": (15.41, 75.07),
    "Gadag": (15.42, 75.62), "Hassan": (13.01, 76.10),
    "Haveri": (14.80, 75.40), "Kalaburagi": (17.33, 76.82),
    "Kodagu": (12.42, 75.74), "Kolar": (13.14, 78.22),
    "Koppal": (15.35, 76.16), "Mandya": (12.52, 76.90),
    "Mysuru": (12.30, 76.65), "Raichur": (16.20, 77.36),
    "Ramanagara": (12.72, 77.28), "Shivamogga": (13.93, 75.57),
    "Tumakuru": (13.48, 77.04), "Udupi": (13.34, 74.74),
    "Uttara Kannada": (14.81, 74.13), "Vijayanagar": (15.27, 76.39),
    "Vijayapura": (16.83, 75.72), "Yadgir": (16.77, 77.13),
}

SRI_MONTHLY = {
    1: 0.40, 2: 0.45, 3: 0.50, 4: 0.55, 5: 0.60, 6: 0.80,
    7: 0.85, 8: 0.82, 9: 0.78, 10: 0.65, 11: 0.55, 12: 0.42,
}


def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Realistic APMC mandi benchmark prices (₹/kg) across Karnataka crops
CROP_BASE_PRICES = {
    "Tomato": 22.00,
    "Cucumber": 16.00,
    "Potato": 15.00,
    "Onion": 18.00,
    "Capsicum": 28.00,
    "Cabbage": 12.00,
    "Cauliflower": 16.00,
    "Brinjal": 18.00,
    "Okra": 24.00,
    "Spinach": 15.00,
    "Banana": 22.00,
    "Mango": 45.00,
    "Grapes": 50.00,
    "Pomegranate": 75.00,
    "Coconut": 25.00,
}

DISTRICT_PRICE_FACTORS = {
    "Bengaluru Urban": 1.15,
    "Bengaluru Rural": 1.10,
    "Mysuru": 1.05,
    "Kolar": 1.05,
    "Belagavi": 0.95,
    "Bagalkot": 0.92,
    "Gadag": 0.92,
    "Koppal": 0.90,
    "Hassan": 0.95,
    "Dharwad": 0.98,
    "Tumakuru": 1.02,
    "Shivamogga": 1.00,
    "Chitradurga": 0.94,
    "Ballari": 0.95,
    "Vijayapura": 0.92,
    "Kalaburagi": 0.92,
    "Udupi": 1.10,
    "Dakshina Kannada": 1.10,
}


def get_crop_mandi_price(crop: str, district: str) -> float:
    """Return the realistic current market rate in ₹/kg based on the crop and district."""
    base_rate = CROP_BASE_PRICES.get(crop, 20.00)
    factor = DISTRICT_PRICE_FACTORS.get(district, 1.00)
    return round(base_rate * factor, 2)


def _get_top_3_facilities(f_lat: float, f_lng: float, db: Session, crop: str, qty_tons: float, road_cond: str):
    """Find top 3 cold storage facilities based on available capacity and net payout."""
    storages = db.query(ColdStorage).filter(
        ColdStorage.occupancy_pct < 100.0,
        ColdStorage.operational_status == "Active",
    ).all()

    if not storages:
        return []

    speed_map = {"National Highway": 60.0, "State Highway": 40.0, "Rural / Unpaved Road": 20.0}
    current_speed = speed_map.get(road_cond, 40.0)

    candidates = []
    for s in storages:
        available_cap = s.capacity_mt * (1 - s.occupancy_pct / 100.0)
        if available_cap >= qty_tons:
            dist_km = haversine(f_lat, f_lng, s.latitude, s.longitude)
            
            mandi_price = get_crop_mandi_price(crop, s.district)
            
            est_transit_hours = dist_km / current_speed if current_speed > 0 else dist_km / 40.0
            total_shelf_hours = CROP_MASTER.get(crop, (7,))[0] * 24.0
            survival_prob = max(0.0, min(1.0, total_shelf_hours / (total_shelf_hours + est_transit_hours)))
            
            total_transit_cost = dist_km * 25.0
            storage_rent_cost = 180.0 * qty_tons * 3
            total_kg = qty_tons * 1000.0
            net_payout = (total_kg * mandi_price * survival_prob) - total_transit_cost - storage_rent_cost
            
            candidates.append({
                "facility_name": s.facility_name,
                "district": s.district,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "physical_distance_km": dist_km,
                "capacity_mt": s.capacity_mt,
                "available_capacity_tons": available_cap,
                "mandi_price_per_kg": mandi_price,
                "price_per_ton_day": s.price_per_ton_day,
                "net_estimated_payout": net_payout,
                "base_temp_c": s.base_temp_c,
            })

    # Sort by physical distance ascending, then net payout descending
    candidates.sort(key=lambda x: (x["physical_distance_km"], -x["net_estimated_payout"]))
    return candidates[:3]


@router.get("/weather")
def get_weather(district: str):
    f_lat, f_lng = DISTRICT_COORDS.get(district, (12.97, 77.59))
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={f_lat}&lon={f_lng}&units=metric&appid={settings.WEATHER_API_KEY}"
    try:
        res = requests.get(url, timeout=10).json()
        if res.get("cod") == 200:
            return {
                "temp": float(res["main"]["temp"]),
                "humidity": float(res["main"]["humidity"]),
                "wind": float(res.get("wind", {}).get("speed", 0.0)) * 3.6,
                "rain": float(res.get("rain", {}).get("1h", res.get("rain", {}).get("3h", 0.0))),
                "clouds": int(res.get("clouds", {}).get("all", 0)),
                "desc": res.get("weather", [{}])[0].get("description", "N/A").title(),
                "status": "success"
            }
        return {"temp": 25.0, "humidity": 60.0, "wind": 8.0, "rain": 0.0, "clouds": 40, "desc": "API Error", "status": "error"}
    except Exception:
        return {"temp": 25.0, "humidity": 60.0, "wind": 8.0, "rain": 0.0, "clouds": 40, "desc": "API Error", "status": "error"}


CROP_MODEL_MAPPING = {
    "Cucumber": "Capsicum",
}


def generate_dynamic_advisories(
    crop: str,
    district: str,
    storage_days: int,
    actual_transit_days: float,
    expected_transit_days: float,
    temperature: float,
    humidity: float,
    road_condition: str,
    risk_level: str,
    loss_val: float,
    prob_val: float,
    shelf_val: float,
    financial_loss: float,
    facility_name: str,
    dist_km: float,
    mandi_price: float,
) -> tuple[str, str]:
    """Generate comprehensive, tailored post-harvest advisory in both English and Kannada."""
    harvest_status = "Harvested today (Day 0)" if storage_days == 0 else f"{storage_days} days post-harvest"
    prob_pct = prob_val * 100.0

    # 1. Attempt dynamic GenAI generation with Gemini if API key is configured
    if settings.GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel('gemini-flash-lite-latest', generation_config={'response_mime_type': 'application/json'})

            prompt = f"""
You are an expert post-harvest agricultural scientist in India.
Generate a tailored post-harvest advisory for a shipment of {crop} in {district}, Karnataka.
Shipment details:
- Crop: {crop}
- Harvest status: {harvest_status}
- Transit time: {actual_transit_days:.1f} days (target: {expected_transit_days:.1f} days) via {road_condition}
- Ambient conditions: {temperature:.1f}°C, {humidity:.1f}% relative humidity
- Predicted risk: {risk_level} risk ({prob_pct:.1f}% spoilage probability, estimated volume loss: {loss_val:.1f}%)
- Estimated crop value at risk: ₹{financial_loss:,.0f}
- Recommended cold storage: {facility_name} ({dist_km:.1f} km away, extends shelf life by {shelf_val:.1f} days)
- Current local mandi benchmark price: ₹{mandi_price:.2f}/kg

Return a valid JSON object with exactly two keys: "en" and "kn".
Format requirements for "en":
Post-Harvest AI Advisory for {crop}

[2-sentence concise professional overview stating the harvest condition, spoilage probability, and financial impact]

Actionable Handling Guidelines:
- [Detailed practical handling point 1 on pre-cooling and core temperature tailored specifically to {crop}]
- [Detailed practical handling point 2 on packaging, crating ventilation, and stacking height limits for {crop}]
- [Detailed practical handling point 3 on ethylene gas separation, relative humidity, or transpiration barrier for {crop}]
- [Detailed practical handling point 4 on transit vibration dampening, physical cushioning, or sunlight protection for {crop}]

Critical Risk Factors & Degradation Triggers:
- [Short, unique point 1 on thermal stress and respiration for {crop} under {temperature:.1f}°C ambient heat]
- [Short, unique point 2 on mechanical impact or vibration damage over {road_condition}]

Immediate Recommendation:
- [Detailed point 1 on direct routing and target arrival window to {facility_name} ({dist_km:.1f} km away)]
- [Detailed point 2 on cold vault receipt staging and temperature setting to gain up to {shelf_val:.1f} days shelf life]
- [Detailed point 3 on market realization timing (benchmarking ₹{mandi_price:.2f}/kg) and off-peak dispatch]

Format requirements for "kn":
Translate the exact same tailored structure into fluent, natural, grammatically correct Kannada suited for Karnataka farmers, using proper Kannada section titles:
- Title: {crop} ಬೆಳೆಗಾಗಿ ಎಐ ಆಧಾರಿತ ಸುಗ್ಗಿಯ ನಂತರದ ಸಲಹೆ
- ಆಚರಣೆಗೆ ಯೋಗ್ಯವಾದ ನಿರ್ವಹಣಾ ಮಾರ್ಗಸೂಚಿಗಳು: (4 detailed points)
- ಪ್ರಮುಖ ಅಪಾಯಕಾರಿ ಅಂಶಗಳು ಮತ್ತು ಹಾಳಾಗಲು ಕಾರಣಗಳು: (2 short unique points)
- ತಕ್ಷಣದ ಶಿಫಾರಸು: (3 detailed points)
"""
            ai_resp = model.generate_content(prompt)
            parsed = json.loads(ai_resp.text)
            if "en" in parsed and "kn" in parsed:
                en_str = str(parsed["en"]).strip()
                kn_str = str(parsed["kn"]).strip()
                if "Actionable Handling Guidelines:" in en_str and "Critical Risk Factors" in en_str:
                    return en_str, kn_str
        except Exception as e:
            logger.info("Gemini dynamic advisory fallback triggered: %s", e)

    # 2. Rule-based expert generator (deterministic, tailored, instantaneous)
    crop_profiles = {
        "Tomato": {
            "temp_opt": "12°C–15°C",
            "rh_opt": "85%–90%",
            "guidelines": [
                "Pre-Cooling & Pulp Temperature: Remove field heat within 2 hours of harvest via shaded staging or forced-air cooling. Maintain core pulp temperature between 12°C–15°C; avoid chilling below 10°C to prevent chilling injury, flavor loss, and watery breakdown.",
                "Crating & Layer Depth: Pack exclusively in rigid, ventilated plastic crates with maximum 2–3 layers of fruit. Avoid over-filling to eliminate compressive bruising and skin punctures that trigger soft rot.",
                "Ethylene & Airflow Control: Isolate tomatoes from ethylene-sensitive leafy crops and ensure continuous ventilation to clear respiratory heat and inhibit Alternaria and Botrytis spore germination.",
                f"Transit Cushioning: Secure crates tightly with corner straps and buffer bottom rows with corrugated paper pads to absorb road vibration on {road_condition}."
            ],
            "risks": [
                f"Thermal & Respiration Stress: Ambient temperature of {temperature:.1f}°C accelerates tomato respiration and soft ripening.",
                f"Skin Rupture & Abrasion: Mechanical vibration over {road_condition} produces micro-fissures on tender pericarp skin.",
                f"Fungal Pathogen Risk: {humidity:.1f}% humidity creates an active microclimate for black mold and sour rot at contact points."
            ],
            "kn_name": "ಟೊಮೆಟೊ",
            "kn_guidelines": [
                "ಪ್ರೀ-ಕೂಲಿಂಗ್ ಮತ್ತು ತಾಪಮಾನ: ಸುಗ್ಗಿಯ ನಂತರ 2 ಗಂಟೆಗಳ ಒಳಗೆ ನೆರಳಿನಲ್ಲಿ ಇರಿಸಿ ಬಿಸಿಯನ್ನು ಕಡಿಮೆ ಮಾಡಿ. ತಾಪಮಾನವನ್ನು 12°C–15°C ನಡುವೆ ಇರಿಸಿ; 10°C ಗಿಂತ ಕಡಿಮೆ ಮಾಡಬೇಡಿ.",
                "ಕ್ರೇಟಿಂಗ್ ಮತ್ತು ಲೇಯರ್ ನಿಯಂತ್ರಣ: ಗಾಳಿಯಾಡುವ ಪ್ಲಾಸ್ಟಿಕ್ ಕ್ರೇಟ್‌ಗಳಲ್ಲಿ ಗರಿಷ್ಠ 2-3 ಪದರಗಳಲ್ಲಿ ಮಾತ್ರ ಜೋಡಿಸಿ, ತಳಭಾಗದ ಹಣ್ಣುಗಳು ಜಜ್ಜುವುದನ್ನು ತಪ್ಪಿಸಿ.",
                "ಎಥಿಲೀನ್ ಮತ್ತು ವಾತಾಯನ: ಎಥಿಲೀನ್ ಉತ್ಪಾದಿಸುವ ಹಣ್ಣುಗಳಿಂದ ಬೇರ್ಪಡಿಸಿ ಮತ್ತು ಶಿಲೀಂಧ್ರ ರೋಗಗಳನ್ನು ತಡೆಯಲು ನಿರಂತರ ಗಾಳಿಯಾಡುವಂತೆ ನೋಡಿಕೊಳ್ಳಿ.",
                f"ಸಾರಿಗೆ ರಕ್ಷಣೆ: {road_condition} ರಸ್ತೆಯಲ್ಲಿನ ಆಘಾತಗಳನ್ನು ಕಡಿಮೆ ಮಾಡಲು ಕ್ರೇಟ್‌ಗಳ ತಳಭಾಗಕ್ಕೆ ರಟ್ಟಿನ ಪ್ಯಾಡ್‌ಗಳನ್ನು ಬಳಸಿ."
            ],
            "kn_risks": [
                f"ತಾಪಮಾನ ಒತ್ತಡ: ಪ್ರಸ್ತುತ {temperature:.1f}°C ತಾಪಮಾನವು ಟೊಮೆಟೊ ಉಸಿರಾಟವನ್ನು ಹೆಚ್ಚಿಸಿ ಬೇಗನೆ ಮೆತ್ತಗಾಗಿಸುತ್ತದೆ.",
                f"ರಸ್ತೆ ಕಂಪನ ಹಾನಿ: {road_condition} ರಸ್ತೆಯ ಸಾಗಾಟದಲ್ಲಿ ಸಿಪ್ಪೆಗೆ ಗಾಯಗಳು ಮತ್ತು ಬಿರುಕುಗಳು ಉಂಟಾಗಬಹುದು.",
                f"ಶಿಲೀಂಧ್ರ ಸೋಂಕು: {humidity:.1f}% ತೇವಾಂಶವು ಗಾಯಗೊಂಡ ಸ್ಥಳಗಳಲ್ಲಿ ಕೊಳೆಯುವಿಕೆಯನ್ನು ಪ್ರಚೋದಿಸುತ್ತದೆ."
            ]
        },
        "Cucumber": {
            "temp_opt": "10°C–12.5°C",
            "rh_opt": "90%–95%",
            "guidelines": [
                "Temperature Precision: Maintain storage strictly between 10°C–12.5°C. Temperatures under 10°C induce severe water-soaked pitting (chilling injury), while heat above 15°C triggers rapid yellowing and senescence.",
                "Transpiration & Moisture Barrier: Line ventilated crates with perforated food-grade moisture film. This maintains 90%–95% RH to preserve turgor pressure and crunchiness while preventing free condensation.",
                "Strict Ethylene Segregation: Cucumbers are hyper-sensitive to ethylene gas; never co-transport or store alongside ripening tomatoes, bananas, or apples, which trigger rapid degreening and bitter off-flavors.",
                f"Surface Protection: Handle with clean cotton gloves and pad crate walls with corrugated paper liners to prevent skin scratches during transit across {road_condition}."
            ],
            "risks": [
                f"Moisture Loss & Shriveling: High water content (96%) causes rapid moisture transpirational loss under {temperature:.1f}°C ambient air.",
                f"Friction & Surface Pitting: Rough transit over {road_condition} causes surface abrasions that accelerate microbial infection.",
                f"Chilling & Yellowing Sensitivity: Highly intolerant to thermal swings outside the 10°C–13°C safe preservation window."
            ],
            "kn_name": "ಸೌತೆಕಾಯಿ",
            "kn_guidelines": [
                "ನಿಖರ ತಾಪಮಾನ ನಿರ್ವಹಣೆ: ತಾಪಮಾನವನ್ನು ಕಟ್ಟುನಿಟ್ಟಾಗಿ 10°C–12.5°C ನಡುವೆ ಕಾಪಾಡಿಕೊಳ್ಳಿ. 10°C ಗಿಂತ ಕಡಿಮೆ ತಾಪಮಾನವು ಗುಳಿ ಬೀಳುವಿಕೆಗೆ ಕಾರಣವಾಗುತ್ತದೆ, 15°C ಗಿಂತ ಹೆಚ್ಚು ಹಳದಿಯಾಗುವಿಕೆಯನ್ನು ಉಂಟುಮಾಡುತ್ತದೆ.",
                "ತೇವಾಂಶ ಮತ್ತು ಬಿಗಿತ ರಕ್ಷಣೆ: ಸೌತೆಕಾಯಿಯ ನೀರಿನ ನಷ್ಟ ಮತ್ತು ಮುದುಡುವಿಕೆಯನ್ನು ತಡೆಯಲು ರಂಧ್ರವಿರುವ ಪ್ಲಾಸ್ಟಿಕ್ ಲೈನರ್‌ಗಳೊಂದಿಗೆ ಕ್ರೇಟ್‌ಗಳನ್ನು ಬಳಸಿ.",
                "ಎಥಿಲೀನ್ ಅನಿಲದಿಂದ ಪ್ರತ್ಯೇಕತೆ: ಟೊಮೆಟೊ, ಬಾಳೆಹಣ್ಣಿನಂತಹ ಎಥಿಲೀನ್ ಹೊರಸೂಸುವ ಬೆಳೆಗಳೊಂದಿಗೆ ಎಂದಿಗೂ ಸಾಗಿಸಬೇಡಿ; ಇದು ಹಳದಿಯಾಗುವಿಕೆ ಮತ್ತು ಕಹಿ ರುಚಿಗೆ ಕಾರಣವಾಗುತ್ತದೆ.",
                f"ಸಿಪ್ಪೆಯ ರಕ್ಷಣೆ: {road_condition} ರಸ್ತೆಯ ಸಾಗಾಟದಲ್ಲಿ ಗಾಯವಾಗದಂತೆ ಕ್ರೇಟ್‌ಗಳ ಒಳಭಾಗಕ್ಕೆ ಮೆತ್ತನೆಯ ಲೈನಿಂಗ್ ಹಾಕಿ."
            ],
            "kn_risks": [
                f"ತೇವಾಂಶ ನಷ್ಟ: {temperature:.1f}°C ತಾಪಮಾನದಲ್ಲಿ ಸೌತೆಕಾಯಿಯ 96% ನೀರಿನ ಅಂಶವು ಬೇಗನೆ ಆವಿಯಾಗಿ ಮೆತ್ತಗಾಗುತ್ತದೆ.",
                f"ರಸ್ತೆ ಘರ್ಷಣೆ: {road_condition} ರಸ್ತೆಯಲ್ಲಿನ ಕುಲುಕಾಟದಿಂದ ಸಿಪ್ಪೆಯ ಮೇಲೆ ಗೀರುಗಳು ಉಂಟಾಗುತ್ತವೆ.",
                f"ತಾಪಮಾನ ಸೂಕ್ಷ್ಮತೆ: 10°C–13°C ತಾಪಮಾನದ ವ್ಯಾಪ್ತಿಯಿಂದ ಹೊರಗಿನ ಏರುಪೇರುಗಳನ್ನು ತಡೆಯಲಾರದು."
            ]
        },
        "Potato": {
            "temp_opt": "7°C–10°C",
            "rh_opt": "90%–95%",
            "guidelines": [
                "Darkness & Solanine Prevention: Store in complete darkness to prevent chlorophyll synthesis and poisonous solanine accumulation (tuber greening).",
                "Wound Curing (Suberization): Hold newly harvested tubers at 15°C–18°C with 90% RH for 5–7 days for wound healing and periderm thickening before lowering to cold storage temperature.",
                "Controlled Cooling: Lower temperature gradually to 7°C–10°C for table potatoes to avoid cold-induced sweetening; maintain forced-air ventilation to suppress early sprouting.",
                f"Drop & Impact Cushioning: Limit drop heights to under 30 cm during loading and pad vehicle floors with straw or foam mats to eliminate shatter bruises on {road_condition}."
            ],
            "risks": [
                f"Respiratory Heat & Sprouting: Ambient temperatures ({temperature:.1f}°C) accelerate tuber respiration and trigger premature sprout emergence.",
                f"Impact Shatter Bruising: Mechanical shock on {road_condition} causes internal blackspot bruising without external signs.",
                f"Moisture Condensation: Relative humidity at {humidity:.1f}% without proper airflow risks bacterial soft rot."
            ],
            "kn_name": "ಆಲೂಗಡ್ಡೆ",
            "kn_guidelines": [
                "ಕತ್ತಲ ಕೋಣೆ ಸಂಗ್ರಹಣೆ: ಹಸಿರು ಬಣ್ಣಕ್ಕೆ ತಿರುಗುವುದನ್ನು ಮತ್ತು ಸೋಲನೈನ್ ವಿಷಕಾರಿ ಅಂಶ ಸಂಗ್ರಹವಾಗುವುದನ್ನು ತಡೆಯಲು ಕತ್ತಲೆಯಾದ ಕೋಣೆಯಲ್ಲಿ ಸಂಗ್ರಹಿಸಿ.",
                "ಗಾಯ ಮಾಗುವಿಕೆ (ಕ್ಯೂರಿಂಗ್): ಶೈತ್ಯಾಗಾರಕ್ಕೆ ಹಾಕುವ ಮೊದಲು ಗೆಡ್ಡೆಗಳನ್ನು 5-7 ದಿನಗಳ ಕಾಲ 15°C–18°C ತಾಪಮಾನದಲ್ಲಿ ಗಾಯ ಮಾಗಲು ಬಿಡಿ.",
                "ಮೊಳಕೆ ನಿಯಂತ್ರಣ: ತಿನ್ನುವ ಆಲೂಗಡ್ಡೆಯನ್ನು 7°C–10°C ತಾಪಮಾನದಲ್ಲಿ ನಿರಂತರ ಗಾಳಿಯಾಡುವಂತೆ ಇರಿಸಿ ಮೊಳಕೆಯೊಡೆಯುವುದನ್ನು ತಡೆಯಿರಿ.",
                f"ಆಘಾತ ರಕ್ಷಣೆ: ಲೋಡಿಂಗ್ ಸಮಯದಲ್ಲಿ ಎತ್ತರದಿಂದ ಎಸೆಯಬೇಡಿ ಮತ್ತು {road_condition} ರಸ್ತೆಯ ಸಾಗಾಟದಲ್ಲಿ ಗಾಯವಾಗದಂತೆ ವಾಹನದ ನೆಲಕ್ಕೆ ಮೆತ್ತನೆಯ ಹುಲ್ಲು ಹಾಸಿ."
            ],
            "kn_risks": [
                f"ಉಸಿರಾಟ ಮತ್ತು ಮೊಳಕೆ: {temperature:.1f}°C ತಾಪಮಾನವು ಆಲೂಗಡ್ಡೆಯ ಉಸಿರಾಟವನ್ನು ಹೆಚ್ಚಿಸಿ ಅಕಾಲಿಕ ಮೊಳಕೆಗೆ ಕಾರಣವಾಗುತ್ತದೆ.",
                f"ಆಂತರಿಕ ಜಜ್ಜುವಿಕೆ: {road_condition} ರಸ್ತೆಯಲ್ಲಿನ ಆಘಾತಗಳು ಕಣ್ಣಿಗೆ ಕಾಣದ ಆಂತರಿಕ ಕಪ್ಪು ಕಲೆಗಳಿಗೆ ಕಾರಣವಾಗುತ್ತವೆ.",
                f"ತೇವಾಂಶ ಅಪಾಯ: ಸರಿಯಾದ ಗಾಳಿಯಾಡದಿದ್ದಲ್ಲಿ {humidity:.1f}% ತೇವಾಂಶವು ಬ್ಯಾಕ್ಟೀರಿಯಲ್ ಕೊಳೆತಕ್ಕೆ ಕಾರಣವಾಗುತ್ತದೆ."
            ]
        },
        "Onion": {
            "temp_opt": "0°C–4°C (or ambient dry 20°C–25°C)",
            "rh_opt": "65%–70%",
            "guidelines": [
                "Complete Neck Curing: Ensure outer tunic scales and necks are fully cured and dry before bagging; damp necks are the primary entry point for neck rot (Botrytis allii).",
                "Low Relative Humidity: Keep relative humidity strictly at 65%–70%; humidity above 75% triggers root growth and black mold (Aspergillus niger).",
                "Mesh Airflow Packaging: Pack exclusively in open-mesh polypropylene or jute sacks on raised wooden pallets, maintaining 15 cm clearance from walls for continuous convective airflow.",
                "Avoid Wet Produce: Never store onions near high-moisture vegetables (cucumbers, tomatoes) or in plastic bags that trap respiratory water."
            ],
            "risks": [
                f"High Humidity Decay: At {humidity:.1f}% humidity, onions absorb moisture, rapidly inducing neck rot and mold.",
                f"Friction & Scale Peeling: Vibration on {road_condition} strips protective outer scales, exposing inner tissues.",
                f"Sprouting under Enclosed Heat: Inadequate ventilation at {temperature:.1f}°C triggers internal root and sprout emergence."
            ],
            "kn_name": "ಈರುಳ್ಳಿ",
            "kn_guidelines": [
                "ಕತ್ತಿನ ಭಾಗ ಒಣಗಿಸುವಿಕೆ: ಚೀಲಗಳಲ್ಲಿ ತುಂಬುವ ಮುನ್ನ ಈರುಳ್ಳಿಯ ಕತ್ತಿನ ಭಾಗ ಮತ್ತು ಹೊರ ಸಿಪ್ಪೆ ಸಂಪೂರ್ಣವಾಗಿ ಒಣಗಿರಬೇಕು.",
                "ಕಡಿಮೆ ತೇವಾಂಶ ನಿರ್ವಹಣೆ: ತೇವಾಂಶವನ್ನು ಶೇ. 65-70 ರೊಳಗೆ ಇರಿಸಿ; ಶೇ. 75 ಕ್ಕಿಂತ ಹೆಚ್ಚಾದರೆ ಕಪ್ಪು ಬೂಸ್ಟು ಮತ್ತು ಬೇರುಗಳು ಬರುತ್ತವೆ.",
                "ಮೆಶ್ ಬ್ಯಾಗ್ ಬಳಕೆ: ಗಾಳಿಯಾಡುವ ನೈಲಾನ್ ಅಥವಾ ಗೋಣಿ ಚೀಲಗಳಲ್ಲಿ ತುಂಬಿ ಮರದ ಹಲಗೆಗಳ ಮೇಲೆ ಗೋಡೆಯಿಂದ 15 ಸೆಂ.ಮೀ ದೂರದಲ್ಲಿ ಇರಿಸಿ.",
                "ತೇವದ ಬೆಳೆಗಳಿಂದ ಪ್ರತ್ಯೇಕತೆ: ನೀರಿನಾಂಶ ಹೆಚ್ಚಿರುವ ತರಕಾರಿಗಳೊಂದಿಗೆ ಅಥವಾ ಪ್ಲಾಸ್ಟಿಕ್ ಚೀಲಗಳಲ್ಲಿ ಎಂದಿಗೂ ಇಡಬೇಡಿ."
            ],
            "kn_risks": [
                f"ಹೆಚ್ಚಿನ ತೇವಾಂಶದ ಕೊಳೆತ: {humidity:.1f}% ತೇವಾಂಶದಲ್ಲಿ ಈರುಳ್ಳಿ ನೀರನ್ನು ಹೀರಿಕೊಂಡು ಕತ್ತಿನ ಕೊಳೆತಕ್ಕೆ ಒಳಗಾಗುತ್ತದೆ.",
                f"ಸಿಪ್ಪೆ ಸುಲಿಯುವಿಕೆ: {road_condition} ರಸ್ತೆಯ ಸಾಗಾಟದಲ್ಲಿ ರಕ್ಷಣಾತ್ಮಕ ಹೊರ ಸಿಪ್ಪೆ ಸುಲಿದು ಒಳಭಾಗಕ್ಕೆ ಹಾನಿಯಾಗುತ್ತದೆ.",
                f"ಸೆಕೆ ಮತ್ತು ಮೊಳಕೆ: ಗಾಳಿಯಾಡದ {temperature:.1f}°C ಸೆಕೆಯು ಒಳಗೆ ಮೊಳಕೆಯೊಡೆಯುವುದನ್ನು ಪ್ರಚೋದಿಸುತ್ತದೆ."
            ]
        }
    }

    prof = crop_profiles.get(crop, {
        "temp_opt": "10°C–15°C",
        "rh_opt": "85%–90%",
        "guidelines": [
            "Pre-Cooling & Core Temperature: Remove field heat rapidly after harvest. Maintain holding temperature at 10°C–15°C to preserve cellular firmness.",
            "Crating & Stacking Limit: Use rigid, ventilated crates with restricted stacking height to prevent bottom layer crush damage.",
            "Gas & Air Circulation: Ensure adequate convective airflow across pallets to remove metabolic heat and CO2 buildup.",
            f"Transit Cushioning: Buffer bottom and side crate layers with corrugated sheets to isolate shock during transit across {road_condition}."
        ],
        "risks": [
            f"Thermal & Ambient Stress: Current ambient temperature ({temperature:.1f}°C) elevates respiration rate.",
            f"Road Vibration Impact: Continuous vibration on {road_condition} causes mechanical abrasion and surface scuffing."
        ],
        "kn_name": crop,
        "kn_guidelines": [
            "ಪ್ರೀ-ಕೂಲಿಂಗ್ ಮತ್ತು ತಾಪಮಾನ: ಸುಗ್ಗಿಯ ನಂತರ ಹೊಲದ ಸೆಕೆಯನ್ನು ತಕ್ಷಣವೇ ಕಡಿಮೆ ಮಾಡಿ, ತಾಪಮಾನವನ್ನು 10°C–15°C ನಡುವೆ ಕಾಪಾಡಿಕೊಳ್ಳಿ.",
            "ಕ್ರೇಟಿಂಗ್ ಮತ್ತು ಸುರಕ್ಷಿತ ಜೋಡಣೆ: ಗಾಳಿಯಾಡುವ ಗಟ್ಟಿಮುಟ್ಟಾದ ಕ್ರೇಟ್‌ಗಳನ್ನು ಬಳಸಿ, ತಳಭಾಗದ ಹಣ್ಣುಗಳು ಜಜ್ಜದಂತೆ ಜೋಡಿಸಿ.",
            "ವಾತಾಯನ ಮತ್ತು ಗಾಳಿಯ ಚಲನೆ: ಶಾಖ ಮತ್ತು ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಸಂಗ್ರಹವಾಗದಂತೆ ನಿರಂತರ ಗಾಳಿಯಾಡುವಂತೆ ನೋಡಿಕೊಳ್ಳಿ.",
            f"ಸಾರಿಗೆ ರಕ್ಷಣೆ: {road_condition} ರಸ್ತೆಯ ಸಾಗಾಟದಲ್ಲಿ ಗಾಯವಾಗದಂತೆ ವಾಹನದಲ್ಲಿ ಸೂಕ್ತ ಮೆತ್ತನೆ ಬಳಸಿ."
        ],
        "kn_risks": [
            f"ತಾಪಮಾನ ಒತ್ತಡ: ಪ್ರಸ್ತುತ {temperature:.1f}°C ತಾಪಮಾನವು ಬೆಳೆಯ ಉಸಿರಾಟವನ್ನು ಹೆಚ್ಚಿಸುತ್ತದೆ.",
            f"ರಸ್ತೆ ಕಂಪನ ಹಾನಿ: {road_condition} ರಸ್ತೆಯಲ್ಲಿನ ಕಂಪನಗಳಿಂದ ಸಿಪ್ಪೆಗೆ ಹಾನಿಯಾಗಬಹುದು."
        ]
    })

    kn_crop = prof["kn_name"]
    kn_risk_map = {"HIGH": "ಅತಿ ಹೆಚ್ಚು", "MEDIUM": "ಮಧ್ಯಮ", "LOW": "ಕಡಿಮೆ"}
    kn_risk = kn_risk_map.get(risk_level, risk_level)
    kn_harvest_status = "ಇಂದೇ ಕಟಾವು ಮಾಡಲಾಗಿದೆ (ದಿನ 0)" if storage_days == 0 else f"ಕಟಾವಿನ ನಂತರ {storage_days} ದಿನಗಳು ಕಳೆದಿವೆ"

    en_advisory = f"""Post-Harvest AI Advisory for {crop}

Your {crop.lower()} shipment is currently in {risk_level} risk status ({prob_pct:.1f}% spoilage probability, estimated volume loss: {loss_val:.1f}%), {harvest_status}. Following tailored cold-chain handling will safeguard ₹{financial_loss:,.0f} in crop equity and extend marketability.

Actionable Handling Guidelines:
""" + "\n".join([f"- {g}" for g in prof["guidelines"]]) + f"""

Critical Risk Factors & Degradation Triggers:
""" + "\n".join([f"- {r}" for r in prof["risks"]]) + f"""

Immediate Recommendation:
- Facility Dispatch: Route shipment directly to {facility_name} ({dist_km:.1f} km away via {road_condition}), targeting arrival within optimal transit window.
- Cold Vault Setup: Request cold chamber set-point at {prof['temp_opt']} with {prof['rh_opt']} relative humidity; this will extend shelf life by up to {shelf_val:.1f} days.
- Market Realization: With local mandi prices currently trading around ₹{mandi_price:.2f}/kg, staging in cold storage preserves grade-A firmness for optimal market dispatch.
"""

    kn_advisory = f"""{kn_crop} ಬೆಳೆಗಾಗಿ ಎಐ ಆಧಾರಿತ ಸುಗ್ಗಿಯ ನಂತರದ ಸಲಹೆ

ನಿಮ್ಮ {kn_crop} ಫಸಲು ಪ್ರಸ್ತುತ {kn_risk} ಕೊಳೆತ ಅಪಾಯದಲ್ಲಿದೆ ({prob_pct:.1f}% ಸಂಭವನೀಯತೆ, ಅಂದಾಜು ನಷ್ಟ: {loss_val:.1f}%), {kn_harvest_status}. ಸೂಕ್ತವಾದ ಶೈತ್ಯೀಕರಣ ಮತ್ತು ಸಾಗಾಣಿಕೆ ಕ್ರಮಗಳನ್ನು ಪಾಲಿಸುವುದರಿಂದ ₹{financial_loss:,.0f} ಮೌಲ್ಯದ ಬೆಳೆ ರಕ್ಷಣೆಯಾಗುತ್ತದೆ.

ಆಚರಣೆಗೆ ಯೋಗ್ಯವಾದ ನಿರ್ವಹಣಾ ಮಾರ್ಗಸೂಚಿಗಳು:
""" + "\n".join([f"- {g}" for g in prof["kn_guidelines"]]) + f"""

ಪ್ರಮುಖ ಅಪಾಯಕಾರಿ ಅಂಶಗಳು ಮತ್ತು ಹಾಳಾಗಲು ಕಾರಣಗಳು:
""" + "\n".join([f"- {r}" for r in prof["kn_risks"]]) + f"""

ತಕ್ಷಣದ ಶಿಫಾರಸು:
- ರವಾನೆ ಮಾರ್ಗ: ನಿಮ್ಮ ಬೆಳೆಯನ್ನು ತಕ್ಷಣವೇ {facility_name} ({dist_km:.1f} km ದೂರದಲ್ಲಿದೆ, {road_condition} ಮೂಲಕ) ಗೆ ನಿಗದಿತ ಸಮಯದಲ್ಲಿ ತಲುಪಿಸಿ.
- ಕೋಲ್ಡ್ ವಾಲ್ಟ್ ಸೆಟಪ್: ಕೋಲ್ಡ್ ರೂಮ್ ತಾಪಮಾನವನ್ನು {prof['temp_opt']} ಮತ್ತು {prof['rh_opt']} ತೇವಾಂಶದಲ್ಲಿ ಕಾಯ್ದಿರಿಸಿ, ಇದರಿಂದ ಜೀವಿತಾವಧಿ {shelf_val:.1f} ದಿನಗಳವರೆಗೆ ಹೆಚ್ಚಾಗುತ್ತದೆ.
- ಮಾರುಕಟ್ಟೆ ಆದಾಯ: ಪ್ರಸ್ತುತ ಮಾರುಕಟ್ಟೆ ದರ ₹{mandi_price:.2f}/ಕೆಜಿ ಇರುವುದರಿಂದ, ಮುಂಜಾನೆ ಅಥವಾ ಸಂಜೆಯ ತಂಪಾದ ಸಮಯದಲ್ಲಿ ಸಾಗಾಟ ಮಾಡುವುದರಿಂದ ಬೆಳೆಯ ಗುಣಮಟ್ಟ ಮತ್ತು ಗರಿಷ್ಠ ಲಾಭ ಖಚಿತವಾಗುತ್ತದೆ.
"""

    return en_advisory.strip(), kn_advisory.strip()


@router.post("/", response_model=PredictionResponse, status_code=201)
def create_prediction(
    payload: PredictionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run the ML spoilage prediction model and store the result."""
    artifacts = _load_artifacts()
    if not artifacts:
        raise HTTPException(status_code=500, detail="ML model artifacts not found.")
    if isinstance(artifacts, str):
        raise HTTPException(status_code=500, detail=artifacts)

    if payload.crop not in CROP_MASTER:
        raise HTTPException(status_code=400, detail=f"Unknown crop: {payload.crop}")
    if payload.district not in DISTRICT_COORDS:
        raise HTTPException(status_code=400, detail=f"Unknown district: {payload.district}")

    f_lat, f_lng = DISTRICT_COORDS[payload.district]

    # Find top facilities
    top_facilities_dicts = _get_top_3_facilities(f_lat, f_lng, db, payload.crop, payload.quantity_tons, payload.road_condition)
    
    facility_name = top_facilities_dicts[0]["facility_name"] if top_facilities_dicts else "Unknown"
    dist_km = top_facilities_dicts[0]["physical_distance_km"] if top_facilities_dicts else 0.0
    mandi_price = top_facilities_dicts[0]["mandi_price_per_kg"] if top_facilities_dicts else get_crop_mandi_price(payload.crop, payload.district)
    cs_lat = top_facilities_dicts[0]["latitude"] if top_facilities_dicts else None
    cs_lng = top_facilities_dicts[0]["longitude"] if top_facilities_dicts else None

    # Compute derived features (same logic as the Streamlit page)
    from datetime import datetime
    month = datetime.now().month
    q10 = CROP_MASTER[payload.crop][3]
    respiration_acc = q10 ** ((payload.temperature - 20.0) / 10.0)

    speed_map = {"National Highway": 60.0, "State Highway": 40.0, "Rural / Unpaved Road": 20.0}
    vibration_map = {"National Highway": 1.0, "State Highway": 1.3, "Rural / Unpaved Road": 2.5}

    current_speed = speed_map.get(payload.road_condition, 40.0)
    vibration_idx = vibration_map.get(payload.road_condition, 1.0)

    # For same-day harvest (storage_days == 0), transit is current/on-schedule
    eff_actual_transit = payload.actual_transit_days
    eff_expected_transit = payload.expected_transit_days
    if payload.storage_days == 0:
        eff_actual_transit = min(eff_actual_transit, 1.0)
        eff_expected_transit = max(eff_expected_transit, eff_actual_transit)
    elif eff_expected_transit <= 0:
        eff_expected_transit = 1.0

    hei = (payload.temperature * (
        payload.storage_days + (eff_actual_transit * (vibration_idx - 1.0))
    )) * respiration_acc
    hl = payload.humidity * payload.storage_days
    tdr = eff_actual_transit / eff_expected_transit if eff_expected_transit > 0 else 1.0
    mci = payload.arrival_volume / payload.avg_market_volume
    sri = SRI_MONTHLY.get(month, 0.5)

    est_transit_hours = dist_km / current_speed if current_speed > 0 else 1.0
    total_shelf_hours = CROP_MASTER[payload.crop][0] * 24.0
    time_window_index = total_shelf_hours / (est_transit_hours + 1e-5)
    price_vol_index = 1.0

    try:
        target_crop = CROP_MODEL_MAPPING.get(payload.crop, payload.crop)
        try:
            c_enc = artifacts['le_crop'].transform([target_crop])[0]
        except ValueError:
            # Fallback for unseen crops in the original model
            c_enc = artifacts['le_crop'].transform(["Capsicum"])[0]
            
        d_enc = artifacts['le_district'].transform([payload.district])[0]
        X_raw = np.array([[
            c_enc, d_enc, payload.storage_days, hei, hl, tdr, mci, sri
        ]])
        X_scaled = artifacts['scaler'].transform(X_raw)
        prob_val = float(artifacts['ensemble_clf'].predict_proba(X_scaled)[0][1])
        loss_val = max(0.0, float(artifacts['loss_regressor'].predict(X_scaled)[0]))
        shelf_val = max(0.0, float(artifacts['shelf_regressor'].predict(X_scaled)[0]))
        
        if payload.picture_spoilage_prob is not None:
            # Reflect visible spoilage if detected from image
            if payload.picture_spoilage_prob > prob_val:
                prob_val = max(prob_val, payload.picture_spoilage_prob)
            prob_val = max(0.0, min(1.0, prob_val))
            
    except Exception as e:
        logger.warning("ML prediction inference encountered error (%s), using baseline estimates", e, exc_info=True)
        prob_val, loss_val, shelf_val = 0.384, 4.8, 5.2

    risk_level = "HIGH" if prob_val > 0.6 else "MEDIUM" if prob_val > 0.3 else "LOW"

    # Physically grounded volume loss percentage calibration:
    # - Low Risk (prob < 0.3): 0.8% to 2.5% loss (routine handling shrinkage & minor sorting)
    # - Medium Risk (0.3 <= prob <= 0.6): 2.5% to 7.0% loss (incipient softening & partial cull)
    # - High Risk (prob > 0.6): 7.5% to 18.0%+ loss (active decay & fungal tissue breakdown)
    if prob_val < 0.3:
        calibrated_loss = 0.8 + (1.7 * (prob_val / 0.3))
    elif prob_val <= 0.6:
        calibrated_loss = 2.5 + (4.5 * ((prob_val - 0.3) / 0.3))
    else:
        calibrated_loss = 7.0 + (min(loss_val, 15.0) * ((prob_val - 0.6) / 0.4))

    loss_val = round(max(0.5, min(calibrated_loss, 100.0)), 2)

    # Use the crop's actual mandi market rate per ton (from the specific crop and district mandi)
    actual_crop_mandi_price = mandi_price if (mandi_price and mandi_price > 0) else get_crop_mandi_price(payload.crop, payload.district)
    crop_price_per_ton = actual_crop_mandi_price * 1000.0
    financial_loss = round((loss_val / 100.0) * payload.quantity_tons * crop_price_per_ton, 2)

    prediction = Prediction(
        user_id=current_user.id,
        crop=payload.crop,
        district=payload.district,
        temperature=payload.temperature,
        humidity=payload.humidity,
        road_condition=payload.road_condition,
        actual_transit_days=eff_actual_transit,
        expected_transit_days=eff_expected_transit,
        storage_days=payload.storage_days,
        quantity_tons=payload.quantity_tons,
        arrival_volume=payload.arrival_volume,
        avg_market_volume=payload.avg_market_volume,
        spoilage_probability=prob_val,
        image_data=payload.image_data,
        shelf_life_days=shelf_val,
        loss_percentage=loss_val,
        financial_loss=financial_loss,
        risk_level=risk_level,
        recommended_facility=facility_name,
        facility_distance_km=dist_km,
        mandi_price_per_kg=mandi_price,
        f_lat=f_lat,
        f_lng=f_lng,
        cs_lat=cs_lat,
        cs_lng=cs_lng,
    )
    try:
        db.add(prediction)
        db.commit()
        db.refresh(prediction)
    except SQLAlchemyError as db_err:
        db.rollback()
        logger.error("Database error while saving prediction for user %s: %s", current_user.id, db_err, exc_info=True)
        raise HTTPException(status_code=500, detail="Database error while saving prediction.")
    except Exception as general_err:
        db.rollback()
        logger.error("Unexpected error saving prediction: %s", general_err, exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while saving prediction.")

    # Convert prediction to dict and add top_facilities and mock transcripts
    resp_data = PredictionResponse.model_validate(prediction).model_dump()
    resp_data["top_facilities"] = top_facilities_dicts

    en_text, kn_text = generate_dynamic_advisories(
        crop=payload.crop,
        district=payload.district,
        storage_days=payload.storage_days,
        actual_transit_days=eff_actual_transit,
        expected_transit_days=eff_expected_transit,
        temperature=payload.temperature,
        humidity=payload.humidity,
        road_condition=payload.road_condition,
        risk_level=risk_level,
        loss_val=loss_val,
        prob_val=prob_val,
        shelf_val=shelf_val,
        financial_loss=financial_loss,
        facility_name=facility_name,
        dist_km=dist_km,
        mandi_price=mandi_price,
    )

    resp_data["advisory_transcript_en"] = en_text
    resp_data["advisory_transcript_kn"] = kn_text

    return resp_data


@router.get("/", response_model=PredictionListResponse)
def list_predictions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    crop: str = Query(None),
    district: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get paginated prediction history for the current user."""
    query = db.query(Prediction).filter(Prediction.user_id == current_user.id)

    if crop:
        query = query.filter(Prediction.crop == crop)
    if district:
        query = query.filter(Prediction.district == district)

    total = query.count()
    predictions = (
        query.order_by(Prediction.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PredictionListResponse(
        predictions=[PredictionResponse.model_validate(p) for p in predictions],
        total=total,
        page=page,
        page_size=page_size,
    )

@router.get("/analytics")
def get_prediction_analytics(
    crop: str = Query(None),
    district: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get aggregated prediction analytics for the current user."""
    query = db.query(Prediction).filter(Prediction.user_id == current_user.id)

    if crop:
        query = query.filter(Prediction.crop == crop)
    if district:
        query = query.filter(Prediction.district == district)

    import random
    
    # Fetch all matching records (ordered by created_at ascending for the trend line)
    predictions = query.order_by(Prediction.created_at.asc()).all()

    # Add a tiny bit of organic jitter so identical predictions don't form a perfectly flat line
    spoilage_trends = []
    for p in predictions:
        base_val = p.spoilage_probability * 100
        jitter = random.uniform(-1.5, 1.5)
        trend_val = max(0.0, min(100.0, base_val + jitter))
        spoilage_trends.append(trend_val)
    
    risk_distribution = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    loss_by_crop = {}
    
    for p in predictions:
        risk = p.risk_level or "LOW"
        risk_distribution[risk] = risk_distribution.get(risk, 0) + 1
        loss_by_crop[p.crop] = loss_by_crop.get(p.crop, 0) + p.financial_loss

    return {
        "spoilage_trends": spoilage_trends,
        "risk_distribution": risk_distribution,
        "loss_by_crop": loss_by_crop
    }



@router.get("/{prediction_id}", response_model=PredictionResponse)
def get_prediction(
    prediction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single prediction by ID."""
    prediction = db.query(Prediction).filter(
        Prediction.id == prediction_id,
        Prediction.user_id == current_user.id,
    ).first()

    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found.")

    return PredictionResponse.model_validate(prediction)


def _write_temp_file(path: str, data: bytes):
    with open(path, 'wb') as f:
        f.write(data)


@router.post("/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    temp_path = None
    try:
        contents = await file.read()
        if not contents or len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded image file is empty.")

        fd, temp_path = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)
        
        await asyncio.to_thread(_write_temp_file, temp_path, contents)

        # 1. Primary path: In-process inference using ONNX Runtime (low memory, high speed)
        try:
            from utils.quality_predictor import predict_quality
            def _run_in_process():
                with open(temp_path, "rb") as f:
                    return predict_quality(f)
            crop_name, quality, confidence, fresh_pct, rotten_pct = await asyncio.to_thread(_run_in_process)
            return {
                "crop_name": crop_name,
                "quality": quality,
                "confidence": confidence,
                "fresh_pct": fresh_pct,
                "rotten_pct": rotten_pct
            }
        except Exception as in_proc_err:
            # 2. Fallback path: Process-isolated execution via run_predictor.py
            candidates = [
                Path(sys.executable),
                BASE_DIR / ".venv" / "Scripts" / "python.exe",
                BASE_DIR / "venv" / "Scripts" / "python.exe",
                BASE_DIR / ".venv" / "bin" / "python",
                BASE_DIR / "venv" / "bin" / "python",
            ]
            predictor_python = str(sys.executable)
            for candidate in candidates:
                if candidate.exists():
                    predictor_python = str(candidate)
                    break

            script_path = str(BASE_DIR / "utils" / "run_predictor.py")

            def _run_subprocess():
                return subprocess.run(
                    [predictor_python, script_path, temp_path],
                    capture_output=True,
                    text=True,
                    check=False
                )

            res = await asyncio.to_thread(_run_subprocess)
            stdout_str = res.stdout
            stderr_str = res.stderr

            if res.returncode != 0:
                raise Exception(f"Inference failed (in-proc: {in_proc_err}, subproc code {res.returncode}): {stderr_str}")

            # Find the last line of stdout that looks like JSON
            lines = [line.strip() for line in stdout_str.split('\n') if line.strip()]
            json_str = None
            for line in reversed(lines):
                if line.startswith('{') and line.endswith('}'):
                    json_str = line
                    break

            if not json_str:
                raise Exception(f"No JSON output found in stdout: {stdout_str}")

            data = json.loads(json_str)
            if "error" in data:
                raise Exception(data["error"])

            return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {str(e)}")
    finally:
        # Clean up temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

VOICE_DISTRICT_ALIASES = {
    "bangalore urban": "Bengaluru Urban", "bengaluru urban": "Bengaluru Urban",
    "bangalore rural": "Bengaluru Rural", "bengaluru rural": "Bengaluru Rural",
    "bangalore": "Bengaluru Urban", "bengaluru": "Bengaluru Urban",
    "mysore": "Mysuru", "mysuru": "Mysuru", "bellary": "Ballari", "ballari": "Ballari",
    "belgaum": "Belagavi", "belagavi": "Belagavi", "bijapur": "Vijayapura", "vijayapura": "Vijayapura",
    "vijayapur": "Vijayapura", "gulbarga": "Kalaburagi", "kalaburagi": "Kalaburagi",
    "shimoga": "Shivamogga", "shivamogga": "Shivamogga", "mangalore": "Dakshina Kannada",
    "mangaluru": "Dakshina Kannada", "dakshina kannada": "Dakshina Kannada",
    "south canara": "Dakshina Kannada", "karwar": "Uttara Kannada", "uttara kannada": "Uttara Kannada",
    "north canara": "Uttara Kannada", "hubli": "Dharwad", "hubballi": "Dharwad",
    "dharwad": "Dharwad", "chikkaballapur": "Chikkaballapur", "chikkaballapura": "Chikkaballapur",
    "chamarajanagar": "Chamarajanagar", "chamarajanagara": "Chamarajanagar",
    "tumkur": "Tumakuru", "tumakuru": "Tumakuru", "madikeri": "Kodagu", "coorg": "Kodagu", "kodagu": "Kodagu",
    "bagalkot": "Bagalkot", "bidar": "Bidar", "chitradurga": "Chitradurga", "davangere": "Davangere",
    "gadag": "Gadag", "hassan": "Hassan", "haveri": "Haveri", "kolar": "Kolar", "koppal": "Koppal",
    "mandya": "Mandya", "raichur": "Raichur", "ramanagara": "Ramanagara", "ramanagar": "Ramanagara",
    "udupi": "Udupi", "vijayanagar": "Vijayanagar", "vijayanagara": "Vijayanagar", "yadgir": "Yadgir"
}

VOICE_CROP_SYNONYMS = {
    "tomato": "Tomato", "tomatoes": "Tomato", "tamatar": "Tomato", "thakkali": "Tomato",
    "potato": "Potato", "potatoes": "Potato", "aloo": "Potato", "alu": "Potato", "alugadde": "Potato",
    "onion": "Onion", "onions": "Onion", "pyaz": "Onion", "pyaaz": "Onion", "kanda": "Onion", "eerulli": "Onion",
    "cucumber": "Cucumber", "cucumbers": "Cucumber", "kheera": "Cucumber", "southekai": "Cucumber"
}

VOICE_NUMBER_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
    "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
    "eighty": 80, "ninety": 90, "hundred": 100
}

def parse_voice_command_text(text: str) -> dict:
    import re
    clean = re.sub(r'[,:;!?]', ' ', text.lower())
    clean = re.sub(r'\.(?!\d)', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()

    extracted_crop = None
    for syn, std in VOICE_CROP_SYNONYMS.items():
        if re.search(rf'\b{syn}\b', clean):
            extracted_crop = std
            break
    if not extracted_crop:
        for c in CROP_MASTER.keys():
            if c.lower() in clean:
                extracted_crop = c
                break

    extracted_district = None
    for alias in sorted(VOICE_DISTRICT_ALIASES.keys(), key=len, reverse=True):
        if re.search(rf'\b{alias}\b', clean):
            extracted_district = VOICE_DISTRICT_ALIASES[alias]
            break
    if not extracted_district:
        for d in DISTRICT_COORDS.keys():
            if d.lower() in clean:
                extracted_district = d
                break

    extracted_qty = None
    m_num = re.search(r'\b(\d+(?:\.\d+)?)\s*(?:tons?|tonnes?|t\b|quintals?|kg)?', clean)
    if m_num:
        extracted_qty = float(m_num.group(1))
    else:
        for w, val in VOICE_NUMBER_WORDS.items():
            if re.search(rf'\b{w}\s*(?:tons?|tonnes?|t\b)?', clean):
                extracted_qty = float(val)
                break

    extracted_temp = None
    m_temp = re.search(r'\btemp(?:erature)?(?:\s+(?:is|of|at))?\s*(\d+(?:\.\d+)?)', clean)
    if m_temp:
        extracted_temp = float(m_temp.group(1))

    extracted_hum = None
    m_hum = re.search(r'\bhumidity(?:\s+(?:is|of|at))?\s*(\d+(?:\.\d+)?)', clean)
    if m_hum:
        extracted_hum = float(m_hum.group(1))

    return {
        "crop": extracted_crop,
        "district": extracted_district,
        "quantity": extracted_qty,
        "temperature": extracted_temp,
        "humidity": extracted_hum
    }

@router.post("/voice-parse")
async def parse_voice(file: UploadFile = File(...), lang: Optional[str] = Form("en-IN")):
    import speech_recognition as sr
    import io
    recognizer = sr.Recognizer()
    try:
        contents = await file.read()
        wav_buffer = io.BytesIO(contents)
        with sr.AudioFile(wav_buffer) as source:
            recognizer.adjust_for_ambient_noise(source, duration=0.3)
            audio_data = recognizer.record(source)

        selected_lang = lang if lang in ["en-IN", "en-US", "kn-IN", "hi-IN"] else "en-IN"
        try:
            transcribed_text = recognizer.recognize_google(audio_data, language=selected_lang)
        except sr.UnknownValueError:
            if selected_lang != "en-US":
                transcribed_text = recognizer.recognize_google(audio_data, language="en-US")
            else:
                raise

        parsed = parse_voice_command_text(transcribed_text)
        return {
            "text": transcribed_text,
            "crop": parsed["crop"],
            "district": parsed["district"],
            "quantity": parsed["quantity"],
            "temperature": parsed["temperature"],
            "humidity": parsed["humidity"]
        }
    except sr.UnknownValueError:
        raise HTTPException(status_code=400, detail="Could not understand audio. Please speak clearly into the microphone.")
    except Exception as e:
        logger.error("Error in parse_voice: %s", e)
        raise HTTPException(status_code=500, detail=f"Voice parsing error: {str(e)}")

class AdvisoryRequest(BaseModel):
    lang: str
    text: str

@router.post("/advisory-audio")
async def advisory_audio(req: AdvisoryRequest):
    import io
    from gtts import gTTS
    
    text = req.text
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
        
    try:
        tts = gTTS(text=text, lang=req.lang.lower(), slow=False)
        audio_buf = io.BytesIO()
        tts.write_to_fp(audio_buf)
        audio_buf.seek(0)
        return StreamingResponse(audio_buf, media_type="audio/mp3")
    except Exception as e:
        import traceback
        err_str = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"{str(e)}\n{err_str}")
