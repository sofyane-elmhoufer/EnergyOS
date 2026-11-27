import base64
import binascii

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool

from app.schemas import SendDevisRequest, SimulationRequest
from app.security import email_rate_limit
from app.services import email_service, simulation_service

MAX_PDF_BYTES = 300_000

# Espace Client : simulation d'économies pour un bâtiment quelconque.
# Aucune donnée n'est enregistrée côté serveur : le POST /estimate ne fait qu'un calcul
# (il figure dans la liste blanche du middleware de lecture seule).
router = APIRouter(
    prefix="/api/simulation",
    tags=["Client Simulation"],
)


@router.get("/options")
def simulation_options():
    return simulation_service.get_options()


@router.post("/estimate")
def simulation_estimate(request: SimulationRequest):
    return simulation_service.estimate(request)


@router.get("/estimate")
def simulation_estimate_legacy(
    monthly_bill: float = Query(gt=0, le=100_000_000, description="Facture mensuelle (MAD)"),
    lamps: int = Query(gt=0, le=1_000_000, description="Nombre de lampes LED"),
    building_type: str = Query(pattern=r"^[a-z_]{1,32}$"),
    city: str = Query(pattern=r"^[a-z_]{1,32}$"),
    lamp_power_w: float | None = Query(None, gt=0, le=2000),
    hours_per_day: float | None = Query(None, gt=0, le=24),
    days_per_month: float | None = Query(None, gt=0, le=31),
    price_per_kwh: float | None = Query(None, gt=0, le=100),
):
    return simulation_service.estimate_legacy(
        monthly_bill, lamps, building_type, city,
        lamp_power_w=lamp_power_w, hours_per_day=hours_per_day,
        days_per_month=days_per_month, price_per_kwh=price_per_kwh,
    )


@router.post("/send-devis")
async def send_devis(payload: SendDevisRequest, request: Request):
    """Envoie le devis PDF au client. Rien n'est enregistré côté serveur."""
    if not email_service.is_configured():
        raise HTTPException(503, email_service.NOT_CONFIGURED)
    try:
        pdf_bytes = base64.b64decode(payload.pdf_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, "Devis PDF invalide.") from exc
    if not pdf_bytes.startswith(b"%PDF-") or len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(422, "Devis PDF invalide.")
    # Compté seulement pour les demandes valides : une faute de frappe ne consomme pas d'envoi.
    email_rate_limit(request)

    estimate = simulation_service.estimate(payload.simulation)
    email = payload.email.strip()
    name = " ".join(payload.name.split())
    message = email_service.build_message(email, name, payload.reference, estimate, pdf_bytes)
    # Envoi SMTP bloquant (jusqu'à 20 s) : hors de la boucle asynchrone.
    await run_in_threadpool(email_service.send_message, message)
    return {"sent": True, "email": email}
