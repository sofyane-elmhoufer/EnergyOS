"""Dépendances FastAPI d'authentification : lecture du jeton « Authorization: Bearer » et contrôle des profils."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request

from app.services import user_store


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 200:
        return None
    return token.strip()


def current_user_optional(request: Request) -> dict | None:
    """Utilisateur connecté, ou None pour un invité."""
    token = bearer_token(request)
    return user_store.user_from_token(token) if token else None


def current_user(user: dict | None = Depends(current_user_optional)) -> dict:
    if user is None:
        raise HTTPException(401, "Connectez-vous pour accéder à cette fonctionnalité.")
    return user


def require_roles(*roles: str):
    """Dépendance qui n'accepte que les profils indiqués."""

    def checker(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Votre profil n'a pas accès à cette fonctionnalité.")
        return user

    return checker
