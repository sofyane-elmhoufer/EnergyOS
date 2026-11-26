"""
Alertes de gaspillage et prévisions, calculées à partir du dataset actif.

Alertes
-------
Le dataset ne contient pas de capteur de présence. L'occupation est déduite du
scénario « Avec Shelly (Auto) » : Shelly allume les lampes uniquement pendant
les séances programmées (en semaine 8h30-12h30 et 14h30-18h30 dans le dataset
ENSA). Un pas de temps (30 min) est donc un GASPILLAGE quand la salle est
allumée en mode manuel (Statut ON) alors que Shelly l'aurait éteinte (Statut OFF).
Énergie gaspillée = consommation manuelle - consommation Shelly sur ce pas.

Chaque pas est classé dans un créneau selon SON heure (et non l'heure de début
de l'événement) : pause de midi, soir et nuit, week-end, pendant les séances.
Les pas consécutifs d'une même salle forment une alerte (ex : lumière restée
allumée de 18h30 à 8h30 le lendemain).

Prévisions
----------
Profil moyen par jour de la semaine (lundi, mardi...), appliqué aux jours à
venir, avec une bande min / max observée et une précision mesurée sur les
7 derniers jours (backtest). Ce n'est pas un modèle de machine learning :
avec 3 semaines de données, un modèle plus complexe sur-apprendrait.
"""

from datetime import timedelta

import numpy as np
import pandas as pd

from app.services.energy_service import AUTO, MANUAL
from app.services.simulation_service import CITIES

PRICE_PER_KWH = CITIES["fes"]["professional"]  # tarif indicatif de l'ENSA Fès
JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

SLOTS = {
    "lunch": "Pause de midi (12h30-14h30)",
    "evening": "Soir et nuit (18h30-8h30)",
    "weekend": "Week-end",
    "daytime": "Pendant les séances",
}


def _r(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def _slot_ids(ts: pd.Series) -> np.ndarray:
    """Créneau de chaque pas de temps (vectorisé)."""
    minutes = (ts.dt.hour * 60 + ts.dt.minute).to_numpy()
    weekday = ts.dt.dayofweek.to_numpy()
    return np.select(
        [
            weekday >= 5,
            (minutes >= 12 * 60 + 30) & (minutes < 14 * 60 + 30),
            (minutes >= 18 * 60 + 30) | (minutes < 8 * 60 + 30),
        ],
        ["weekend", "lunch", "evening"],
        default="daytime",
    )


def _severity(duration_min: float) -> str:
    if duration_min >= 180:
        return "haute"
    if duration_min >= 90:
        return "moyenne"
    return "faible"


def waste_steps(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Timedelta, float]:
    """Une ligne par salle et par pas de temps, avec l'énergie gaspillée et le créneau."""
    keys = ["Batiment", "Etage", "Salle", "Date_Heure"]
    energy = df.pivot_table(index=keys, columns="Configuration", values="Energie_kWh", aggfunc="sum")
    for scenario in (MANUAL, AUTO):
        if scenario not in energy.columns:
            energy[scenario] = 0.0
    steps = energy[[MANUAL, AUTO]].reset_index()

    if "Statut" in df.columns:
        status = df.pivot_table(index=keys, columns="Configuration", values="Statut", aggfunc="first")
        status = status.reindex(columns=[MANUAL, AUTO]).reset_index(drop=True)
        wasting = (status[MANUAL].astype(str).str.upper() == "ON") & (status[AUTO].astype(str).str.upper() != "ON")
    else:
        # Sans colonne Statut : écart significatif (> 5 %) entre les deux scénarios.
        wasting = (steps[MANUAL] - steps[AUTO]) > 0.05 * steps[MANUAL].clip(lower=1e-9)
    steps["wasting"] = wasting.to_numpy()
    steps["waste_kwh"] = np.where(steps["wasting"], (steps[MANUAL] - steps[AUTO]).clip(lower=0), 0.0)
    steps["slot"] = _slot_ids(steps["Date_Heure"])
    steps = steps.sort_values(["Salle", "Date_Heure"]).reset_index(drop=True)

    diffs = steps["Date_Heure"].diff()
    positive = diffs[diffs > pd.Timedelta(0)]
    step = positive.min() if not positive.empty else pd.Timedelta(minutes=30)
    manual_total = float(steps[MANUAL].sum())
    return steps, step, manual_total


def waste_alerts(df: pd.DataFrame, min_duration_minutes: int = 60, limit: int = 50, slot: str | None = None,
                 price_per_kwh: float | None = None) -> dict:
    price = price_per_kwh or PRICE_PER_KWH
    steps, step, manual_total = waste_steps(df)
    step_min = step.total_seconds() / 60

    period_start = df["Date_Heure"].min()
    period_end = df["Date_Heure"].max()
    period_days = int(df["Date_Heure"].dt.date.nunique())

    waste = steps[steps["wasting"]]
    if slot:
        waste = waste[waste["slot"] == slot]
    waste = waste.copy()

    # Alertes = pas de gaspillage consécutifs d'une même salle.
    new_event = (
        waste["Salle"].ne(waste["Salle"].shift())
        | waste["Date_Heure"].diff().ne(step)
    )
    waste["event_id"] = new_event.cumsum()

    events = (
        waste.groupby("event_id")
        .agg(
            building=("Batiment", "first"), floor=("Etage", "first"), room=("Salle", "first"),
            start=("Date_Heure", "min"), last=("Date_Heure", "max"),
            steps=("waste_kwh", "size"), waste_kwh=("waste_kwh", "sum"),
        )
    )
    if not events.empty:
        # Créneau dominant de l'alerte (celui où elle gaspille le plus).
        dominant = waste.groupby(["event_id", "slot"])["waste_kwh"].sum().reset_index()
        dominant = dominant.sort_values("waste_kwh").drop_duplicates("event_id", keep="last").set_index("event_id")["slot"]
        events["slot"] = dominant
    else:
        events["slot"] = pd.Series(dtype=str)
    events = events.reset_index(drop=True)
    events["duration_minutes"] = events["steps"] * step_min
    events = events[events["duration_minutes"] >= min_duration_minutes].copy()
    events["end"] = events["last"] + step
    events["severity"] = events["duration_minutes"].map(_severity)
    events["cost"] = events["waste_kwh"] * price

    total_waste = float(waste["waste_kwh"].sum())
    wasted_hours = len(waste) * step_min / 60

    by_slot = (
        steps[steps["wasting"]].groupby("slot")
        .agg(waste_kwh=("waste_kwh", "sum"), steps=("waste_kwh", "size"))
        .reindex(list(SLOTS)).fillna(0)
    )
    all_waste = float(by_slot["waste_kwh"].sum())

    by_room = (
        waste.groupby(["Salle", "Batiment", "Etage"])
        .agg(waste_kwh=("waste_kwh", "sum"), steps=("waste_kwh", "size"))
        .reset_index().sort_values("waste_kwh", ascending=False).head(10)
    )
    alerts_per_room = events.groupby("room").size()

    # Carte de chaleur : kWh cumulés + nombre moyen de salles allumées inutilement.
    heat_src = waste.assign(day=waste["Date_Heure"].dt.dayofweek, hour=waste["Date_Heure"].dt.hour,
                            date=waste["Date_Heure"].dt.date)
    days_per_weekday = pd.Series(pd.to_datetime(sorted(df["Date_Heure"].dt.date.unique())).dayofweek).value_counts()
    steps_per_hour = max(1, round(60 / step_min))
    heat = heat_src.groupby(["day", "hour"]).agg(waste_kwh=("waste_kwh", "sum"), room_steps=("waste_kwh", "size"))

    top = events.sort_values("waste_kwh", ascending=False).head(limit)
    return {
        "data_type": "simulated",
        "price_per_kwh": price,
        "min_duration_minutes": min_duration_minutes,
        "slot": slot,
        "slots": [{"id": key, "label": label} for key, label in SLOTS.items()],
        "period": {
            "start": period_start.date().isoformat(),
            "end": period_end.date().isoformat(),
            "days": period_days,
        },
        "summary": {
            "events": int(len(events)),
            "high_events": int((events["severity"] == "haute").sum()),
            "rooms_affected": int(waste["Salle"].nunique()),
            "wasted_hours": _r(wasted_hours, 1),
            "waste_kwh": _r(total_waste),
            "waste_cost": _r(total_waste * price),
            "waste_share_percent": _r(total_waste / manual_total * 100, 1) if manual_total > 0 else None,
        },
        "by_slot": [
            {
                "slot": key, "label": SLOTS[key], "waste_kwh": _r(row.waste_kwh),
                "hours": _r(row.steps * step_min / 60, 1), "cost": _r(row.waste_kwh * price),
                "share_percent": _r(row.waste_kwh / all_waste * 100, 1) if all_waste > 0 else 0.0,
            }
            for key, row in by_slot.iterrows()
        ],
        "by_room": [
            {
                "room": row.Salle, "building": row.Batiment, "floor": row.Etage,
                "events": int(alerts_per_room.get(row.Salle, 0)),
                "waste_kwh": _r(row.waste_kwh), "cost": _r(row.waste_kwh * price),
                "hours": _r(row.steps * step_min / 60, 1),
            }
            for row in by_room.itertuples()
        ],
        "heatmap": [
            {
                "day": JOURS_FR[day], "day_index": int(day), "hour": int(hour),
                "waste_kwh": _r(row.waste_kwh, 3),
                "avg_rooms": _r(row.room_steps / steps_per_hour / max(1, int(days_per_weekday.get(day, 1))), 1),
            }
            for (day, hour), row in heat.iterrows()
        ],
        "events": [
            {
                "room": row.room, "building": row.building, "floor": row.floor,
                "start": row.start.isoformat(), "end": row.end.isoformat(),
                "duration_minutes": int(row.duration_minutes), "waste_kwh": _r(row.waste_kwh, 3),
                "cost": _r(row.cost), "slot": row.slot, "slot_label": SLOTS[row.slot], "severity": row.severity,
            }
            for row in top.itertuples()
        ],
    }


def _daily_totals(df: pd.DataFrame) -> pd.DataFrame:
    daily = (
        df.assign(Date=df["Date_Heure"].dt.normalize())
        .groupby(["Date", "Configuration"])["Energie_kWh"].sum()
        .unstack(fill_value=0)
    )
    for scenario in (MANUAL, AUTO):
        if scenario not in daily.columns:
            daily[scenario] = 0.0
    full_range = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    return daily[[MANUAL, AUTO]].reindex(full_range, fill_value=0.0)


def _weekday_profile(daily: pd.DataFrame) -> pd.DataFrame:
    grouped = daily.groupby(daily.index.dayofweek)
    return pd.concat(
        {"mean": grouped.mean(), "min": grouped.min(), "max": grouped.max()}, axis=1
    )


def _predict(profile: pd.DataFrame, dates: pd.DatetimeIndex, scenario: str, stat: str = "mean") -> list[float]:
    fallback = float(profile[(stat, scenario)].mean())
    return [
        float(profile[(stat, scenario)].get(d.dayofweek, fallback)) for d in dates
    ]


def _wape(actual: pd.Series, predicted: list[float]) -> float | None:
    total = float(actual.abs().sum())
    if total <= 0:
        return None
    return float(sum(abs(a - p) for a, p in zip(actual, predicted)) / total * 100)


def forecast(df: pd.DataFrame, horizon_days: int = 30, weeks_per_year: int = 40,
             price_per_kwh: float | None = None) -> dict:
    price = price_per_kwh or PRICE_PER_KWH
    daily = _daily_totals(df)
    if len(daily) < 7:
        raise ValueError("Au moins 7 jours de données sont nécessaires pour une prévision.")

    profile = _weekday_profile(daily)

    # Backtest : modèle construit sans les 7 derniers jours, testé sur ceux-ci.
    backtest = None
    if len(daily) >= 14:
        train, test = daily.iloc[:-7], daily.iloc[-7:]
        train_profile = _weekday_profile(train)
        backtest = {
            "test_days": 7,
            "wape_without_percent": _wape(test[MANUAL], _predict(train_profile, test.index, MANUAL)),
            "wape_with_percent": _wape(test[AUTO], _predict(train_profile, test.index, AUTO)),
        }
        backtest = {k: (_r(v, 1) if isinstance(v, float) else v) for k, v in backtest.items()}

    last = daily.index.max()
    future = pd.date_range(last + timedelta(days=1), periods=horizon_days, freq="D")
    pred = {
        (stat, scenario): _predict(profile, future, scenario, stat)
        for stat in ("mean", "min", "max") for scenario in (MANUAL, AUTO)
    }

    # Projection de fin de mois : réel du mois en cours + prévision des jours restants.
    month_end = (last + pd.offsets.MonthEnd(0)).normalize()
    rest = pd.date_range(last + timedelta(days=1), month_end, freq="D")
    in_month = daily[(daily.index.month == last.month) & (daily.index.year == last.year)]
    month_without = float(in_month[MANUAL].sum()) + sum(_predict(profile, rest, MANUAL))
    month_with = float(in_month[AUTO].sum()) + sum(_predict(profile, rest, AUTO))

    week_without = float(profile[("mean", MANUAL)].sum())
    week_with = float(profile[("mean", AUTO)].sum())
    year_without, year_with = week_without * weeks_per_year, week_with * weeks_per_year

    horizon_without = sum(pred[("mean", MANUAL)])
    horizon_with = sum(pred[("mean", AUTO)])

    return {
        "data_type": "simulated",
        "method": "Profil moyen par jour de la semaine (bande = min / max observés)",
        "price_per_kwh": price,
        "horizon_days": horizon_days,
        "weeks_per_year": weeks_per_year,
        "history": [
            {"date": d.date().isoformat(), "without_shelly_kwh": _r(row[MANUAL]), "with_shelly_kwh": _r(row[AUTO])}
            for d, row in daily.iterrows()
        ],
        "forecast": [
            {
                "date": d.date().isoformat(),
                "without_shelly_kwh": _r(pred[("mean", MANUAL)][i]),
                "with_shelly_kwh": _r(pred[("mean", AUTO)][i]),
                "without_range": [_r(pred[("min", MANUAL)][i]), _r(pred[("max", MANUAL)][i])],
                "with_range": [_r(pred[("min", AUTO)][i]), _r(pred[("max", AUTO)][i])],
            }
            for i, d in enumerate(future)
        ],
        "backtest": backtest,
        "summary": {
            "month_label": last.strftime("%m/%Y"),
            "month_without_kwh": _r(month_without),
            "month_with_kwh": _r(month_with),
            "month_saved_kwh": _r(month_without - month_with),
            "month_saved_cost": _r((month_without - month_with) * price),
            "horizon_without_kwh": _r(horizon_without),
            "horizon_with_kwh": _r(horizon_with),
            "horizon_saved_kwh": _r(horizon_without - horizon_with),
            "horizon_saved_cost": _r((horizon_without - horizon_with) * price),
            "year_without_kwh": _r(year_without),
            "year_with_kwh": _r(year_with),
            "year_saved_kwh": _r(year_without - year_with),
            "year_saved_cost": _r((year_without - year_with) * price),
        },
    }
