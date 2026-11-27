"""
Dossiers clients : simulations enregistrées par les clients, puis suivies
par les commerciaux (contact, acceptation) et les techniciens (installation).
"""

from fastapi import APIRouter, Depends, HTTPException, Request

from app import security

from app.auth import current_user, require_roles
from app.roles import ADMIN, CLIENT, COMMERCIAL, PROJECT_STATUSES, STATUS_RIGHTS, TECHNICIEN
from app.schemas import ProjectCreate, ProjectUpdate
from app.services import simulation_service, user_store

router = APIRouter(prefix="/api/projects", tags=["Dossiers clients"])

MAX_PROJECTS_PER_CLIENT = 50


def summarize(estimate: dict) -> dict:
    """Chiffres clés gardés avec le dossier (recalculés côté serveur, jamais reçus du navigateur)."""
    inputs, monthly, yearly, investment = estimate["inputs"], estimate["monthly"], estimate["yearly"], estimate["investment"]
    return {
        "building_label": inputs["building_label"],
        "city_label": inputs["city_label"],
        "monthly_bill": monthly["bill_without_shelly"],
        "monthly_bill_with_shelly": monthly["bill_with_shelly"],
        "yearly_saved_cost": yearly["saved_cost"],
        "yearly_saved_kwh": yearly["saved_kwh"],
        "investment_total": investment["total"],
        "modules": investment["modules"],
        "payback_months": investment["payback_months"],
        "currency": estimate["currency"],
    }


def _strip_contact(project: dict) -> dict:
    """Le client voit son dossier sans la note interne de l'équipe."""
    return {key: value for key, value in project.items() if key != "note"}


def _for_technician(project: dict) -> dict:
    """Le technicien voit ce qu'il faut pour la visite : client, adresse, horaire, matériel, consignes."""
    hidden = {"summary"}
    data = {key: value for key, value in project.items() if key not in hidden}
    s = project["summary"]
    data["summary"] = {k: s[k] for k in ("building_label", "city_label", "modules", "currency")}
    data["summary"].update({"monthly_bill": 0, "monthly_bill_with_shelly": 0, "yearly_saved_cost": 0,
                            "yearly_saved_kwh": 0, "investment_total": 0, "payback_months": None})
    return data


@router.post("/mine", status_code=201)
def save_my_project(payload: ProjectCreate, user: dict = Depends(require_roles(CLIENT))):
    if len(user_store.list_projects(user_id=user["id"])) >= MAX_PROJECTS_PER_CLIENT:
        raise HTTPException(400, "Nombre maximal de simulations enregistrées atteint. Supprimez-en une.")
    estimate = simulation_service.estimate(payload.simulation)
    try:
        project = user_store.create_project(
            user["id"], payload.reference, payload.simulation.model_dump(exclude_none=True), summarize(estimate),
            site_address=payload.site_address or user.get("address", ""),
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _strip_contact(project)


@router.get("/mine")
def my_projects(user: dict = Depends(require_roles(CLIENT))):
    return [_strip_contact(p) for p in user_store.list_projects(user_id=user["id"])]


@router.delete("/mine/{project_id}")
def delete_my_project(project_id: int, user: dict = Depends(require_roles(CLIENT))):
    project = user_store.get_project(project_id)
    if project is None or project["client_id"] != user["id"]:
        raise HTTPException(404, "Dossier introuvable.")
    if project["status"] != "new":
        raise HTTPException(400, "Ce dossier est déjà suivi par notre équipe : contactez-nous pour l'annuler.")
    user_store.delete_project(project_id)
    return {"ok": True}


@router.get("")
def list_projects(user: dict = Depends(require_roles(COMMERCIAL, TECHNICIEN, ADMIN))):
    if user["role"] == TECHNICIEN:
        # Uniquement les visites qui lui sont affectées, sans les montants commerciaux.
        projects = user_store.list_projects(technician_id=user["id"], statuses=("scheduled", "installed"))
        return [_for_technician(p) for p in projects]
    return user_store.list_projects()


@router.patch("/{project_id}")
def update_project(project_id: int, payload: ProjectUpdate, request: Request, user: dict = Depends(current_user)):
    role = user["role"]
    if role not in (COMMERCIAL, TECHNICIEN, ADMIN):
        raise HTTPException(403, "Votre profil n'a pas accès à cette fonctionnalité.")
    project = user_store.get_project(project_id)
    if project is None or (role == TECHNICIEN and (
        project["technician_id"] != user["id"] or project["status"] not in ("scheduled", "installed")
    )):
        raise HTTPException(404, "Dossier introuvable.")

    changes = payload.model_dump(exclude_none=True)
    if role == TECHNICIEN:
        # Le technicien confirme l'installation et rédige son compte rendu, rien d'autre.
        forbidden = set(changes) - {"status", "report"}
        if forbidden:
            raise HTTPException(403, "Le technicien ne peut que confirmer l'installation et rédiger le compte rendu.")
    elif "report" in changes and role != ADMIN:
        raise HTTPException(403, "Le compte rendu est rédigé par le technicien.")
    if "visit_at" in changes:
        changes["visit_at"] = changes["visit_at"] or None
    if "status" in changes and changes["status"] != project["status"] and changes["status"] not in STATUS_RIGHTS[role]:
        raise HTTPException(403, "Votre profil ne peut pas attribuer ce statut.")
    if "technician_id" in changes:
        if role == TECHNICIEN:
            raise HTTPException(403, "Seuls le commercial et l'administrateur affectent un technicien.")
        if changes["technician_id"] == 0:
            changes["technician_id"] = None
        else:
            tech = user_store.get_user(changes["technician_id"])
            if tech is None or tech["role"] != TECHNICIEN or not tech["active"]:
                raise HTTPException(400, "Technicien introuvable.")
    # Planifier une visite (date + technicien) sur un dossier accepté le passe en « Installation planifiée ».
    tech_after = changes.get("technician_id", project["technician_id"]) if "technician_id" in changes else project["technician_id"]
    visit_after = changes["visit_at"] if "visit_at" in changes else project["visit_at"]
    if "status" not in changes and project["status"] == "won" and tech_after and visit_after:
        changes["status"] = "scheduled"
    if changes.get("status") == "scheduled" and not (tech_after and visit_after):
        raise HTTPException(400, "Pour planifier, indiquez le technicien et la date de visite.")
    if changes.get("status") == "installed" and project["status"] != "installed":
        changes["installed_at"] = user_store.now()
    updated = user_store.update_project(project_id, **changes)
    if role == TECHNICIEN:
        updated = _for_technician(updated)
    if "status" in changes and changes["status"] != project["status"]:
        user_store.add_audit(
            "project.status", user, project["reference"],
            f"{PROJECT_STATUSES[project['status']]} → {PROJECT_STATUSES[changes['status']]} ({project['client_name']})",
            security.client_ip(request),
        )
    return updated


@router.delete("/{project_id}")
def delete_project(project_id: int, request: Request, admin: dict = Depends(require_roles(ADMIN))):
    project = user_store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Dossier introuvable.")
    user_store.delete_project(project_id)
    user_store.add_audit("project.delete", admin, project["reference"], f"Client {project['client_name']}", security.client_ip(request))
    return {"ok": True}
