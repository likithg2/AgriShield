# AI-Driven Post-Harvest Loss Prediction Setup Guide

This guide will walk you through setting up and running the Post-Harvest Loss Prediction platform from scratch on a new machine.

---

## 1. Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Python 3.9+**
- **PostgreSQL** (Make sure the Postgres server is running and you know the password for the `postgres` user).

---

## 2. Environment Variables (`.env`)

This project uses sensitive API keys and database credentials that shouldn't be shared directly in the code. You need to create a file named exactly `.env` in the root folder of the project (the same folder where `Home.py` is located).

Create a new text file, name it `.env`, and paste the following template into it. Replace the placeholder values with your actual keys and database credentials:

```ini
# Database Configuration (Replace '12345' with your actual PostgreSQL password)
DATABASE_URL=postgresql://postgres:12345@localhost:5432/postgres

# Security
SECRET_KEY=bit-major-project-2023-27-super-secret-key-change-in-production

# External API Keys (You need to generate these on their respective platforms)
WEATHER_API_KEY=your_openweathermap_api_key_here
GEMINI_API_KEY=your_google_gemini_api_key_here
GOOGLE_API_KEY=your_google_maps_api_key_here
MARKET_API_KEY=your_gov_data_api_key_here

# Email (SMTP) Configuration (For sending OTPs and Dispatch Alerts)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password_here

# SMS Configuration
FAST2SMS_API_KEY=your_fast2sms_api_key_here
```

---

## 3. Installation

1. Open a terminal and navigate to the project folder.
2. Create a virtual environment (recommended):
   ```bash
   python -m venv .venv
   ```
3. Activate the virtual environment:
   - **Windows:** `.venv\Scripts\activate`
   - **Mac/Linux:** `source .venv/bin/activate`
4. Install all required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

---

## 4. Running the Application

This project requires **two** separate terminal windows to run simultaneously: one for the backend server, and one for the frontend UI.

### Terminal 1: Start the Backend (FastAPI)
Open a terminal, activate your virtual environment, and run the FastAPI server:
```bash
uvicorn backend.main:app --reload
```
*Wait for it to say `Application startup complete.` It will run on `http://127.0.0.1:8000`.*
*(Note: On the very first run, it will automatically connect to PostgreSQL and create all the necessary database tables.)*

### Terminal 2: Start the Frontend (Streamlit)
Open a **new** terminal window, activate your virtual environment again, and run the Streamlit app:
```bash
streamlit run Home.py
```
*This will automatically open your web browser to `http://localhost:8501`.*

---

## 5. First Time Login

Once both servers are running, open the web interface. Since the database is fresh, you will need to register a new account.
- **Admin Access:** If you need an admin account to manage warehouses, register a new user, then manually go into your PostgreSQL database (using pgAdmin or psql) and change the `role` column in the `users` table to `admin` for that specific user.
