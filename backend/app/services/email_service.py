import smtplib
from email.message import EmailMessage

from app.core.config import settings


def send_email(*, subject: str, recipients: list[str], body_text: str, body_html: str | None = None) -> None:
    smtp_host = settings.smtp_host.strip()
    clean_recipients = [item.strip() for item in recipients if item and item.strip()]
    if not smtp_host or not clean_recipients:
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email
    msg["To"] = ", ".join(clean_recipients)
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(
            smtp_host,
            int(settings.smtp_port),
            timeout=float(settings.smtp_timeout_seconds),
        ) as smtp:
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(msg)
        return

    with smtplib.SMTP(
        smtp_host,
        int(settings.smtp_port),
        timeout=float(settings.smtp_timeout_seconds),
    ) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(msg)
