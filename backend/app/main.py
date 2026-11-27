import logging
from pathlib import Path

from dotenv import load_dotenv

# Charge backend/.env AVANT d'importer les modules qui lisent la configuration.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402
from starlette.middleware.trustedhost import TrustedHostMiddleware  # noqa: E402

from app import security  # noqa: E402
from app.api.agent import router as agent_router  # noqa: E402
from app.api.analytics import router as analytics_router  # noqa: E402
from app.api.datasets import router as datasets_router  # noqa: E402
from app.api.simulation import router as simulation_router  # noqa: E402
from app.api.auth import router as auth_router  # noqa: E402
from app.api.projects import router as projects_router  # noqa: E402
from app.api.users import router as users_router  # noqa: E402
from app.auth import require_roles  # noqa: E402
from app.roles import ADMIN, TECHNICIEN  # noqa: E402
from fastapi import Depends  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ensa")

app = FastAPI(
    title="ENSA EnergyOS API",
    description="Smart Campus Energy Analytics — Données simulées",
    version="1.1.0",
    # Documentation désactivée par défaut (ENSA_ENABLE_DOCS=true pour l'activer en local).
    docs_url="/docs" if security.ENABLE_DOCS else None,
    redoc_url=None,
    openapi_url="/openapi.json" if security.ENABLE_DOCS else None,
)
app.include_router(analytics_router)
app.include_router(datasets_router)
app.include_router(agent_router)
app.include_router(simulation_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(projects_router)

# Premier administrateur créé automatiquement depuis backend/.env s'il n'en existe aucun.
from app.services.user_store import ensure_initial_admin  # noqa: E402

ensure_initial_admin(logger)

# Ordre : le dernier ajouté s'exécute en premier.
app.middleware("http")(security.security_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=security.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
    allow_credentials=False,
)
# Refuse les requêtes dont l'en-tête Host n'est pas attendu (protection DNS rebinding).
app.add_middleware(TrustedHostMiddleware, allowed_hosts=security.ALLOWED_HOSTS)


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    # Liste des champs invalides sans renvoyer les valeurs saisies.
    fields = [".".join(str(p) for p in err.get("loc", [])[1:]) or "requête" for err in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={"detail": "Valeurs invalides : " + ", ".join(sorted(set(fields)))},
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    # Le détail technique reste dans les journaux serveur, jamais dans la réponse.
    logger.exception("Erreur non gérée sur %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Erreur interne du serveur."})


@app.get("/")
def home():
    return {
        "application": "ENSA EnergyOS",
        "status": "running",
        "data_source": "Synthetic ENSA Fès dataset",
    }


@app.get("/api/status", dependencies=[Depends(require_roles(ADMIN, TECHNICIEN))])
def status():
    """État du système pour la page Settings. N'expose jamais la clé API, seulement sa présence."""
    import os

    from app.api.agent import REASONING_EFFORT, TEXT_MODEL
    from app.services.energy_service import load_active_dataset
    from app.services.insights_service import PRICE_PER_KWH

    df = load_active_dataset()
    return {
        "version": app.version,
        "api": "ok",
        "dataset": {
            "start": df["Date_Heure"].min().date().isoformat(),
            "end": df["Date_Heure"].max().date().isoformat(),
            "days": int(df["Date_Heure"].dt.date.nunique()),
            "rooms": int(df["Salle"].nunique()),
            "rows": int(len(df)),
            "data_type": "simulated",
        },
        "agent": {
            "configured": bool(os.getenv("GROQ_API_KEY")),
            "model": TEXT_MODEL,
            "reasoning_effort": REASONING_EFFORT,
            "rate_limit_per_minute": security.AGENT_RATE_PER_MINUTE,
        },
        "default_price_per_kwh": PRICE_PER_KWH,
        "shelly_connected": False,
    }


@app.get("/api/kpis")
def get_kpis():
    from app.services.energy_service import calculate_kpis, load_active_dataset

    return calculate_kpis(load_active_dataset())
