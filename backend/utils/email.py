import smtplib
import os
from email.message import EmailMessage

def send_email(to_email: str, subject: str, content: str):
    print(f"--- MOCK EMAIL SEND ---")
    print(f"To: {to_email}")
    print(f"Subject: {subject}")
    print(f"Content: {content}")
    print(f"-----------------------")
    
    # Uncomment to actually send if credentials are provided in .env
    # sender_email = os.getenv("SMTP_EMAIL")
    # sender_password = os.getenv("SMTP_PASSWORD")
    # if not sender_email or not sender_password:
    #     return
    
    # try:
    #     msg = EmailMessage()
    #     msg.set_content(content)
    #     msg['Subject'] = subject
    #     msg['From'] = sender_email
    #     msg['To'] = to_email
        
    #     server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
    #     server.login(sender_email, sender_password)
    #     server.send_message(msg)
    #     server.quit()
    # except Exception as e:
    #     print(f"Failed to send email: {e}")
