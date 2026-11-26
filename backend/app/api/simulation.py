from fastapi import APIRouter, Query

from app.schemas import SimulationRequest
from app.services import simulation_service

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
