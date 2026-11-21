"""Sends email through SMTP (Brevo). Settings come from the environment or backend/.env."""
import os
import smtplib
from email.message import EmailMessage

import db  # noqa: F401  (loads backend/.env)


def send_mail(to: str, subject: str, text: str, html: str) -> None:
    host = os.environ.get("SCIPROSPECT_SMTP_HOST")
    if not host:
        raise RuntimeError("Email is not configured (SCIPROSPECT_SMTP_HOST).")
    msg = EmailMessage()
    msg["From"] = os.environ.get("SCIPROSPECT_MAIL_FROM", "")
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(host, int(os.environ.get("SCIPROSPECT_SMTP_PORT") or 587), timeout=20) as smtp:
        smtp.starttls()
        smtp.login(os.environ.get("SCIPROSPECT_SMTP_USER", ""), os.environ.get("SCIPROSPECT_SMTP_PASSWORD", ""))
        smtp.send_message(msg)
