// Types partagés et coordonnées de l'Espace Client.

// TODO équipe : remplacer par les vraies coordonnées commerciales.
// Elles apparaissent sur la page (bouton « Nous contacter ») et sur le devis PDF.
export const COMPANY = {
  name: "ENSA EnergyOS",
  tagline: "Smart Campus Energy Management",
  address: "ENSA Fès, Route d'Imouzzer, Fès, Maroc",
  email: "contact@ensa-energyos.example",
  phone: "+212 5 00 00 00 00",
};

export type BuildingType = {
  id: string;
  label: string;
  hours_per_day: number;
  days_per_month: number;
  savings_factor: number;
  tariff: "residential" | "professional";
};

export type City = {
  id: string;
  label: string;
  distributor: string;
  residential: number;
  professional: number;
};

export type ApplianceType = {
  id: string;
  label: string;
  unit: string;
  power_w: number;
  hours_per_day: number | null;
  savings_rate: number | null;
  units_per_module: number;
  module: string;
  action: string;
};

export type SimulationOptions = {
  currency: string;
  reference_savings_percent: number;
  default_module_price: number;
  default_installation_price: number;
  roi_years: number;
  building_types: BuildingType[];
  cities: City[];
  appliance_types: ApplianceType[];
  residential_tranches: { up_to_kwh: number | null; price_ht: number }[];
  tariff_tax_rate: number;
  progressive_limit_kwh: number;
};

export type ApplianceInput = {
  type: string;
  quantity: number;
  power_w?: number;
  hours_per_day?: number;
};

export type SimulationRequest = {
  monthly_bill: number;
  building_type: string;
  city: string;
  appliances: ApplianceInput[];
  tariff_mode: "flat" | "tiered";
  price_per_kwh?: number;
  days_per_month?: number;
  module_price?: number;
  installation_price?: number;
};

export type ApplianceResult = {
  type: string;
  label: string;
  quantity: number;
  power_w: number;
  hours_per_day: number;
  monthly_kwh: number;
  share_percent: number;
  savings_percent: number;
  saved_kwh: number;
  saved_cost: number;
  modules: number;
  module: string;
  action: string;
  investment: number;
  payback_months: number | null;
  measured: boolean;
  priority: number;
};

export type Estimate = {
  currency: string;
  inputs: {
    monthly_bill: number;
    building_type: string;
    building_label: string;
    city: string;
    city_label: string;
    distributor: string;
    tariff_category: "residential" | "professional";
    tariff_mode: "flat" | "tiered";
    price_per_kwh: number | null;
    days_per_month: number;
    module_price: number;
    installation_price: number;
  };
  assumptions: {
    reference_savings_percent: number;
    savings_factor: number;
    lighting_savings_percent: number;
    co2_kg_per_kwh: number;
    tariff_tax_rate: number | null;
    roi_years: number;
  };
  warnings: string[];
  monthly: {
    total_kwh: number;
    average_price_per_kwh: number;
    covered_kwh: number;
    covered_share_percent: number;
    covered_kwh_with_shelly: number;
    saved_kwh: number;
    saved_cost: number;
    bill_without_shelly: number;
    bill_with_shelly: number;
    bill_reduction_percent: number;
    marginal_price_per_kwh: number | null;
    tranche_without_shelly: string | null;
    tranche_with_shelly: string | null;
  };
  yearly: {
    saved_kwh: number;
    saved_cost: number;
    bill_without_shelly: number;
    bill_with_shelly: number;
    co2_avoided_kg: number;
  };
  investment: {
    modules: number;
    total: number;
    payback_months: number | null;
    net_gain: number;
    roi_percent: number | null;
    years: number;
  };
  appliances: ApplianceResult[];
};

export type ClientInfo = {
  name: string;
  company: string;
  email: string;
  phone: string;
};

// Format français sans espaces insécables (les polices PDF standard ne les gèrent pas).
export function fmt(value: number, digits = 2): string {
  const [int, dec] = Math.abs(value).toFixed(digits).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${value < 0 ? "-" : ""}${grouped}${dec ? `,${dec}` : ""}`;
}

export function formatPayback(months: number | null): string {
  if (months === null) return "non rentable";
  const total = Math.max(1, Math.round(months));
  if (total < 12) return `${total} mois`;
  const years = Math.floor(total / 12);
  const rest = total % 12;
  return rest ? `${years} an${years > 1 ? "s" : ""} ${rest} mois` : `${years} an${years > 1 ? "s" : ""}`;
}

export function newDevisReference(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  // Aléa cryptographique (pas Math.random) pour une référence non prévisible.
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `DEV-${stamp}-${suffix}`;
}
