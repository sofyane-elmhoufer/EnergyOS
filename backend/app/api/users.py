"""Gestion des utilisateurs (administrateur uniquement)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app import security
from app.auth import require_roles
from app.roles import ADMIN, ROLE_LABELS, TECHNICIEN, COMMERCIAL
from app.schemas import UserCreate, UserUpdate
from app.services import user_store

router = APIRouter(prefix="/api/users", tags=["Utilisateurs"])


def _ip(request: Request) -> str:
    return security.client_ip(request)


@router.get("")
def list_users(_: dict = Depends(require_roles(ADMIN))):
    sessions = user_store.session_counts()
    return [{**u, "sessions": sessions.get(u["id"], 0)} for u in user_store.list_users()]


@router.get("/audit")
def audit_log(
    action: str | None = Query(None, pattern=r"^[a-z_.]{1,40}$"),
    limit: int = Query(200, ge=1, le=1000),
    _: dict = Depends(require_roles(ADMIN)),
):
    return user_store.list_audit(limit=limit, action=action)


@router.get("/technicians")
def list_technicians(_: dict = Depends(require_roles(ADMIN, COMMERCIAL))):
    """Techniciens actifs, pour l'affectation d'un dossier."""
    return [
        {"id": u["id"], "name": u["name"]}
        for u in user_store.list_users() if u["role"] == TECHNICIEN and u["active"]
    ]


@router.get("/clients")
def list_clients(_: dict = Depends(require_roles(ADMIN, COMMERCIAL))):
    """Comptes clients avec leurs dossiers et la meilleure économie annuelle simulée."""
    projects = user_store.list_projects()
    clients = []
    for u in user_store.list_users():
        if u["role"] != "client":
            continue
        own = [p for p in projects if p["client_id"] == u["id"]]
        clients.append({
            "id": u["id"], "name": u["name"], "email": u["email"], "phone": u["phone"], "company": u["company"],
            "active": u["active"], "created_at": u["created_at"], "last_login_at": u["last_login_at"],
            "projects": len(own),
            "open_projects": sum(p["status"] not in ("lost", "installed") for p in own),
            "installed": sum(p["status"] == "installed" for p in own),
            "best_yearly_saving": max((p["summary"]["yearly_saved_cost"] for p in own), default=0),
            "last_status": own[0]["status"] if own else None,
            "last_simulation": {
                "reference": own[0]["reference"],
                "created_at": own[0]["created_at"],
                "building_label": own[0]["summary"]["building_label"],
                "city_label": own[0]["summary"]["city_label"],
                "monthly_bill": own[0]["summary"]["monthly_bill"],
                "yearly_saved_cost": own[0]["summary"]["yearly_saved_cost"],
            } if own else None,
        })
    return clients


@router.get("/{user_id}/overview")
def user_overview(user_id: int, viewer: dict = Depends(require_roles(ADMIN, COMMERCIAL))):
    """Fiche complète : profil, simulations / dossiers, et (administrateur) activité du compte."""
    target = user_store.get_user(user_id)
    if target is None or (viewer["role"] == COMMERCIAL and target["role"] != "client"):
        raise HTTPException(404, "Utilisateur introuvable.")
    projects = user_store.list_projects(user_id=user_id) if target["role"] == "client" else []
    assigned = user_store.list_projects(technician_id=user_id) if target["role"] == TECHNICIEN else []
    return {
        "user": {**target, "sessions": user_store.session_counts().get(user_id, 0)} if viewer["role"] == ADMIN else target,
        "projects": projects,
        "assigned_projects": assigned,
        "activity": user_store.list_audit(limit=50, about=target) if viewer["role"] == ADMIN else [],
        "totals": {
            "simulations": len(projects),
            "yearly_saving_best": max((p["summary"]["yearly_saved_cost"] for p in projects), default=0),
            "investment_signed": sum(
                p["summary"]["investment_total"] for p in projects if p["status"] in ("won", "scheduled", "installed")
            ),
        },
    }


@router.post("", status_code=201)
def create_user(payload: UserCreate, request: Request, admin: dict = Depends(require_roles(ADMIN))):
    try:
        user = user_store.create_user(
            payload.email, payload.name, payload.role, payload.password, payload.phone, payload.company, payload.address,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    user_store.add_audit("user.create", admin, user["email"], f"Profil {ROLE_LABELS[user['role']]}", _ip(request))
    return user


def _target_or_404(user_id: int) -> dict:
    target = user_store.get_user(user_id)
    if target is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    return target


def _keep_one_admin(target: dict) -> None:
    if target["role"] == ADMIN and target["active"] and user_store.count_admins() <= 1:
        raise HTTPException(400, "Impossible : il doit rester au moins un administrateur actif.")


@router.patch("/{user_id}")
def update_user(user_id: int, payload: UserUpdate, request: Request, admin: dict = Depends(require_roles(ADMIN))):
    target = _target_or_404(user_id)
    changes = payload.model_dump(exclude_none=True)
    losing_admin = target["role"] == ADMIN and target["active"] and (
        changes.get("active") is False or changes.get("role", ADMIN) != ADMIN
    )
    if losing_admin and user_store.count_admins() <= 1:
        raise HTTPException(400, "Impossible : il doit rester au moins un administrateur actif.")
    if user_id == admin["id"] and changes.get("active") is False:
        raise HTTPException(400, "Vous ne pouvez pas désactiver votre propre compte.")
    try:
        updated = user_store.update_user(user_id, **changes)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    described = []
    labels = {"name": "nom", "email": "e-mail", "phone": "téléphone", "company": "société", "address": "adresse"}
    for key, label in labels.items():
        if key in changes and changes[key] != target.get(key):
            described.append(f"{label} modifié")
    if "role" in changes and changes["role"] != target["role"]:
        described.append(f"profil {ROLE_LABELS[target['role']]} → {ROLE_LABELS[changes['role']]}")
    if "active" in changes and changes["active"] != target["active"]:
        described.append("réactivé" if changes["active"] else "désactivé")
    if "password" in changes:
        described.append("mot de passe réinitialisé")
    user_store.add_audit("user.update", admin, target["email"], ", ".join(described) or "aucun changement", _ip(request))
    return updated


@router.post("/{user_id}/logout")
def force_logout(user_id: int, request: Request, admin: dict = Depends(require_roles(ADMIN))):
    """Ferme toutes les sessions du compte (appareil perdu, départ d'un employé…)."""
    target = _target_or_404(user_id)
    closed = user_store.close_sessions(user_id)
    user_store.add_audit("user.logout", admin, target["email"], f"{closed} session(s) fermée(s)", _ip(request))
    return {"closed": closed}


@router.delete("/{user_id}")
def delete_user(user_id: int, request: Request, admin: dict = Depends(require_roles(ADMIN))):
    """Suppression définitive du compte et de ses dossiers (préférer la désactivation pour garder l'historique)."""
    target = _target_or_404(user_id)
    if user_id == admin["id"]:
        raise HTTPException(400, "Vous ne pouvez pas supprimer votre propre compte.")
    _keep_one_admin(target)
    projects = len(user_store.list_projects(user_id=user_id))
    user_store.delete_user(user_id)
    user_store.add_audit(
        "user.delete", admin, target["email"],
        f"Profil {ROLE_LABELS[target['role']]}, {projects} dossier(s) supprimé(s)", _ip(request),
    )
    return {"ok": True}
