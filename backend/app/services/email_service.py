import smtplib
from email.message import EmailMessage

from app.services.smtp_settings_service import resolve_smtp_runtime_config


def is_smtp_configured() -> bool:
    cfg = resolve_smtp_runtime_config()
    return bool(cfg.enabled and cfg.host and cfg.from_email)


def send_email(*, subject: str, recipients: list[str], body_text: str, body_html: str | None = None) -> None:
    cfg = resolve_smtp_runtime_config()
    smtp_host = cfg.host
    clean_recipients = [item.strip() for item in recipients if item and item.strip()]
    if not cfg.enabled or not smtp_host or not clean_recipients or not cfg.from_email:
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg.from_email
    msg["To"] = ", ".join(clean_recipients)
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    if cfg.use_ssl:
        with smtplib.SMTP_SSL(
            smtp_host,
            int(cfg.port),
            timeout=float(cfg.timeout_seconds),
        ) as smtp:
            if cfg.username:
                smtp.login(cfg.username, cfg.password)
            smtp.send_message(msg)
        return

    with smtplib.SMTP(
        smtp_host,
        int(cfg.port),
        timeout=float(cfg.timeout_seconds),
    ) as smtp:
        if cfg.use_tls:
            smtp.starttls()
        if cfg.username:
            smtp.login(cfg.username, cfg.password)
        smtp.send_message(msg)
