"""Gestion des utilisateurs (administrateur uniquement)."""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_roles
from app.roles import ADMIN, TECHNICIEN, COMMERCIAL
from app.schemas import UserCreate, UserUpdate
from app.services import user_store

router = APIRouter(prefix="/api/users", tags=["Utilisateurs"])


@router.get("")
def list_users(_: dict = Depends(require_roles(ADMIN))):
    return user_store.list_users()


@router.get("/technicians")
def list_technicians(_: dict = Depends(require_roles(ADMIN, COMMERCIAL))):
    """Techniciens actifs, pour l'affectation d'un dossier."""
    return [
        {"id": u["id"], "name": u["name"]}
        for u in user_store.list_users() if u["role"] == TECHNICIEN and u["active"]
    ]


@router.post("", status_code=201)
def create_user(payload: UserCreate, _: dict = Depends(require_roles(ADMIN))):
    try:
        return user_store.create_user(
            payload.email, payload.name, payload.role, payload.password, payload.phone, payload.company,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.patch("/{user_id}")
def update_user(user_id: int, payload: UserUpdate, admin: dict = Depends(require_roles(ADMIN))):
    target = user_store.get_user(user_id)
    if target is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    changes = payload.model_dump(exclude_none=True)
    losing_admin = target["role"] == ADMIN and target["active"] and (
        changes.get("active") is False or changes.get("role", ADMIN) != ADMIN
    )
    if losing_admin and user_store.count_admins() <= 1:
        raise HTTPException(400, "Impossible : il doit rester au moins un administrateur actif.")
    if user_id == admin["id"] and changes.get("active") is False:
        raise HTTPException(400, "Vous ne pouvez pas désactiver votre propre compte.")
    return user_store.update_user(user_id, **changes)
