from pathlib import Path
import json
import threading
from functools import lru_cache

import pandas as pd
from fastapi import HTTPException

from app.services.dataset_manager import validate_dataset

BASE_DIR = Path(__file__).resolve().parents[2]

ORIGINAL_FILE = (
    BASE_DIR / "data" / "originals"
    / "ENSA_Fes_Comparaison_Eclairage_Complet.xlsx"
)

METADATA_DIR = BASE_DIR / "data" / "metadata"
VERSIONS_DIR = BASE_DIR / "data" / "versions"
ACTIVE_FILE = METADATA_DIR / "active.json"

MANUAL = "Sans Shelly (Manuel)"
AUTO = "Avec Shelly (Auto)"


def get_active_dataset_path():
    """Retourne le dataset actif ou le fichier initial."""

    if not ACTIVE_FILE.exists():
        if not ORIGINAL_FILE.is_file():
            raise HTTPException(
                404, "Dataset original introuvable."
            )
        return ORIGINAL_FILE

    try:
        active = json.loads(
            ACTIVE_FILE.read_text(encoding="utf-8")
        )
        dataset_id = active["dataset_id"]

        metadata_path = METADATA_DIR / f"{dataset_id}.json"
        metadata = json.loads(
            metadata_path.read_text(encoding="utf-8")
        )

        stored_filename = metadata["stored_filename"]
        path = VERSIONS_DIR / stored_filename

        if not path.is_file():
            raise FileNotFoundError("Version active introuvable.")

        return path

    except (KeyError, ValueError, OSError) as exc:
        raise HTTPException(
            500, f"Configuration du dataset actif invalide : {exc}"
        ) from exc


# Verrou : si plusieurs requêtes arrivent en même temps sur un cache vide (ex : les 3 appels de la page),
# une seule lit le fichier ; les autres attendent puis reçoivent le résultat déjà en cache.
_LOAD_LOCK = threading.Lock()


@lru_cache(maxsize=3)
def _read_dataset_cached(
    file_path: str,
    file_mtime_ns: int,
    file_size: int,
) -> pd.DataFrame:
    """
    Lit et valide un dataset une seule fois
    pour une version donnée du fichier.
    """
    path = Path(file_path)

    validate_dataset(path)

    if path.suffix.lower() == ".xlsx":
        df = pd.read_excel(path, sheet_name=0)
    else:
        df = pd.read_csv(path)

    df["Date_Heure"] = pd.to_datetime(
        df["Date_Heure"], errors="raise"
    )
    df["Energie_kWh"] = pd.to_numeric(
        df["Energie_kWh"], errors="raise"
    )
    df["Nombre_Lampes"] = pd.to_numeric(
        df["Nombre_Lampes"], errors="raise"
    )

    return df


def load_active_dataset():
    """Charge le dataset actif avec mise en cache."""

    path = get_active_dataset_path()

    try:
        stat = path.stat()

        with _LOAD_LOCK:
            df = _read_dataset_cached(
                str(path.resolve()),
                stat.st_mtime_ns,
                stat.st_size,
            )

        return df.copy()

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            422,
            f"Impossible de charger le dataset actif : {exc}"
        ) from exc



def calculate_kpis(df: pd.DataFrame):
    """Calcule les KPI à partir des données fournies."""

    consumption = (
        df.groupby("Configuration")["Energie_kWh"].sum()
    )

    if MANUAL not in consumption or AUTO not in consumption:
        raise HTTPException(
            422, "Les deux scénarios doivent être présents."
        )

    without_shelly = float(consumption[MANUAL])
    with_shelly = float(consumption[AUTO])
    savings = without_shelly - with_shelly

    rooms = df.drop_duplicates(
        subset=["Batiment", "Etage", "Salle"]
    )

    lamps = int(rooms["Nombre_Lampes"].sum())

    return {
        "without_shelly_kwh": round(without_shelly, 2),
        "with_shelly_kwh": round(with_shelly, 2),
        "saved_kwh": round(savings, 2),
        "savings_percent": (
            round(savings / without_shelly * 100, 2)
            if without_shelly > 0 else None
        ),
        "total_rooms": int(len(rooms)),
        "total_lamps": lamps,
        "total_days": int(
            df["Date_Heure"].dt.date.nunique()
        ),
        "data_type": "simulated"
    }


def get_daily_consumption(df: pd.DataFrame):
    """Prépare les données pour le graphique quotidien."""

    daily = df.copy()
    daily["Date"] = daily["Date_Heure"].dt.date

    grouped = (
        daily.groupby(["Date", "Configuration"])["Energie_kWh"]
        .sum()
        .unstack(fill_value=0)
    )

    for scenario in [MANUAL, AUTO]:
        if scenario not in grouped.columns:
            grouped[scenario] = 0

    grouped = grouped.reset_index()

    return [
        {
            "date": str(row["Date"]),
            "without_shelly_kwh": round(
                float(row[MANUAL]), 2
            ),
            "with_shelly_kwh": round(
                float(row[AUTO]), 2
            ),
        }
        for _, row in grouped.iterrows()
    ]


def get_available_filters(df: pd.DataFrame) -> dict:
    """Retourne les valeurs disponibles dans le dataset actif."""

    dates = df["Date_Heure"].dt.date

    return {
        "buildings": sorted(
            df["Batiment"].dropna().astype(str).unique().tolist()
        ),
        "floors": sorted(
            df["Etage"].dropna().astype(str).unique().tolist()
        ),
        "rooms": sorted(
            df["Salle"].dropna().astype(str).unique().tolist()
        ),
        "min_date": dates.min().isoformat(),
        "max_date": dates.max().isoformat(),
        "data_type": "simulated",
    }


def filter_energy_data(
    df: pd.DataFrame,
    building: str | None = None,
    floor: str | None = None,
    room: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.DataFrame:
    """Applique les filtres aux deux scénarios simultanément."""

    mask = pd.Series(True, index=df.index)

    if building:
        mask &= df["Batiment"].astype(str).eq(building)

    if floor:
        mask &= df["Etage"].astype(str).eq(floor)

    if room:
        mask &= df["Salle"].astype(str).eq(room)

    dates = df["Date_Heure"].dt.date

    if start_date:
        mask &= dates >= pd.Timestamp(start_date).date()

    if end_date:
        mask &= dates <= pd.Timestamp(end_date).date()

    return df.loc[mask].copy()