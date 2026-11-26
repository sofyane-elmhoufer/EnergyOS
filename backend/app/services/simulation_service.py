"""
Simulateur de l'Espace Client.

Estime, pour un bâtiment client, la consommation de ses appareils, l'économie
attendue avec des modules Shelly et le retour sur investissement.

- Éclairage : le taux d'économie n'est PAS codé en dur, il est recalculé à partir
  du dataset actif (comparaison Sans / Avec Shelly de l'ENSA Fès), puis pondéré
  selon le type de bâtiment.
- Autres appareils : taux d'économie INDICATIFS (programmation horaire, coupure
  hors occupation, suppression de la veille), regroupés ici pour être ajustés.
- Tarif : prix moyen (professionnel / au choix) ou grille résidentielle par
  tranches. Avec des tranches, chaque kWh économisé l'est sur la tranche la plus
  chère : l'économie en MAD est calculée comme facture(avant) - facture(après).

Toutes les valeurs sont des HYPOTHÈSES INDICATIVES renvoyées au frontend et
imprimées sur le devis.
"""

import math

from fastapi import HTTPException

from app.schemas import ApplianceInput, SimulationRequest
from app.services.energy_service import calculate_kpis, load_active_dataset

CO2_KG_PER_KWH = 0.7             # facteur d'émission indicatif du réseau marocain
CURRENCY = "MAD"
DEFAULT_MODULE_PRICE = 350.0     # prix indicatif d'un module Shelly (1PM / Plug) au Maroc
DEFAULT_INSTALLATION_PRICE = 150.0  # pose et paramétrage, par module (indicatif)
ROI_YEARS = 5

# --- Types de bâtiment ----------------------------------------------------
# savings_factor : part du taux d'éclairage mesuré à l'ENSA jugée transposable.
BUILDING_TYPES = {
    "school": {"label": "École / Université", "hours_per_day": 9, "days_per_month": 22,
               "savings_factor": 1.0, "tariff": "professional"},
    "office": {"label": "Entreprise / Bureaux", "hours_per_day": 10, "days_per_month": 22,
               "savings_factor": 0.9, "tariff": "professional"},
    "administration": {"label": "Administration publique", "hours_per_day": 9, "days_per_month": 22,
                       "savings_factor": 0.9, "tariff": "professional"},
    "hotel": {"label": "Hôtel / Résidence", "hours_per_day": 14, "days_per_month": 30,
              "savings_factor": 0.8, "tariff": "professional"},
    "factory": {"label": "Usine / Entrepôt", "hours_per_day": 14, "days_per_month": 26,
                "savings_factor": 0.7, "tariff": "professional"},
    "hospital": {"label": "Hôpital / Clinique", "hours_per_day": 18, "days_per_month": 30,
                 "savings_factor": 0.6, "tariff": "professional"},
    "shop": {"label": "Commerce / Magasin", "hours_per_day": 12, "days_per_month": 26,
             "savings_factor": 0.5, "tariff": "professional"},
    "house": {"label": "Maison / Appartement", "hours_per_day": 5, "days_per_month": 30,
              "savings_factor": 0.5, "tariff": "residential"},
}

# --- Types d'appareils ----------------------------------------------------
# power_w : puissance d'UN appareil (pour la veille : puissance en veille).
# hours_per_day : None = heures d'éclairage du type de bâtiment.
# savings_rate : None = taux mesuré à l'ENSA (éclairage). Sinon hypothèse indicative.
# units_per_module : nombre d'appareils pilotés par un module Shelly.
APPLIANCE_TYPES = {
    "lighting": {
        "label": "Éclairage (lampes LED)", "unit": "lampe", "power_w": 18, "hours_per_day": None,
        "savings_rate": None, "units_per_module": 8,
        "module": "Shelly Plus 1PM / Pro 4PM (circuit d'éclairage)",
        "action": "Extinction automatique selon les horaires d'occupation (pause de midi, soir, week-end).",
    },
    "air_conditioner": {
        "label": "Climatiseur", "unit": "climatiseur", "power_w": 1200, "hours_per_day": 6,
        "savings_rate": 0.20, "units_per_module": 1, "module": "Shelly Plus 1PM",
        "action": "Arrêt automatique hors occupation et programmation des plages horaires.",
    },
    "water_heater": {
        "label": "Chauffe-eau électrique", "unit": "chauffe-eau", "power_w": 1500, "hours_per_day": 3,
        "savings_rate": 0.25, "units_per_module": 1, "module": "Shelly Pro 1PM (fort courant)",
        "action": "Chauffe programmée uniquement avant les heures d'utilisation.",
    },
    "electric_heater": {
        "label": "Radiateur électrique", "unit": "radiateur", "power_w": 1500, "hours_per_day": 4,
        "savings_rate": 0.20, "units_per_module": 1, "module": "Shelly Plus 1PM",
        "action": "Programmation horaire et coupure en cas d'absence.",
    },
    "standby": {
        "label": "Appareils en veille (TV, box, PC, imprimante...)", "unit": "appareil", "power_w": 8,
        "hours_per_day": 16, "savings_rate": 0.90, "units_per_module": 1, "module": "Shelly Plug S",
        "action": "Coupure complète de la veille la nuit et le week-end via prise connectée.",
    },
    "ventilation": {
        "label": "Ventilation / pompe", "unit": "équipement", "power_w": 750, "hours_per_day": 8,
        "savings_rate": 0.15, "units_per_module": 1, "module": "Shelly Plus 1PM",
        "action": "Fonctionnement limité aux plages horaires utiles.",
    },
    "other": {
        "label": "Autre appareil", "unit": "appareil", "power_w": 500, "hours_per_day": 4,
        "savings_rate": 0.10, "units_per_module": 1, "module": "Shelly Plus 1PM / Plug S",
        "action": "Programmation horaire.",
    },
}

# --- Localisation ---------------------------------------------------------
# Prix moyens INDICATIFS du kWh TTC (MAD), basse tension, par distributeur.
CITIES = {
    "fes": {"label": "Fès", "distributor": "SRM Fès-Meknès", "residential": 1.20, "professional": 1.45},
    "meknes": {"label": "Meknès", "distributor": "SRM Fès-Meknès", "residential": 1.20, "professional": 1.45},
    "casablanca": {"label": "Casablanca", "distributor": "SRM Casablanca-Settat", "residential": 1.30, "professional": 1.55},
    "rabat": {"label": "Rabat / Salé", "distributor": "SRM Rabat-Salé-Kénitra", "residential": 1.28, "professional": 1.52},
    "kenitra": {"label": "Kénitra", "distributor": "SRM Rabat-Salé-Kénitra", "residential": 1.25, "professional": 1.50},
    "tanger": {"label": "Tanger", "distributor": "SRM Tanger-Tétouan-Al Hoceïma", "residential": 1.28, "professional": 1.52},
    "tetouan": {"label": "Tétouan", "distributor": "SRM Tanger-Tétouan-Al Hoceïma", "residential": 1.28, "professional": 1.52},
    "marrakech": {"label": "Marrakech", "distributor": "SRM Marrakech-Safi", "residential": 1.22, "professional": 1.48},
    "agadir": {"label": "Agadir", "distributor": "SRM Souss-Massa", "residential": 1.20, "professional": 1.45},
    "oujda": {"label": "Oujda", "distributor": "SRM de l'Oriental", "residential": 1.20, "professional": 1.45},
    "other": {"label": "Autre ville (Maroc)", "distributor": "ONEE / SRM régionale", "residential": 1.20, "professional": 1.45},
}

# --- Grille résidentielle par tranches -------------------------------------
# Prix HT du kWh publiés par l'ONEE (basse tension, usage domestique) :
# https://www.one.org.ma/FR/pages/interne.asp?esp=1&id1=3&id2=113&t2=1
# Règles officielles :
# - jusqu'à 150 kWh/mois : facturation PROGRESSIVE (100 premiers kWh à 0,9010,
#   les suivants à 1,0732) ;
# - au-delà de 150 kWh/mois : tarification SÉLECTIVE, la TOTALITÉ de la
#   consommation est facturée au prix de la tranche atteinte.
# Simplifications : TVA 18 % appliquée, redevances fixes et tolérance de
# dépassement de 10 kWh ignorées. Les SRM peuvent appliquer des grilles
# différentes : vérifier la grille en vigueur avant un devis définitif.
RESIDENTIAL_TRANCHES = [
    (100, 0.9010),
    (150, 1.0732),
    (200, 1.0732),
    (300, 1.1676),
    (500, 1.3817),
    (math.inf, 1.5958),
]
PROGRESSIVE_LIMIT_KWH = 150
TARIFF_TAX_RATE = 0.18  # TVA indicative appliquée à l'énergie


def tiered_bill(kwh: float) -> float:
    """Montant TTC indicatif de l'énergie pour une consommation mensuelle (hors redevances fixes)."""
    if kwh <= PROGRESSIVE_LIMIT_KWH:
        total, lower = 0.0, 0.0
        for upper, price in RESIDENTIAL_TRANCHES:
            if kwh <= lower:
                break
            total += (min(kwh, upper) - lower) * price
            lower = upper
    else:
        price = next(price for upper, price in RESIDENTIAL_TRANCHES if kwh <= upper)
        total = kwh * price
    return total * (1 + TARIFF_TAX_RATE)


def tranche_label(kwh: float) -> str:
    lower = 0
    for upper, _ in RESIDENTIAL_TRANCHES:
        if kwh <= upper:
            return f"{lower}-{int(upper)} kWh" if not math.isinf(upper) else f"plus de {lower - 1} kWh"
        lower = int(upper) + 1
    return ""


def tiered_kwh_from_bill(bill: float) -> float:
    """Inverse de tiered_bill (fonction croissante) par dichotomie."""
    low, high = 0.0, bill / (RESIDENTIAL_TRANCHES[0][1] * (1 + TARIFF_TAX_RATE)) + 1
    for _ in range(100):
        mid = (low + high) / 2
        if tiered_bill(mid) < bill:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def get_reference_savings_percent() -> float:
    """Taux d'économie mesuré sur le dataset actif (ENSA Fès)."""
    percent = calculate_kpis(load_active_dataset())["savings_percent"]
    if percent is None or percent <= 0:
        raise HTTPException(422, "Le dataset actif ne permet pas de calculer un taux d'économie.")
    return float(percent)


def get_options() -> dict:
    """Listes et valeurs par défaut pour construire le formulaire."""
    return {
        "currency": CURRENCY,
        "reference_savings_percent": get_reference_savings_percent(),
        "default_module_price": DEFAULT_MODULE_PRICE,
        "default_installation_price": DEFAULT_INSTALLATION_PRICE,
        "roi_years": ROI_YEARS,
        "building_types": [{"id": key, **value} for key, value in BUILDING_TYPES.items()],
        "cities": [{"id": key, **value} for key, value in CITIES.items()],
        "appliance_types": [{"id": key, **value} for key, value in APPLIANCE_TYPES.items()],
        "residential_tranches": [
            {"up_to_kwh": None if math.isinf(upper) else upper, "price_ht": price}
            for upper, price in RESIDENTIAL_TRANCHES
        ],
        "tariff_tax_rate": TARIFF_TAX_RATE,
        "progressive_limit_kwh": PROGRESSIVE_LIMIT_KWH,
    }


def r(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def estimate(req: SimulationRequest) -> dict:
    """Calcule la simulation complète (consommations, économies, ROI, détail par appareil)."""
    if req.building_type not in BUILDING_TYPES:
        raise HTTPException(422, "Type de bâtiment inconnu.")
    if req.city not in CITIES:
        raise HTTPException(422, "Ville inconnue.")
    for item in req.appliances:
        if item.type not in APPLIANCE_TYPES:
            raise HTTPException(422, "Type d'appareil inconnu.")

    building = BUILDING_TYPES[req.building_type]
    location = CITIES[req.city]
    warnings: list[str] = []

    days = req.days_per_month if req.days_per_month is not None else building["days_per_month"]
    module_price = req.module_price if req.module_price is not None else DEFAULT_MODULE_PRICE
    install_price = req.installation_price if req.installation_price is not None else DEFAULT_INSTALLATION_PRICE

    # --- Tarif ---
    tiered = req.tariff_mode == "tiered" and req.price_per_kwh is None
    if req.tariff_mode == "tiered" and req.price_per_kwh is not None:
        warnings.append("custom_price_overrides_tiers")
    if tiered and building["tariff"] != "residential":
        warnings.append("tiers_are_residential")
    flat_price = req.price_per_kwh if req.price_per_kwh is not None else location[building["tariff"]]

    bill = req.monthly_bill
    total_kwh = tiered_kwh_from_bill(bill) if tiered else bill / flat_price
    average_price = bill / total_kwh

    # --- Consommation par appareil ---
    reference_percent = get_reference_savings_percent()
    lighting_rate = reference_percent / 100 * building["savings_factor"]

    lines = []
    for item in req.appliances:
        spec = APPLIANCE_TYPES[item.type]
        power = item.power_w if item.power_w is not None else spec["power_w"]
        hours = item.hours_per_day if item.hours_per_day is not None else (
            spec["hours_per_day"] if spec["hours_per_day"] is not None else building["hours_per_day"]
        )
        rate = lighting_rate if spec["savings_rate"] is None else spec["savings_rate"]
        lines.append({
            "item": item, "spec": spec, "power": power, "hours": hours, "rate": rate,
            "kwh": item.quantity * power * hours * days / 1000,
        })

    declared_kwh = sum(line["kwh"] for line in lines)
    scale = 1.0
    if declared_kwh > total_kwh:
        # La facture fait foi : les appareils ne peuvent pas consommer plus que la facture totale.
        scale = total_kwh / declared_kwh
        warnings.append("appliances_capped_to_bill")
    for line in lines:
        line["kwh"] *= scale
        line["saved_kwh"] = line["kwh"] * line["rate"]

    covered_kwh = sum(line["kwh"] for line in lines)
    saved_kwh = sum(line["saved_kwh"] for line in lines)

    # --- Coût ---
    if tiered:
        new_bill = tiered_bill(total_kwh - saved_kwh)
        saved_cost = bill - new_bill
    else:
        saved_cost = saved_kwh * flat_price
        new_bill = bill - saved_cost

    # --- Équipement et ROI par appareil ---
    appliances_out = []
    total_modules, investment = 0, 0.0
    for line in lines:
        item, spec = line["item"], line["spec"]
        modules = math.ceil(item.quantity / spec["units_per_module"])
        cost = modules * (module_price + install_price)
        line_saved_cost = saved_cost * (line["saved_kwh"] / saved_kwh) if saved_kwh > 0 else 0.0
        total_modules += modules
        investment += cost
        appliances_out.append({
            "type": item.type,
            "label": spec["label"],
            "quantity": item.quantity,
            "power_w": r(line["power"]),
            "hours_per_day": r(line["hours"]),
            "monthly_kwh": r(line["kwh"]),
            "share_percent": r(line["kwh"] / total_kwh * 100, 1),
            "savings_percent": r(line["rate"] * 100, 1),
            "saved_kwh": r(line["saved_kwh"]),
            "saved_cost": r(line_saved_cost),
            "modules": modules,
            "module": spec["module"],
            "action": spec["action"],
            "investment": r(cost),
            "payback_months": r(cost / line_saved_cost, 1) if line_saved_cost > 0 else None,
            "measured": spec["savings_rate"] is None,
        })

    # Priorité : temps de retour le plus court d'abord.
    order = sorted(
        range(len(appliances_out)),
        key=lambda i: appliances_out[i]["payback_months"] if appliances_out[i]["payback_months"] is not None else math.inf,
    )
    for rank, index in enumerate(order, start=1):
        appliances_out[index]["priority"] = rank

    months = ROI_YEARS * 12
    payback = investment / saved_cost if saved_cost > 0 else None
    net_gain = saved_cost * months - investment
    if payback is not None and payback > months:
        warnings.append("payback_beyond_horizon")

    return {
        "data_type": "estimate",
        "currency": CURRENCY,
        "inputs": {
            "monthly_bill": r(bill),
            "building_type": req.building_type,
            "building_label": building["label"],
            "city": req.city,
            "city_label": location["label"],
            "distributor": location["distributor"],
            "tariff_category": building["tariff"],
            "tariff_mode": "tiered" if tiered else "flat",
            "price_per_kwh": r(flat_price, 4) if not tiered else None,
            "days_per_month": r(days),
            "module_price": r(module_price),
            "installation_price": r(install_price),
        },
        "assumptions": {
            "reference_savings_percent": r(reference_percent),
            "savings_factor": building["savings_factor"],
            "lighting_savings_percent": r(lighting_rate * 100),
            "co2_kg_per_kwh": CO2_KG_PER_KWH,
            "tariff_tax_rate": TARIFF_TAX_RATE if tiered else None,
            "roi_years": ROI_YEARS,
        },
        "warnings": warnings,
        "monthly": {
            "total_kwh": r(total_kwh),
            "average_price_per_kwh": r(average_price, 4),
            "covered_kwh": r(covered_kwh),
            "covered_share_percent": r(covered_kwh / total_kwh * 100, 1),
            "covered_kwh_with_shelly": r(covered_kwh - saved_kwh),
            "saved_kwh": r(saved_kwh),
            "saved_cost": r(saved_cost),
            "bill_without_shelly": r(bill),
            "bill_with_shelly": r(new_bill),
            "bill_reduction_percent": r(saved_cost / bill * 100),
            "marginal_price_per_kwh": r(saved_cost / saved_kwh, 4) if saved_kwh > 0 else None,
            "tranche_without_shelly": tranche_label(total_kwh) if tiered else None,
            "tranche_with_shelly": tranche_label(total_kwh - saved_kwh) if tiered else None,
        },
        "yearly": {
            "saved_kwh": r(saved_kwh * 12),
            "saved_cost": r(saved_cost * 12),
            "bill_without_shelly": r(bill * 12),
            "bill_with_shelly": r(new_bill * 12),
            "co2_avoided_kg": r(saved_kwh * 12 * CO2_KG_PER_KWH),
        },
        "investment": {
            "modules": total_modules,
            "total": r(investment),
            "payback_months": r(payback, 1) if payback is not None else None,
            "net_gain": r(net_gain),
            "roi_percent": r(net_gain / investment * 100, 1) if investment > 0 else None,
            "years": ROI_YEARS,
        },
        "appliances": appliances_out,
    }


def estimate_legacy(monthly_bill: float, lamps: int, building_type: str, city: str, **extra) -> dict:
    """Ancienne interface (éclairage seul) conservée pour compatibilité."""
    req = SimulationRequest(
        monthly_bill=monthly_bill,
        building_type=building_type,
        city=city,
        appliances=[ApplianceInput(type="lighting", quantity=lamps,
                                   power_w=extra.get("lamp_power_w"), hours_per_day=extra.get("hours_per_day"))],
        price_per_kwh=extra.get("price_per_kwh"),
        days_per_month=extra.get("days_per_month"),
    )
    return estimate(req)
