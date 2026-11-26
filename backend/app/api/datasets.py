
from pathlib import Path
from tempfile import NamedTemporaryFile
import json
import os

import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.demo_security import require_dataset_write_access
from app.services.dataset_manager import (
    DatasetValidationError,
    register_dataset,
)

router = APIRouter(prefix="/api/datasets", tags=["Datasets"])

BASE_DIR = Path(__file__).resolve().parents[2]
METADATA_DIR = BASE_DIR / "data" / "metadata"
VERSIONS_DIR = BASE_DIR / "data" / "versions"
ACTIVE_FILE = METADATA_DIR / "active.json"

ALLOWED_EXTENSIONS = {".xlsx", ".csv"}
MAX_FILE_SIZE = 30 * 1024 * 1024
DATASET_ID_RE = re.compile(r"[0-9a-f]{32}")


@router.get("")
def list_datasets():
    METADATA_DIR.mkdir(parents=True, exist_ok=True)

    active_id = None
    if ACTIVE_FILE.exists():
        active_id = json.loads(
            ACTIVE_FILE.read_text(encoding="utf-8")
        ).get("dataset_id")

    datasets = []

    for path in METADATA_DIR.glob("*.json"):
        if path.name == "active.json":
            continue

        metadata = json.loads(
            path.read_text(encoding="utf-8")
        )
        metadata["is_active"] = metadata["id"] == active_id
        datasets.append(metadata)

    datasets.sort(
        key=lambda item: item["created_at"],
        reverse=True
    )

    return {"datasets": datasets, "active_dataset_id": active_id}


@router.post(
    "/upload", status_code=201,
    dependencies=[Depends(require_dataset_write_access)],
)
async def upload_dataset(file: UploadFile = File(...)):
    filename = Path(file.filename or "").name
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400, "Seuls les fichiers XLSX et CSV sont acceptés."
        )

    temp_path = None

    try:
        with NamedTemporaryFile(
            delete=False,
            suffix=extension
        ) as temp:
            temp_path = Path(temp.name)
            total = 0

            while chunk := await file.read(1024 * 1024):
                total += len(chunk)

                if total > MAX_FILE_SIZE:
                    raise HTTPException(
                        413, "Fichier trop volumineux (maximum 30 Mo)."
                    )

                temp.write(chunk)

        metadata = register_dataset(temp_path)

        # Conserver le nom original envoyé par l'utilisateur
        metadata["original_filename"] = filename
        metadata_path = METADATA_DIR / f"{metadata['id']}.json"
        metadata_path.write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )

        return metadata

    except DatasetValidationError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (ValueError, KeyError, UnicodeError) as exc:
        raise HTTPException(
            422, f"Impossible de lire ce dataset : {exc}"
        ) from exc
    finally:
        await file.close()
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.post(
    "/{dataset_id}/activate",
    dependencies=[Depends(require_dataset_write_access)],
)
def activate_dataset(dataset_id: str):
    # L'identifiant est un uuid4 hexadécimal : tout autre format (ex : "..\\..\\x")
    # est refusé pour empêcher la traversée de répertoires.
    if not DATASET_ID_RE.fullmatch(dataset_id):
        raise HTTPException(404, "Dataset introuvable.")

    metadata_path = METADATA_DIR / f"{dataset_id}.json"

    if not metadata_path.is_file():
        raise HTTPException(404, "Dataset introuvable.")

    metadata = json.loads(
        metadata_path.read_text(encoding="utf-8")
    )

    dataset_path = VERSIONS_DIR / metadata["stored_filename"]

    if not dataset_path.is_file():
        raise HTTPException(
            404, "Fichier associé au dataset introuvable."
        )

    METADATA_DIR.mkdir(parents=True, exist_ok=True)

    temp_active = METADATA_DIR / "active.tmp"
    temp_active.write_text(
        json.dumps({"dataset_id": dataset_id}),
        encoding="utf-8"
    )
    os.replace(temp_active, ACTIVE_FILE)

    return {
        "message": "Dataset activé avec succès.",
        "active_dataset_id": dataset_id
    }
