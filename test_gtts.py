import traceback
from gtts import gTTS
import io

try:
    text = "ಸೌತೆಕಾಯಿ ಬೆಳೆಗಾಗಿ ಎಐ ಆಧಾರಿತ ಸಲಹೆ"
    lang = "kn"
    print(f"Lang: {lang}")
    tts = gTTS(text=text, lang=lang, slow=False)
    audio_buf = io.BytesIO()
    tts.write_to_fp(audio_buf)
    print("Success! Audio generated.")
except Exception as e:
    print(f"Exception: {e}")
    traceback.print_exc()
