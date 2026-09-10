from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user, User
from backend.models import ChatSession, ChatMessage
from backend.config import settings
from backend.routers.predictions import get_weather
import google.generativeai as genai
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/ai", tags=["ai"])

class ChatMessageModel(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessageModel]
    language: str = "en"
    session_id: Optional[int] = None

@router.get("/suggestions")
def get_crop_suggestions(
    district: str = Query(..., description="District to get weather for"),
    language: str = Query("en", description="Language to respond in"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generates crop suggestions based on weather and market trends."""
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can access this feature")

    weather_data = get_weather(district)
    
    if not settings.GEMINI_API_KEY:
        # Fallback if no Gemini key
        return {
            "weather": weather_data,
            "suggestions": "Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file to receive AI suggestions.",
            "market_trend": "Market data currently unavailable."
        }
    
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-flash-lite-latest')
        
        lang_map = {"EN": "English", "en": "English", "KN": "Kannada", "kn": "Kannada", "HI": "Hindi", "hi": "Hindi"}
        resolved_lang = lang_map.get(language, "English")
        
        prompt = f"""
        You are an expert agricultural assistant in India.
        The farmer is located in {district}.
        Current weather: {weather_data['temp']}°C, {weather_data['humidity']}% humidity, {weather_data['desc']}.
        
        Please analyze historical weather patterns for this region, current Indian market trends, and the current weather conditions. 
        Based on this comprehensive analysis, suggest 2-3 highly profitable crops to grow over the NEXT 3 MONTHS. 
        Provide a brief explanation for each, citing specific market trends or seasonal weather advantages for the upcoming 3-month cycle.
        
        IMPORTANT FORMATTING RULES: 
        1. Each crop suggestion MUST start with a number (e.g., "1.", "2.", "3.").
        2. You MUST insert a blank line (double newline) after the description of each crop, before the next number starts.
        3. Use an appropriate emoji for each crop immediately after the number (e.g., "1. 🍅 **Tomato**").
        4. Make the crop names visually distinguishable by using **bold text**.
        5. Keep the response concise and strictly adhere to this format.
        6. MUST provide the ENTIRE response in the following language: {resolved_lang}.
        7. CRITICAL: DO NOT copy the examples below. Generate REAL, UNIQUE crop recommendations based on the actual weather data provided.

        Example of REQUIRED structural format:
        Namaste! Here are 3 profitable crops suited for your area over the next 3 months...

        1. 🌾 **[Crop A Name]**: [Brief 2-sentence explanation of why it thrives in {weather_data['temp']}°C and current humidity, and its market demand].

        2. 🌿 **[Crop B Name]**: [Brief 2-sentence explanation of why it thrives in {weather_data['temp']}°C and current humidity, and its market demand].

        3. 🌻 **[Crop C Name]**: [Brief 2-sentence explanation of why it thrives in {weather_data['temp']}°C and current humidity, and its market demand].
        """
        
        response = model.generate_content(prompt)
        
        return {
            "weather": weather_data,
            "suggestions": response.text,
            "market_trend": "Analyzed via AI based on current season and location."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
def chat_with_ai(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Chat with the agricultural AI assistant."""
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="AI Assistant is currently unavailable (API key missing).")
        
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-flash-lite-latest')
        
        lang_map = {"EN": "English", "en": "English", "KN": "Kannada", "kn": "Kannada", "HI": "Hindi", "hi": "Hindi"}
        resolved_lang = lang_map.get(request.language, "English")
        
        # Build context from user's dashboard (e.g. active shipments)
        from backend.models import Shipment
        recent_shipments = db.query(Shipment).filter(
            Shipment.user_id == current_user.id,
            Shipment.status != 'delivered'
        ).order_by(Shipment.created_at.desc()).limit(3).all()
        
        context_str = "Farmer's Active Shipments (Spoilage Tracker Context):\n"
        if not recent_shipments:
            context_str += "No active shipments.\n"
        else:
            for s in recent_shipments:
                context_str += f"- Crop: {s.crop}, Qty: {s.tonnage} tons, Status: {s.status.value if hasattr(s.status, 'value') else s.status}, Expected Spoilage Time: {s.shelf_days_calculated} days\n"
        
        system_instruction = f"""
        You are 'AgriShield AI', an expert agricultural assistant in India.
        
        Use your extensive knowledge base to answer ANY questions the farmer has about crop prices, market trends, pest control, weather patterns, and general farming advice for any region or crop. Do NOT say you only have data on their shipments.
        
        You ALSO have access to their active shipment context:
        {context_str}
        
        If they specifically ask about their own shipments or spoilage, use the context above to assist them. Otherwise, answer their general questions confidently using your expert knowledge.
        
        IMPORTANT: Please respond ONLY in {resolved_lang}. Do not use any other language.
        """
        
        # Convert messages to Gemini format
        formatted_messages = [
            {"role": "user", "parts": [system_instruction]}
        ]
        
        for msg in request.messages:
            # Gemini roles are 'user' or 'model'
            role = 'model' if msg.role == 'assistant' else 'user'
            formatted_messages.append({"role": role, "parts": [msg.content]})
            
        # Extract the latest user message
        latest_user_message = request.messages[-1].content if request.messages else "Hello"
        
        # Handle session
        session_id = request.session_id
        if not session_id:
            title = latest_user_message[:30] + "..." if len(latest_user_message) > 30 else latest_user_message
            new_session = ChatSession(user_id=current_user.id, title=title)
            db.add(new_session)
            db.commit()
            db.refresh(new_session)
            session_id = new_session.id
        else:
            # Security check: verify this session belongs to the user
            session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
            if not session:
                raise HTTPException(status_code=403, detail="Not authorized to access this session")
            
        # We need to use generate_content with a list of contents for history, 
        # or use start_chat. Let's just pass the messages list.
        response = model.generate_content(formatted_messages)
        
        # Save user message
        db.add(ChatMessage(session_id=session_id, role="user", content=latest_user_message))
        # Save AI response
        db.add(ChatMessage(session_id=session_id, role="assistant", content=response.text))
        db.commit()
        
        return {"response": response.text, "session_id": session_id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions")
def get_chat_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sessions = db.query(ChatSession).filter(ChatSession.user_id == current_user.id).order_by(ChatSession.updated_at.desc()).all()
    return [{"id": s.id, "title": s.title, "updated_at": s.updated_at} for s in sessions]

@router.get("/sessions/{session_id}")
def get_chat_session_messages(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at} for m in messages]
