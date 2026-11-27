"""
Stockage SQLite des comptes, sessions et dossiers clients.

Base : backend/data/app.db (modifiable avec ENSA_DB_PATH). Créée automatiquement
au premier lancement ; elle n'est jamais versionnée (voir .gitignore).

Sécurité :
- mots de passe hachés avec scrypt (sel aléatoire, comparaison en temps constant) ;
- jetons de session aléatoires, seule leur empreinte SHA-256 est stockée ;
- toutes les requêtes SQL sont paramétrées (pas d'injection SQL).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
SESSION_DAYS = 7

_init_lock = threading.Lock()
_initialized: set[str] = set()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reference TEXT NOT NULL UNIQUE,
    request_json TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    technician_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    actor_id INTEGER,
    actor_name TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT ''
);
"""
AUDIT_KEEP = 5000  # nombre d'événements conservés dans le journal


def db_path() -> Path:
    return Path(os.getenv("ENSA_DB_PATH") or BACKEND_DIR / "data" / "app.db")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    path = db_path()
    key = str(path.resolve())
    if key not in _initialized:
        with _init_lock:
            if key not in _initialized:
                path.parent.mkdir(parents=True, exist_ok=True)
                with sqlite3.connect(path) as conn:
                    conn.executescript(SCHEMA)
                _initialized.add(key)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# --- Mots de passe ----------------------------------------------------------

_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_b64, digest_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(digest_b64)
        digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), **_SCRYPT)
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


# Calcul factice pour qu'un e-mail inconnu prenne autant de temps qu'un mauvais mot de passe.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


# --- Utilisateurs -----------------------------------------------------------

USER_FIELDS = "id, email, name, role, phone, company, active, created_at, last_login_at"


def public_user(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    user = {key: row[key] for key in row.keys() if key != "password_hash"}
    user["active"] = bool(user["active"])
    return user


def create_user(email: str, name: str, role: str, password: str, phone: str = "", company: str = "") -> dict:
    with connect() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO users (email, name, role, password_hash, phone, company, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (email.strip().lower(), name.strip(), role, hash_password(password), phone.strip(), company.strip(), now()),
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("Un compte existe déjà avec cette adresse e-mail.") from exc
        return public_user(conn.execute(f"SELECT {USER_FIELDS} FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone())


def get_user(user_id: int) -> dict | None:
    with connect() as conn:
        return public_user(conn.execute(f"SELECT {USER_FIELDS} FROM users WHERE id = ?", (user_id,)).fetchone())


def list_users() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(f"SELECT {USER_FIELDS} FROM users ORDER BY created_at DESC").fetchall()
    return [public_user(row) for row in rows]


def count_admins(active_only: bool = True) -> int:
    with connect() as conn:
        query = "SELECT COUNT(*) FROM users WHERE role = 'admin'" + (" AND active = 1" if active_only else "")
        return conn.execute(query).fetchone()[0]


def update_user(user_id: int, **fields) -> dict | None:
    allowed = {"name", "email", "role", "phone", "company", "active"}
    if fields.get("email"):
        fields["email"] = fields["email"].strip().lower()
    updates = {key: value for key, value in fields.items() if key in allowed and value is not None}
    password = fields.get("password")
    with connect() as conn:
        if updates:
            assignments = ", ".join(f"{key} = ?" for key in updates)
            values = [int(v) if isinstance(v, bool) else (v.strip() if isinstance(v, str) else v) for v in updates.values()]
            try:
                conn.execute(f"UPDATE users SET {assignments} WHERE id = ?", (*values, user_id))
            except sqlite3.IntegrityError as exc:
                raise ValueError("Un compte existe déjà avec cette adresse e-mail.") from exc
        if password:
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user_id))
        if password or updates.get("active") is False or "role" in updates or "email" in updates:
            # Mot de passe, profil ou statut changé : les sessions ouvertes sont fermées.
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        return public_user(conn.execute(f"SELECT {USER_FIELDS} FROM users WHERE id = ?", (user_id,)).fetchone())


def delete_user(user_id: int) -> None:
    """Suppression définitive : sessions et dossiers du compte supprimés, affectations de technicien retirées."""
    with connect() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def close_sessions(user_id: int) -> int:
    with connect() as conn:
        return conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,)).rowcount


def session_counts() -> dict[int, int]:
    """Nombre de sessions ouvertes par utilisateur (appareils connectés)."""
    with connect() as conn:
        rows = conn.execute("SELECT user_id, COUNT(*) FROM sessions WHERE expires_at > ? GROUP BY user_id", (now(),)).fetchall()
    return {row[0]: row[1] for row in rows}


def authenticate(email: str, password: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    if row is None:
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, row["password_hash"]) or not row["active"]:
        return None
    return public_user(row)


# --- Sessions ---------------------------------------------------------------

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    created = datetime.now(timezone.utc)
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now(),))
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (_token_hash(token), user_id, created.isoformat(timespec="seconds"),
             (created + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")),
        )
        conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now(), user_id))
    return token


def user_from_token(token: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            f"SELECT {', '.join('u.' + f.strip() for f in USER_FIELDS.split(','))} FROM sessions s "
            "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1",
            (_token_hash(token), now()),
        ).fetchone()
    return public_user(row)


def delete_session(token: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


# --- Dossiers clients -------------------------------------------------------

PROJECT_SELECT = """
SELECT p.id, p.reference, p.request_json, p.summary_json, p.status, p.note, p.created_at, p.updated_at,
       p.technician_id, t.name AS technician_name,
       u.id AS client_id, u.name AS client_name, u.email AS client_email, u.phone AS client_phone,
       u.company AS client_company
FROM projects p
JOIN users u ON u.id = p.user_id
LEFT JOIN users t ON t.id = p.technician_id
"""


def _project(row: sqlite3.Row) -> dict:
    project = dict(row)
    project["request"] = json.loads(project.pop("request_json"))
    project["summary"] = json.loads(project.pop("summary_json"))
    return project


def create_project(user_id: int, reference: str, request: dict, summary: dict) -> dict:
    stamp = now()
    with connect() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO projects (user_id, reference, request_json, summary_json, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, reference, json.dumps(request), json.dumps(summary), stamp, stamp),
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("Ce devis est déjà enregistré.") from exc
        return _project(conn.execute(PROJECT_SELECT + " WHERE p.id = ?", (cursor.lastrowid,)).fetchone())


def list_projects(user_id: int | None = None, statuses: tuple[str, ...] | None = None) -> list[dict]:
    clauses, values = [], []
    if user_id is not None:
        clauses.append("p.user_id = ?")
        values.append(user_id)
    if statuses:
        clauses.append(f"p.status IN ({', '.join('?' for _ in statuses)})")
        values.extend(statuses)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with connect() as conn:
        rows = conn.execute(PROJECT_SELECT + where + " ORDER BY p.created_at DESC", values).fetchall()
    return [_project(row) for row in rows]


def get_project(project_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute(PROJECT_SELECT + " WHERE p.id = ?", (project_id,)).fetchone()
    return _project(row) if row else None


def update_project(project_id: int, **fields) -> dict | None:
    updates = {key: value for key, value in fields.items() if key in {"status", "note", "technician_id"}}
    if updates:
        assignments = ", ".join(f"{key} = ?" for key in updates)
        with connect() as conn:
            conn.execute(
                f"UPDATE projects SET {assignments}, updated_at = ? WHERE id = ?",
                (*updates.values(), now(), project_id),
            )
    return get_project(project_id)


def delete_project(project_id: int) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))


# --- Journal d'activité -------------------------------------------------------

def add_audit(action: str, actor: dict | None = None, target: str = "", details: str = "", ip: str = "") -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO audit_log (created_at, actor_id, actor_name, action, target, details, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (now(), actor["id"] if actor else None, actor["name"] if actor else "", action, target[:200], details[:500], ip[:64]),
        )
        conn.execute(
            "DELETE FROM audit_log WHERE id <= (SELECT id FROM audit_log ORDER BY id DESC LIMIT 1 OFFSET ?)", (AUDIT_KEEP,),
        )


def list_audit(limit: int = 200, action: str | None = None, about: dict | None = None) -> list[dict]:
    """Événements du journal ; `about` = un utilisateur (ce qu'il a fait ou ce qui le concerne)."""
    clauses, values = [], []
    if action:
        clauses.append("action = ?")
        values.append(action)
    if about:
        clauses.append("(actor_id = ? OR target = ?)")
        values.extend([about["id"], about["email"]])
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with connect() as conn:
        rows = conn.execute(f"SELECT * FROM audit_log{where} ORDER BY id DESC LIMIT ?", (*values, limit)).fetchall()
    return [dict(row) for row in rows]


# --- Premier administrateur ----------------------------------------------------

def ensure_initial_admin(logger=None) -> dict | None:
    """
    Au démarrage : s'il n'existe encore aucun administrateur, le crée à partir de
    ENSA_ADMIN_EMAIL / ENSA_ADMIN_PASSWORD (et ENSA_ADMIN_NAME) lus dans backend/.env.
    Sans ces variables, rien n'est créé (aucun mot de passe par défaut) et un message l'indique.
    """
    if count_admins(active_only=False) > 0:
        return None
    email = os.getenv("ENSA_ADMIN_EMAIL", "").strip()
    password = os.getenv("ENSA_ADMIN_PASSWORD", "")
    if not email or len(password) < 8:
        if logger:
            logger.warning(
                "Aucun administrateur : renseignez ENSA_ADMIN_EMAIL et ENSA_ADMIN_PASSWORD (8 caractères min.) "
                "dans backend/.env puis redémarrez, ou lancez backend/scripts/create_user.py."
            )
        return None
    user = create_user(email, os.getenv("ENSA_ADMIN_NAME", "").strip() or "Administrateur", "admin", password)
    if logger:
        logger.info("Premier administrateur créé : %s", user["email"])
    return user
