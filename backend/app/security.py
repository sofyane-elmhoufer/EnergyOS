"""
Protections transverses de l'API : lecture seule, limite de débit,
taille des requêtes, en-têtes HTTP de sécurité, configuration via .env.
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


def env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


ALLOWED_ORIGINS = env_list("ENSA_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
ALLOWED_HOSTS = env_list("ENSA_ALLOWED_HOSTS", "localhost,127.0.0.1")
ENABLE_DOCS = os.getenv("ENSA_ENABLE_DOCS", "false").lower() == "true"
AGENT_RATE_PER_MINUTE = env_int("ENSA_AGENT_RATE_PER_MINUTE", 10)
API_RATE_PER_MINUTE = env_int("ENSA_API_RATE_PER_MINUTE", 240)
MAX_BODY_BYTES = env_int("ENSA_MAX_BODY_MB", 10) * 1024 * 1024

# Seules ces routes acceptent POST : elles ne modifient aucune donnée serveur.
# Tout le reste (upload / activation de dataset, etc.) est refusé.
POST_ALLOWLIST = {
    "/api/agent/chat",
    "/api/agent/chat-file",
    "/api/agent/advice",
    "/api/simulation/estimate",
}

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    # L'API ne sert que du JSON : aucun script, aucune frame.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
}
# La documentation Swagger (si activée) a besoin de charger ses scripts.
DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


class RateLimiter:
    """Fenêtre glissante d'une minute, par adresse IP et par catégorie."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, bucket: str, limit: int) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[(bucket, key)]
            while hits and now - hits[0] > 60:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            if len(self._hits) > 10_000:  # évite une croissance mémoire illimitée
                self._hits = defaultdict(deque, {k: v for k, v in self._hits.items() if v})
            return True


rate_limiter = RateLimiter()


def client_ip(request: Request) -> str:
    # Pas de lecture de X-Forwarded-For : falsifiable tant qu'aucun proxy de confiance n'est configuré.
    return request.client.host if request.client else "unknown"


def agent_rate_limit(request: Request) -> None:
    """Dépendance FastAPI : protège la clé API Groq contre l'abus (coût / quota)."""
    if not rate_limiter.check(client_ip(request), "agent", AGENT_RATE_PER_MINUTE):
        raise HTTPException(429, "Trop de questions envoyées. Réessaie dans une minute.")


async def security_middleware(request: Request, call_next):
    path = request.url.path

    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.method != "POST" or path not in POST_ALLOWLIST:
            return JSONResponse(status_code=403, content={"detail": "Read-only demo: modifications disabled"})

    length = request.headers.get("content-length")
    if length is not None:
        try:
            if int(length) > MAX_BODY_BYTES:
                return JSONResponse(status_code=413, content={"detail": "Requête trop volumineuse."})
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "En-tête Content-Length invalide."})
    elif request.method == "POST" and "chunked" in request.headers.get("transfer-encoding", "").lower():
        # Sans taille annoncée on ne peut pas borner la lecture en amont : refusé.
        return JSONResponse(status_code=411, content={"detail": "Content-Length requis."})

    if not rate_limiter.check(client_ip(request), "api", API_RATE_PER_MINUTE):
        return JSONResponse(status_code=429, content={"detail": "Trop de requêtes. Réessaie dans une minute."})

    response = await call_next(request)
    for header, value in SECURITY_HEADERS.items():
        if header == "Content-Security-Policy" and path.startswith(DOCS_PATHS):
            continue
        response.headers.setdefault(header, value)
    return response
