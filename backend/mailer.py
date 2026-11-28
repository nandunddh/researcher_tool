"""Sends email through SMTP (Brevo). Settings come from the environment or backend/.env."""
import os
import smtplib
from email.message import EmailMessage
from html import escape

import db  # noqa: F401  (loads backend/.env)


def contact() -> dict:
    """The team's public email and phone (SCIPROSPECT_CONTACT_EMAIL / _PHONE); blank when not set."""
    return {key: os.environ.get(f"SCIPROSPECT_CONTACT_{key.upper()}", "").strip() for key in ("email", "phone")}


def signature() -> tuple:
    """The sign-off every SciProspect email ends with, as (text, html)."""
    details = contact()
    lines = [f"Email: {details['email']}" if details["email"] else "", f"Phone: {details['phone']}" if details["phone"] else ""]
    lines = [line for line in lines if line]
    text = "\n\nThanks and Regards,\nThe SciProspect team" + "".join("\n" + line for line in lines)
    links = []
    if details["email"]:
        links.append(f'Email: <a href="mailto:{escape(details["email"], quote=True)}">{escape(details["email"])}</a>')
    if details["phone"]:
        links.append(f'Phone: <a href="tel:{escape(details["phone"].replace(" ", ""), quote=True)}">{escape(details["phone"])}</a>')
    html = '<p style="margin-top:24px">Thanks and Regards,<br>The SciProspect team' + "".join("<br>" + link for link in links) + "</p>"
    return text, html


def send_mail(to: str, subject: str, text: str, html: str, sign: bool = True) -> None:
    """Sends one email. sign=False leaves out the SciProspect sign-off (internal notes, mail sent for an event organiser)."""
    host = os.environ.get("SCIPROSPECT_SMTP_HOST")
    if not host:
        raise RuntimeError("Email is not configured (SCIPROSPECT_SMTP_HOST).")
    if sign:
        sign_text, sign_html = signature()
        text, html = text + sign_text, html + sign_html
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
