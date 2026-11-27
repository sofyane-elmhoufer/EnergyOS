"""Connexion, inscription des clients et gestion de son propre compte."""

from fastapi import APIRouter, Depends, HTTPException, Request

from app import security
from app.auth import bearer_token, current_user
from app.roles import CLIENT, ROLE_LABELS
from app.schemas import LoginRequest, PasswordChange, ProfileUpdate, RegisterRequest
from app.services import user_store

router = APIRouter(prefix="/api/auth", tags=["Authentification"])


def _login_rate_limit(request: Request) -> None:
    """Freine les essais de mots de passe en série (force brute)."""
    if not security.rate_limiter.check(security.client_ip(request), "login", security.LOGIN_RATE_PER_MINUTE):
        raise HTTPException(429, "Trop de tentatives. Réessayez dans une minute.")


def _session_response(user: dict) -> dict:
    return {"token": user_store.create_session(user["id"]), "user": user}


@router.get("/roles")
def roles():
    return ROLE_LABELS


@router.post("/register", dependencies=[Depends(_login_rate_limit)])
def register(payload: RegisterRequest, request: Request):
    try:
        user = user_store.create_user(
            payload.email, payload.name, CLIENT, payload.password, payload.phone, payload.company,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    user_store.add_audit("auth.register", user, user["email"], "Inscription client", security.client_ip(request))
    return _session_response(user)


@router.post("/login", dependencies=[Depends(_login_rate_limit)])
def login(payload: LoginRequest, request: Request):
    user = user_store.authenticate(payload.email, payload.password)
    ip = security.client_ip(request)
    if user is None:
        user_store.add_audit("auth.failed", None, payload.email.strip().lower()[:120], "Connexion refusée", ip)
        # Même message que l'e-mail existe ou non : on ne révèle pas quels comptes existent.
        raise HTTPException(401, "E-mail ou mot de passe incorrect.")
    user_store.add_audit("auth.login", user, user["email"], "Connexion", ip)
    return _session_response(user)


@router.post("/logout")
def logout(request: Request):
    token = bearer_token(request)
    if token:
        user_store.delete_session(token)
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return user


@router.patch("/me")
def update_me(payload: ProfileUpdate, user: dict = Depends(current_user)):
    return user_store.update_user(user["id"], **payload.model_dump(exclude_none=True))


@router.post("/password", dependencies=[Depends(_login_rate_limit)])
def change_password(payload: PasswordChange, request: Request, user: dict = Depends(current_user)):
    if user_store.authenticate(user["email"], payload.current_password) is None:
        raise HTTPException(400, "Mot de passe actuel incorrect.")
    user_store.update_user(user["id"], password=payload.new_password)
    # Toutes les sessions ont été fermées : on en rouvre une pour cet appareil.
    return _session_response(user_store.get_user(user["id"]))
