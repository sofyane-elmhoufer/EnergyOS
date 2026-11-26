
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4
import json
import shutil

import pandas as pd


BASE_DIR = Path(__file__).resolve().parents[2]
VERSIONS_DIR = BASE_DIR / "data" / "versions"
METADATA_DIR = BASE_DIR / "data" / "metadata"

REQUIRED_COLUMNS = {
    "Date_Heure",
    "Batiment",
    "Etage",
    "Salle",
    "Nombre_Lampes",
    "Configuration",
    "Energie_kWh",
}

SCENARIOS = {
    "Sans Shelly (Manuel)",
    "Avec Shelly (Auto)",
}


class DatasetValidationError(Exception):
    pass


def validate_dataset(file_path: Path) -> dict:
    """Valide un dataset sans modifier son fichier source."""

    file_path = Path(file_path)

    if file_path.suffix.lower() == ".xlsx":
        df = pd.read_excel(file_path, sheet_name=0)
    elif file_path.suffix.lower() == ".csv":
        df = pd.read_csv(file_path)
    else:
        raise DatasetValidationError(
            "Format non supporté. Utiliser XLSX ou CSV."
        )

    missing = REQUIRED_COLUMNS - set(df.columns)

    if missing:
        raise DatasetValidationError(
            f"Colonnes manquantes : {sorted(missing)}"
        )

    if df.empty:
        raise DatasetValidationError("Le dataset est vide.")

    try:
        dates = pd.to_datetime(
            df["Date_Heure"], errors="raise"
        )
        energy = pd.to_numeric(
            df["Energie_kWh"], errors="raise"
        )
        lamps = pd.to_numeric(
            df["Nombre_Lampes"], errors="raise"
        )
    except (ValueError, TypeError) as exc:
        raise DatasetValidationError(
            f"Types de données invalides : {exc}"
        ) from exc

    if dates.isna().any() or energy.isna().any():
        raise DatasetValidationError(
            "Dates ou consommations manquantes."
        )

    if energy.lt(0).any():
        raise DatasetValidationError(
            "Des consommations négatives ont été détectées."
        )

    if lamps.isna().any() or lamps.lt(0).any():
        raise DatasetValidationError(
            "Nombre de lampes invalide."
        )

    if df[list(REQUIRED_COLUMNS)].isna().any().any():
        raise DatasetValidationError(
            "Valeurs manquantes dans les colonnes obligatoires."
        )

    scenarios = set(df["Configuration"].unique())

    if not SCENARIOS.issubset(scenarios):
        raise DatasetValidationError(
            "Les deux scénarios Shelly doivent être présents."
        )

    return {
        "records": int(len(df)),
        "days": int(dates.dt.date.nunique()),
        "rooms": int(
            df[["Batiment", "Etage", "Salle"]]
            .drop_duplicates()
            .shape[0]
        ),
        "scenarios": sorted(scenarios),
        "start_date": dates.min().isoformat(),
        "end_date": dates.max().isoformat(),
    }


def register_dataset(source_path: Path) -> dict:
    """Valide et archive une nouvelle version du dataset."""

    source_path = Path(source_path)
    report = validate_dataset(source_path)

    dataset_id = uuid4().hex
    destination = (
        VERSIONS_DIR
        / f"{dataset_id}{source_path.suffix.lower()}"
    )

    VERSIONS_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_DIR.mkdir(parents=True, exist_ok=True)

    shutil.copy2(source_path, destination)

    metadata = {
        "id": dataset_id,
        "original_filename": source_path.name,
        "stored_filename": destination.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data_type": "simulated",
        "validation": report,
    }

    metadata_path = METADATA_DIR / f"{dataset_id}.json"
    metadata_path.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return metadata
