"""
communications.py — Outbound notification stubs.

External SMTP email and Fast2SMS delivery are disabled.
All calls log to the server console only. In-app notifications
(written to the Notification table) are the primary delivery channel.
"""

import logging

logger = logging.getLogger(__name__)


def send_email_otp(to_email: str, otp_code: str) -> None:
    """
    OTP delivery stub — external SMTP is disabled.
    The OTP is stored in the database; logged at debug level (not info)
    so it does not appear in production log streams by default.
    """
    logger.debug("[DEV ONLY] OTP stored in DB for %s — retrieve via admin panel", to_email)


def send_email_notification(to_email: str, subject: str, message_body: str) -> None:
    """
    Email notification stub — external SMTP is disabled.
    Notifications are delivered through the in-app notification system.
    """
    logger.info("[IN-APP ONLY] Email suppressed for %s | %s", to_email, subject)


def send_sms_otp(to_phone: str, otp_code: str) -> None:
    """
    SMS delivery stub — Fast2SMS is disabled.
    The OTP is stored in the database; logged at debug level only.
    """
    logger.debug("[DEV ONLY] OTP stored in DB for %s — retrieve via admin panel", to_phone)

