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
for path in ("/api/status", "/api/users", "/api/projects", "/api/projects/mine", "/api/datasets"):
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
print("OK commercial")

# --- Technicien : ne voit que les dossiers à installer, planifie puis installe
assert client.get("/api/projects", headers=auth(tech_t)).json()[0]["status"] == "won"
assert client.patch(f"/api/projects/{pid}", json={"status": "lost"}, headers=auth(tech_t)).status_code == 403
assert client.patch(f"/api/projects/{pid}", json={"technician_id": 0}, headers=auth(tech_t)).status_code == 403
assert client.patch(f"/api/projects/{pid}", json={"status": "installed"}, headers=auth(tech_t)).json()["status"] == "installed"
assert client.get("/api/status", headers=auth(tech_t)).status_code == 200
assert client.get("/api/users", headers=auth(tech_t)).status_code == 403
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
