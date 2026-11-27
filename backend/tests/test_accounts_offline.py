"""
Test hors ligne des comptes, des 5 profils et des dossiers clients (base SQLite temporaire, sans Groq).
Lancer depuis la racine :
    backend/.venv/bin/python backend/tests/test_accounts_offline.py
"""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

tmp = tempfile.TemporaryDirectory()
os.environ["ENSA_DB_PATH"] = str(Path(tmp.name) / "test.db")
os.environ["ENSA_LOGIN_RATE_PER_MINUTE"] = "1000"
# Valeurs vides : backend/.env ne doit pas créer d'administrateur dans la base de test.
os.environ["ENSA_ADMIN_EMAIL"] = ""
os.environ["ENSA_ADMIN_PASSWORD"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import user_store  # noqa: E402

client = TestClient(app, base_url="http://localhost")
PASSWORD = "MotDePasse-Test-123"
SIMULATION = {"monthly_bill": 1500, "building_type": "office", "city": "fes",
              "appliances": [{"type": "lighting", "quantity": 60}]}


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login(email: str, password: str = PASSWORD) -> str:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["token"]


# --- Invité : tableaux de bord et simulation sans compte, pas d'agent IA ni de zones internes
assert client.get("/api/analytics/kpis").status_code == 200
assert client.post("/api/simulation/estimate", json=SIMULATION).status_code == 200
assert client.post("/api/agent/chat", json={"question": "test"}).status_code == 401
for path in ("/api/status", "/api/users", "/api/users/clients", "/api/projects", "/api/projects/mine", "/api/datasets",
             "/api/analytics/alerts", "/api/analytics/forecast", "/api/analytics/filters"):
    assert client.get(path).status_code == 401, path
print("OK invité")

# --- Comptes du personnel créés « par l'administrateur » (ici directement en base)
user_store.create_user("admin@test.local", "Admin Test", "admin", PASSWORD)
user_store.create_user("com@test.local", "Commercial Test", "commercial", PASSWORD)
tech = user_store.create_user("tech@test.local", "Technicien Test", "technicien", PASSWORD)
admin_t, com_t, tech_t = login("admin@test.local"), login("com@test.local"), login("tech@test.local")

# --- Client : inscription publique (toujours profil client, même si on tente autre chose)
r = client.post("/api/auth/register", json={"email": "client@test.local", "name": "Client Test", "password": PASSWORD, "role": "admin"})
assert r.status_code == 422, r.text  # champ « role » refusé
r = client.post("/api/auth/register", json={"email": "Client@Test.local", "name": "Client Test", "password": PASSWORD})
assert r.status_code == 200 and r.json()["user"]["role"] == "client", r.text
client_t = r.json()["token"]
assert client.post("/api/auth/register", json={"email": "client@test.local", "name": "X Y", "password": PASSWORD}).status_code == 409
assert client.post("/api/auth/login", json={"email": "client@test.local", "password": "mauvais"}).status_code == 401
assert client.post("/api/auth/login", json={"email": "inconnu@test.local", "password": "mauvais"}).json()["detail"] == "E-mail ou mot de passe incorrect."
assert client.get("/api/auth/me", headers=auth(client_t)).json()["email"] == "client@test.local"
assert client.patch("/api/auth/me", json={"phone": "0600000000"}, headers=auth(client_t)).json()["phone"] == "0600000000"
print("OK inscription, connexion, profil")

# --- Le client enregistre une simulation (résumé recalculé côté serveur)
r = client.post("/api/projects/mine", json={"reference": "DEV-20261127-ABC123", "simulation": SIMULATION}, headers=auth(client_t))
assert r.status_code == 201, r.text
project = r.json()
assert project["status"] == "new" and project["summary"]["monthly_bill"] > 0 and "note" not in project
assert client.post("/api/projects/mine", json={"reference": "DEV-20261127-ABC123", "simulation": SIMULATION}, headers=auth(client_t)).status_code == 409
assert len(client.get("/api/projects/mine", headers=auth(client_t)).json()) == 1
assert client.get("/api/projects", headers=auth(client_t)).status_code == 403
assert client.post("/api/projects/mine", json={"reference": "DEV-20261127-ABC124", "simulation": SIMULATION}, headers=auth(com_t)).status_code == 403
# Le client n'a pas accès aux données internes du campus ni à l'agent du campus
for path in ("/api/analytics/alerts", "/api/analytics/forecast", "/api/users/clients"):
    assert client.get(path, headers=auth(client_t)).status_code == 403, path
assert client.post("/api/agent/chat", json={"question": "test"}, headers=auth(client_t)).status_code == 403
print("OK espace client")

# --- Commercial : voit tous les dossiers, contacte, accepte, affecte un technicien
pid = project["id"]
assert len(client.get("/api/projects", headers=auth(com_t)).json()) == 1
assert client.patch(f"/api/projects/{pid}", json={"status": "installed"}, headers=auth(com_t)).status_code == 403
r = client.patch(f"/api/projects/{pid}", json={"status": "won", "note": "RDV pris", "technician_id": tech["id"]}, headers=auth(com_t))
assert r.status_code == 200 and r.json()["technician_name"] == "Technicien Test", r.text
assert client.patch(f"/api/projects/{pid}", json={"technician_id": 9999}, headers=auth(com_t)).status_code == 400
assert client.get("/api/users", headers=auth(com_t)).status_code == 403
assert len(client.get("/api/users/technicians", headers=auth(com_t)).json()) == 1
clients = client.get("/api/users/clients", headers=auth(com_t)).json()
assert len(clients) == 1 and clients[0]["projects"] == 1 and clients[0]["best_yearly_saving"] > 0
assert client.get("/api/analytics/alerts", headers=auth(com_t)).status_code == 403
assert clients[0]["last_simulation"]["reference"] == "DEV-20261127-ABC123"
client_id = clients[0]["id"]
ov = client.get(f"/api/users/{client_id}/overview", headers=auth(com_t)).json()
assert ov["totals"]["simulations"] == 1 and ov["projects"][0]["reference"] == "DEV-20261127-ABC123" and ov["activity"] == []
assert client.get(f"/api/users/{tech['id']}/overview", headers=auth(com_t)).status_code == 404  # commercial : clients seulement
assert client.get(f"/api/users/{client_id}/overview", headers=auth(client_t)).status_code == 403
print("OK commercial")

# --- Technicien : ne voit que les dossiers à installer, planifie puis installe
assert client.get("/api/projects", headers=auth(tech_t)).json()[0]["status"] == "won"
assert client.patch(f"/api/projects/{pid}", json={"status": "lost"}, headers=auth(tech_t)).status_code == 403
assert client.patch(f"/api/projects/{pid}", json={"technician_id": 0}, headers=auth(tech_t)).status_code == 403
assert client.patch(f"/api/projects/{pid}", json={"status": "installed"}, headers=auth(tech_t)).json()["status"] == "installed"
assert client.get("/api/status", headers=auth(tech_t)).status_code == 200
assert client.get("/api/users", headers=auth(tech_t)).status_code == 403
assert client.get("/api/users/clients", headers=auth(tech_t)).status_code == 403
assert client.get("/api/analytics/alerts", headers=auth(tech_t)).status_code == 200
assert client.get("/api/analytics/forecast", headers=auth(tech_t)).status_code == 200
# Le client ne peut plus supprimer un dossier suivi par l'équipe
assert client.delete(f"/api/projects/mine/{pid}", headers=auth(client_t)).status_code == 400
print("OK technicien")

# --- Administrateur : gère les comptes, garde au moins un admin
r = client.post("/api/users", json={"email": "new@test.local", "name": "Nouveau", "password": PASSWORD, "role": "commercial"}, headers=auth(admin_t))
assert r.status_code == 201, r.text
new_id = r.json()["id"]
new_t = login("new@test.local")
assert client.patch(f"/api/users/{new_id}", json={"active": False}, headers=auth(admin_t)).json()["active"] is False
assert client.get("/api/auth/me", headers=auth(new_t)).status_code == 401  # sessions fermées
assert client.post("/api/auth/login", json={"email": "new@test.local", "password": PASSWORD}).status_code == 401
admin_id = client.get("/api/auth/me", headers=auth(admin_t)).json()["id"]
assert client.patch(f"/api/users/{admin_id}", json={"role": "client"}, headers=auth(admin_t)).status_code == 400
assert client.post("/api/users", json={"email": "x@test.local", "name": "X Y", "password": PASSWORD, "role": "superadmin"}, headers=auth(admin_t)).status_code == 422
assert client.get("/api/users", headers=auth(admin_t)).status_code == 200
# Fiche complète vue par l'administrateur : simulations, activité, techniciens
ov = client.get(f"/api/users/{client_id}/overview", headers=auth(admin_t)).json()
assert ov["projects"] and any(e["action"] == "auth.register" for e in ov["activity"]) and "sessions" in ov["user"]
tov = client.get(f"/api/users/{tech['id']}/overview", headers=auth(admin_t)).json()
assert tov["assigned_projects"] and tov["assigned_projects"][0]["reference"] == "DEV-20261127-ABC123"

# Modification complète d'un compte (dont l'e-mail), déconnexion forcée, suppression définitive
r = client.post("/api/users", json={"email": "edit@test.local", "name": "A Modifier", "password": PASSWORD, "role": "technicien"}, headers=auth(admin_t))
edit_id = r.json()["id"]
edit_t = login("edit@test.local")
r = client.patch(f"/api/users/{edit_id}", json={"email": "Edite@Test.local", "name": "Modifié", "phone": "0611"}, headers=auth(admin_t))
assert r.status_code == 200 and r.json()["email"] == "edite@test.local", r.text
assert client.get("/api/auth/me", headers=auth(edit_t)).status_code == 401  # e-mail changé : sessions fermées
assert client.patch(f"/api/users/{edit_id}", json={"email": "com@test.local"}, headers=auth(admin_t)).status_code == 409
edit_t = login("edite@test.local")
assert client.post(f"/api/users/{edit_id}/logout", headers=auth(admin_t)).json()["closed"] == 1
assert client.get("/api/auth/me", headers=auth(edit_t)).status_code == 401
assert any(u["id"] == edit_id and u["sessions"] == 0 for u in client.get("/api/users", headers=auth(admin_t)).json())
assert client.delete(f"/api/users/{edit_id}", headers=auth(com_t)).status_code == 403
assert client.delete(f"/api/users/{admin_id}", headers=auth(admin_t)).status_code == 400  # pas soi-même
assert client.delete(f"/api/users/{edit_id}", headers=auth(admin_t)).status_code == 200
assert client.post("/api/auth/login", json={"email": "edite@test.local", "password": PASSWORD}).status_code == 401
assert client.delete("/api/users/99999", headers=auth(admin_t)).status_code == 404

# Suppression d'un client : ses dossiers partent avec lui
r = client.post("/api/auth/register", json={"email": "byebye@test.local", "name": "Client Supprimé", "password": PASSWORD})
bye_t, bye_id = r.json()["token"], r.json()["user"]["id"]
client.post("/api/projects/mine", json={"reference": "DEV-20261127-BBB111", "simulation": SIMULATION}, headers=auth(bye_t))
assert any(p["reference"] == "DEV-20261127-BBB111" for p in client.get("/api/projects", headers=auth(admin_t)).json())
assert client.delete(f"/api/users/{bye_id}", headers=auth(admin_t)).status_code == 200
assert not any(p["reference"] == "DEV-20261127-BBB111" for p in client.get("/api/projects", headers=auth(admin_t)).json())

# Suppression d'un dossier : administrateur uniquement
r = client.post("/api/projects/mine", json={"reference": "DEV-20261127-CCC222", "simulation": SIMULATION}, headers=auth(client_t))
del_pid = r.json()["id"]
assert client.delete(f"/api/projects/{del_pid}", headers=auth(com_t)).status_code == 403
assert client.delete(f"/api/projects/{del_pid}", headers=auth(admin_t)).status_code == 200

# Journal d'activité : administrateur uniquement, sans mot de passe
assert client.get("/api/users/audit", headers=auth(com_t)).status_code == 403
log = client.get("/api/users/audit", headers=auth(admin_t)).json()
actions = {e["action"] for e in log}
assert {"auth.login", "auth.failed", "auth.register", "user.create", "user.update", "user.delete", "user.logout",
        "project.status", "project.delete"} <= actions, actions
assert PASSWORD not in str(log)
assert all(e["action"] == "user.delete" for e in client.get("/api/users/audit?action=user.delete", headers=auth(admin_t)).json())
print("OK administrateur")

# --- Mot de passe : changement, anciennes sessions fermées
r = client.post("/api/auth/password", json={"current_password": PASSWORD, "new_password": "Nouveau-Mdp-456"}, headers=auth(client_t))
assert r.status_code == 200, r.text
assert client.get("/api/auth/me", headers=auth(client_t)).status_code == 401
assert client.get("/api/auth/me", headers=auth(r.json()["token"])).status_code == 200
login("client@test.local", "Nouveau-Mdp-456")
client.post("/api/auth/logout", headers=auth(admin_t))
assert client.get("/api/auth/me", headers=auth(admin_t)).status_code == 401
print("OK mot de passe et déconnexion")

# --- Mot de passe stocké haché, jamais en clair
with user_store.connect() as conn:
    stored = conn.execute("SELECT password_hash FROM users WHERE email = 'client@test.local'").fetchone()[0]
assert stored.startswith("scrypt$") and "Nouveau-Mdp-456" not in stored
print("\nTEST COMPTES HORS-LIGNE RÉUSSI")
