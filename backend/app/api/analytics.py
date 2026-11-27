
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_roles
from app.roles import ADMIN, TECHNICIEN

from app.services import insights_service
from app.services.energy_service import (
    load_active_dataset,
    calculate_kpis,
    get_daily_consumption,
    get_available_filters,
    filter_energy_data,
)

router = APIRouter(
    prefix="/api/analytics",
    tags=["Energy Analytics"],
)


def get_filtered_dataset(
    building: str | None,
    floor: str | None,
    room: str | None,
    start_date: date | None,
    end_date: date | None,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="La date de début doit précéder la date de fin.",
        )

    df = load_active_dataset()

    # Période demandée entièrement hors des mesures disponibles : message explicite.
    data_start = df["Date_Heure"].min().date()
    data_end = df["Date_Heure"].max().date()
    if (start_date and start_date > data_end) or (end_date and end_date < data_start):
        raise HTTPException(
            status_code=404,
            detail=(
                f"Aucune mesure pour cette période. Les données disponibles couvrent du "
                f"{data_start:%d/%m/%Y} au {data_end:%d/%m/%Y}. Les autres périodes ne sont pas "
                "encore couvertes : il faudra des modules Shelly connectés pour mesurer la consommation réelle."
            ),
        )

    filtered = filter_energy_data(
        df,
        building=building,
        floor=floor,
        room=room,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
    )

    if filtered.empty:
        raise HTTPException(
            status_code=404,
            detail="Aucune donnée pour les filtres sélectionnés.",
        )

    return filtered


@router.get("/filters", dependencies=[Depends(require_roles(TECHNICIEN, ADMIN))])
def available_filters():
    df = load_active_dataset()
    return get_available_filters(df)


@router.get("/kpis")
def analytics_kpis(
    building: str | None = None,
    floor: str | None = None,
    room: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
):
    df = get_filtered_dataset(
        building, floor, room, start_date, end_date
    )
    return calculate_kpis(df)


@router.get("/daily")
def daily_consumption(
    building: str | None = None,
    floor: str | None = None,
    room: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
):
    df = get_filtered_dataset(
        building, floor, room, start_date, end_date
    )

    return {
        "data_type": "simulated",
        "daily": get_daily_consumption(df),
    }


@router.get("/alerts", dependencies=[Depends(require_roles(TECHNICIEN, ADMIN))])
def alerts(
    building: str | None = Query(None, max_length=100),
    floor: str | None = Query(None, max_length=100),
    room: str | None = Query(None, max_length=100),
    start_date: date | None = None,
    end_date: date | None = None,
    min_duration_minutes: int = Query(60, ge=30, le=10080),
    limit: int = Query(50, ge=1, le=500),
    slot: Literal["lunch", "evening", "weekend", "daytime"] | None = None,
    price_per_kwh: float | None = Query(None, ge=0.1, le=10, description="Tarif (MAD/kWh) choisi dans Settings"),
):
    df = get_filtered_dataset(building, floor, room, start_date, end_date)
    return insights_service.waste_alerts(
        df, min_duration_minutes=min_duration_minutes, limit=limit, slot=slot, price_per_kwh=price_per_kwh,
    )


@router.get("/forecast", dependencies=[Depends(require_roles(TECHNICIEN, ADMIN))])
def forecast(
    building: str | None = Query(None, max_length=100),
    floor: str | None = Query(None, max_length=100),
    room: str | None = Query(None, max_length=100),
    horizon_days: int = Query(30, ge=7, le=120),
    weeks_per_year: int = Query(40, ge=1, le=52),
    price_per_kwh: float | None = Query(None, ge=0.1, le=10, description="Tarif (MAD/kWh) choisi dans Settings"),
):
    df = get_filtered_dataset(building, floor, room, None, None)
    try:
        return insights_service.forecast(
            df, horizon_days=horizon_days, weeks_per_year=weeks_per_year, price_per_kwh=price_per_kwh,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
