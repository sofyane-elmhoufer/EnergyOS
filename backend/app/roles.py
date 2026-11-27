"""
Profils et droits d'accès.

- guest (invité) : visiteur sans compte. Tableaux de bord, simulation et devis PDF.
- client : + agent IA, sauvegarde de ses simulations / devis, suivi de son dossier.
- commercial : + suivi de tous les dossiers clients (contacté, accepté, perdu), affectation d'un technicien.
- technicien : + dossiers acceptés à installer (planifié, installé), état du système.
- admin : tout, dont la gestion des utilisateurs.
"""

GUEST = "guest"
CLIENT = "client"
COMMERCIAL = "commercial"
TECHNICIEN = "technicien"
ADMIN = "admin"

# Profils qui existent en base (l'invité n'a pas de compte).
ACCOUNT_ROLES = (CLIENT, COMMERCIAL, TECHNICIEN, ADMIN)
STAFF_ROLES = (COMMERCIAL, TECHNICIEN, ADMIN)

ROLE_LABELS = {
    GUEST: "Invité",
    CLIENT: "Client",
    COMMERCIAL: "Commercial",
    TECHNICIEN: "Technicien",
    ADMIN: "Administrateur",
}

# Étapes d'un dossier client (une simulation enregistrée par un client).
PROJECT_STATUSES = {
    "new": "Nouveau",
    "contacted": "Contacté",
    "won": "Accepté",
    "lost": "Perdu",
    "scheduled": "Installation planifiée",
    "installed": "Installé",
}

# Statuts qu'un profil peut attribuer à un dossier.
# Le commercial planifie la visite (date, heure, adresse, technicien) ; le technicien ne voit que
# ses visites et confirme seulement l'installation.
STATUS_RIGHTS = {
    COMMERCIAL: {"new", "contacted", "won", "lost", "scheduled"},
    TECHNICIEN: {"installed"},
    ADMIN: set(PROJECT_STATUSES),
}
