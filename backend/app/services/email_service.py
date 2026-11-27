"""
Envoi du devis PDF par e-mail (Espace Client).

Configuration dans backend/.env (voir .env.example) :
    SMTP_HOST, SMTP_PORT, SMTP_SECURITY (starttls | ssl | none), SMTP_USER, SMTP_PASSWORD, SMTP_FROM
Tant que SMTP_HOST est vide, l'envoi est désactivé (503) et le reste du site fonctionne normalement.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from fastapi import HTTPException

logger = logging.getLogger("ensa.email")

COMPANY_NAME = "ENSA EnergyOS"
NOT_CONFIGURED = "L'envoi par e-mail n'est pas encore configuré sur le serveur."


def is_configured() -> bool:
    return bool(os.getenv("SMTP_HOST"))


def _fmt(value: float | None, digits: int = 2) -> str:
    """Format français : 12 345,67"""
    if value is None:
        return "-"
    return f"{value:,.{digits}f}".replace(",", " ").replace(".", ",")


def _payback(months: float | None) -> str:
    if months is None:
        return "non rentable sur la période"
    total = max(1, round(months))
    if total < 12:
        return f"{total} mois"
    years, rest = divmod(total, 12)
    text = f"{years} an{'s' if years > 1 else ''}"
    return f"{text} {rest} mois" if rest else text


def build_message(to_email: str, client_name: str, reference: str, estimate: dict, pdf_bytes: bytes) -> EmailMessage:
    sender = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or ""
    monthly, yearly = estimate["monthly"], estimate["yearly"]
    inputs, investment = estimate["inputs"], estimate["investment"]
    cur = estimate["currency"]
    greeting = f"Bonjour {client_name}," if client_name else "Bonjour,"

    message = EmailMessage()
    message["Subject"] = f"Votre devis {COMPANY_NAME} - {reference}"
    message["From"] = formataddr((COMPANY_NAME, sender))
    message["To"] = to_email
    message.set_content(
        f"{greeting}\n\n"
        f"Merci d'avoir utilisé le simulateur {COMPANY_NAME}. Vous trouverez en pièce jointe votre devis {reference}.\n\n"
        f"Résumé de votre simulation ({inputs['building_label']}, {inputs['city_label']}) :\n"
        f"  - Facture actuelle : {_fmt(monthly['bill_without_shelly'])} {cur} / mois\n"
        f"  - Facture estimée avec Shelly : {_fmt(monthly['bill_with_shelly'])} {cur} / mois\n"
        f"  - Économie estimée : {_fmt(yearly['saved_cost'])} {cur} / an ({_fmt(yearly['saved_kwh'], 0)} kWh)\n"
        f"  - Investissement estimé : {_fmt(investment['total'], 0)} {cur} "
        f"({investment['modules']} modules, retour sur investissement : {_payback(investment['payback_months'])})\n\n"
        "Le prix définitif est fixé avec vous après une visite technique de votre bâtiment. "
        "Pour donner suite, il vous suffit de répondre à cet e-mail.\n\n"
        f"Cordialement,\nL'équipe {COMPANY_NAME}\n\n"
        "Estimation non contractuelle, fondée sur les informations que vous avez déclarées."
    )
    message.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=f"Devis_{reference}.pdf")
    return message


def send_message(message: EmailMessage) -> None:
    if not is_configured():
        raise HTTPException(503, NOT_CONFIGURED)

    host = os.environ["SMTP_HOST"]
    security = os.getenv("SMTP_SECURITY", "starttls").lower()
    try:
        port = int(os.getenv("SMTP_PORT") or (465 if security == "ssl" else 587))
    except ValueError:
        port = 465 if security == "ssl" else 587
    user, password = os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD")

    try:
        if security == "ssl":
            server = smtplib.SMTP_SSL(host, port, timeout=20, context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(host, port, timeout=20)
        with server:
            if security == "starttls":
                server.starttls(context=ssl.create_default_context())
            if user and password:
                server.login(user, password)
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        # Le détail technique reste dans les journaux du serveur, jamais dans la réponse.
        logger.error("Échec de l'envoi du devis : %r", exc)
        raise HTTPException(502, "Le devis n'a pas pu être envoyé par e-mail. Réessayez plus tard.") from exc
