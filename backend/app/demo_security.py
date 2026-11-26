
import os

from fastapi import HTTPException


def require_dataset_write_access():
    """
    Bloque les modifications de datasets
    lorsque le mode démonstration est actif.
    """
    demo_mode = os.getenv(
        "ENSA_DEMO_MODE", "true"
    ).lower() == "true"

    if demo_mode:
        raise HTTPException(
            status_code=403,
            detail=(
                "Modification des datasets désactivée "
                "en mode démonstration."
            ),
        )
