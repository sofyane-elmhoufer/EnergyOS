import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.simulation_service import tiered_bill, tiered_kwh_from_bill, tranche_label

T = 1.18
cases = {
    50: 50 * 0.9010 * T,
    100: 100 * 0.9010 * T,
    150: (100 * 0.9010 + 50 * 1.0732) * T,
    180: 180 * 1.0732 * T,       # sélectif : tout à 1,0732
    250: 250 * 1.1676 * T,       # tout à 1,1676
    400: 400 * 1.3817 * T,
    600: 600 * 1.5958 * T,
}
for kwh, expected in cases.items():
    got = tiered_bill(kwh)
    assert abs(got - expected) < 1e-6, (kwh, got, expected)
    back = tiered_kwh_from_bill(got)
    assert abs(back - kwh) < 0.01, (kwh, back)
    print(f"{kwh:>4} kWh -> {got:8.2f} MAD TTC  [{tranche_label(kwh)}]  inverse={back:.2f}")
# Effet de seuil : passer de 210 à 190 kWh fait baisser le prix de TOUS les kWh
print("210 kWh:", round(tiered_bill(210), 2), " 190 kWh:", round(tiered_bill(190), 2),
      " économie pour 20 kWh:", round(tiered_bill(210) - tiered_bill(190), 2))
for k in (100, 101, 150, 151, 200, 201, 500, 501):
    print(k, tranche_label(k))
print("OK tarif")
