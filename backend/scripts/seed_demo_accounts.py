"""
Crée un compte de démonstration pour chaque profil (client, commercial, technicien, administrateur),
avec des mots de passe aléatoires écrits dans backend/data/comptes_demo.txt (fichier jamais versionné).

Depuis la racine :
    backend/.venv/bin/python backend/scripts/seed_demo_accounts.py
Les comptes déjà présents ne sont pas modifiés.
"""

import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.roles import ROLE_LABELS  # noqa: E402
from app.services import user_store  # noqa: E402

ACCOUNTS = [
    ("admin@energyos.demo", "Admin Démo", "admin"),
    ("commercial@energyos.demo", "Commercial Démo", "commercial"),
    ("technicien@energyos.demo", "Technicien Démo", "technicien"),
    ("client@energyos.demo", "Client Démo", "client"),
]
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "comptes_demo.txt"


def main() -> None:
    lines = []
    for email, name, role in ACCOUNTS:
        password = secrets.token_urlsafe(9)
        try:
            user_store.create_user(email, name, role, password)
        except ValueError:
            print(f"Déjà présent, inchangé : {email}")
            continue
        lines.append(f"{ROLE_LABELS[role]:<15} {email:<28} {password}")
    if lines:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        with OUTPUT.open("a", encoding="utf-8") as file:
            file.write("\n".join(lines) + "\n")
        print(f"{len(lines)} compte(s) créé(s). Identifiants dans : {OUTPUT}")


if __name__ == "__main__":
    main()
