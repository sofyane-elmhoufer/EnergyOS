"""
Crée un compte (par exemple le premier administrateur).

Depuis la racine du projet :
    backend/.venv/bin/python backend/scripts/create_user.py            (Mac / Linux)
    backend\.venv\Scripts\python.exe backend\scripts\create_user.py    (Windows)

Le mot de passe est demandé sans être affiché.
"""

import getpass
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.roles import ACCOUNT_ROLES, ROLE_LABELS  # noqa: E402
from app.services import user_store  # noqa: E402

EMAIL_RE = re.compile(r"^[^@\s<>,;\"]+@[^@\s<>,;\"]+\.[^@\s<>,;\"]{2,}$")


def ask(prompt: str, check, error: str) -> str:
    while True:
        value = input(prompt).strip()
        if check(value):
            return value
        print("  " + error)


def main() -> None:
    print("Création d'un compte ENSA EnergyOS")
    print("Profils : " + ", ".join(f"{r} ({ROLE_LABELS[r]})" for r in ACCOUNT_ROLES))
    role = ask("Profil [admin] : ", lambda v: v in ("",) + ACCOUNT_ROLES, "Profil inconnu.") or "admin"
    email = ask("E-mail : ", EMAIL_RE.match, "Adresse e-mail invalide.")
    name = ask("Nom complet : ", lambda v: 2 <= len(v) <= 80, "Entre 2 et 80 caractères.")
    while True:
        password = getpass.getpass("Mot de passe (8 caractères minimum) : ")
        if len(password) < 8:
            print("  Trop court.")
        elif password != getpass.getpass("Confirmez le mot de passe : "):
            print("  Les deux mots de passe sont différents.")
        else:
            break
    try:
        user = user_store.create_user(email, name, role, password)
    except ValueError as exc:
        sys.exit(f"Erreur : {exc}")
    print(f"Compte créé : {user['email']} ({ROLE_LABELS[user['role']]}). Base : {user_store.db_path()}")


if __name__ == "__main__":
    main()
