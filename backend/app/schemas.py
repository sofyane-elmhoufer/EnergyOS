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


class SendDevisRequest(BaseModel):
    """Envoi du devis par e-mail : le résumé de l'e-mail est recalculé côté serveur à partir de `simulation`."""

    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=5, max_length=120, pattern=r"^[^@\s<>,;\"]+@[^@\s<>,;\"]+\.[^@\s<>,;\"]{2,}$")
    name: str = Field("", max_length=80)
    reference: str = Field(pattern=r"^DEV-\d{8}-[0-9A-F]{6}$")
    # Un devis pèse ~10 Ko ; 400 000 caractères base64 ≈ 300 Ko.
    pdf_base64: str = Field(min_length=8, max_length=400_000)
    simulation: SimulationRequest
