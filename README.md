# 🌾 Smart Agricultural Supply Chain Optimization using AI & Machine Learning

## 📌 Overview

The Smart Agricultural Supply Chain Optimization System is an AI-powered web application designed to help farmers reduce post-harvest losses by predicting crop spoilage, optimizing transportation decisions, and analyzing vegetable quality using Deep Learning.

The system combines Machine Learning, Deep Learning, weather data, route optimization, and an interactive dashboard to provide intelligent recommendations for storage and transportation.

---

## 🚀 Features

- 🌿 Vegetable Quality Analysis using Deep Learning (MobileNetV2)
- 📈 Crop Spoilage Prediction
- ☁️ Live Weather Data Integration
- 📍 Route Optimization
- 🗺️ Cold Storage Recommendation
- 💰 Financial Loss Estimation
- 🔊 AI-generated Voice Advisory
- 🤖 AI Chatbot Assistant (HarvestGuard AI)
- 🌐 Multi-language Support (English & Kannada)
- 📊 Interactive Dashboard with Historical Data & Statistics
- 🏭 Warehouse Management & Logs
- 🔐 Secure User Authentication (JWT)
- 🔌 Backend API powered by FastAPI
- 💻 Modern React Frontend with Tailwind CSS

---

## 🧠 Technologies Used

### Frontend
- React (Vite)
- Tailwind CSS
- JavaScript

### Backend
- Python
- FastAPI
- SQLite (`postharvest.db`)

### Machine Learning
- TensorFlow / Keras (MobileNetV2)
- Scikit-Learn

### Data Processing
- NumPy
- Pandas
- Pillow

### Visualization
- Plotly
- Folium
- Matplotlib

### APIs
- OpenWeather API
- Gemini API

---

## 📂 Project Structure

```text
PostHarvestLossPrediction/
│
├── backend/
│   ├── main.py                 # FastAPI Application Entry
│   ├── database.py             # Database Configuration
│   ├── models.py               # SQLAlchemy Database Models
│   ├── schemas.py              # Pydantic Schemas
│   ├── routers/                # API Endpoints (Auth, Farmers, Predictions, etc.)
│   └── requirements.txt        # Backend dependencies
│
├── frontend/
│   ├── src/                    # React Frontend Source Code
│   ├── package.json            # Frontend Node dependencies
│   ├── tailwind.config.js      # Tailwind CSS configuration
│   └── vite.config.js          # Vite configuration
│
├── models/
│   └── vegetable_quality_v5_model.keras # Deep Learning Model
│
├── utils/
│   ├── api_client.py           # API Integration Utility
│   └── quality_predictor.py    # Image Inference Utility
│
├── *.csv                       # Datasets (Cold Storage, Buyers, Active Shipments)
├── artifacts_v2.pkl            # Spoilage Prediction ML Pipeline
└── requirements.txt            # Python Dependencies
```

---

## 🧠 Machine Learning Modules

### 1. Vegetable Quality Analysis

- MobileNetV2 Transfer Learning
- Image Classification
- 20 Vegetable Classes
- Fresh/Rotten Detection
- Confidence Score Prediction

### 2. Crop Spoilage Prediction

Predicts:
- Spoilage Probability
- Remaining Shelf Life
- Financial Loss
- Storage Recommendation

---

## 📊 Dataset

The quality analysis model was trained using a custom dataset containing approximately **27,000+ images** across **20 classes**, including fresh and rotten vegetables.

Classes include:
- Apple, Banana, Bitter Gourd, Capsicum, Cucumber, Okra, Onion, Orange, Potato, Tomato.

Each vegetable contains Fresh and Rotten categories.

---

## 🖥️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/likithg2/PostHarvestLossPrediction.git
   cd PostHarvestLossPrediction
   ```

2. **Create and Activate a Virtual Environment for Backend**
   *Windows:*
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```
   *Mac/Linux:*
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install Backend Dependencies**
   ```bash
   pip install -r backend/requirements.txt
   pip install -r requirements.txt
   ```

4. **Run the Backend API (FastAPI)**
   In a new terminal (with the virtual environment activated):
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

5. **Install and Run the Frontend (React/Vite)**
   In another terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

## 🚀 Future Improvements

- Real-time IoT Sensor Integration
- Edge Device Deployment
- Additional Crop Support
- Disease Detection

---

## 👥 Contributors

- **Likith G**

---

## 📜 License

This project is open-source and available under the standard MIT License.
