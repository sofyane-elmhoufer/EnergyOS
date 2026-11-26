"""Schémas d'entrée partagés (validation stricte et bornée de tout ce que le client envoie)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ID_PATTERN = r"^[a-z_]{1,32}$"


class ApplianceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(pattern=ID_PATTERN)
    quantity: int = Field(gt=0, le=1_000_000)
    power_w: float | None = Field(None, gt=0, le=50_000)
    hours_per_day: float | None = Field(None, gt=0, le=24)


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    monthly_bill: float = Field(gt=0, le=100_000_000, description="Facture mensuelle TTC (MAD)")
    building_type: str = Field(pattern=ID_PATTERN)
    city: str = Field(pattern=ID_PATTERN)
    appliances: list[ApplianceInput] = Field(min_length=1, max_length=30)
    tariff_mode: Literal["flat", "tiered"] = "flat"
    price_per_kwh: float | None = Field(None, gt=0, le=100)
    days_per_month: float | None = Field(None, gt=0, le=31)
    module_price: float | None = Field(None, ge=0, le=100_000)
    installation_price: float | None = Field(None, ge=0, le=100_000)
