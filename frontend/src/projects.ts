// Dossiers clients : type partagé et téléchargement du devis enregistré.
import { postJSON } from "./api";
import { downloadDevis } from "./devisPdf";
import type { Estimate, SimulationRequest } from "./simulation";

export type Project = {
  id: number;
  reference: string;
  status: string;
  note?: string;
  created_at: string;
  updated_at: string;
  technician_id: number | null;
  technician_name: string | null;
  technician_phone?: string | null;
  site_address: string;
  visit_at: string | null;
  report: string;
  installed_at: string | null;
  client_address?: string;
  client_id: number;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_company: string;
  request: SimulationRequest;
  summary: {
    building_label: string;
    city_label: string;
    monthly_bill: number;
    monthly_bill_with_shelly: number;
    yearly_saved_cost: number;
    yearly_saved_kwh: number;
    investment_total: number;
    modules: number;
    payback_months: number | null;
    currency: string;
  };
};

export const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/** Recalcule la simulation enregistrée et régénère le même devis PDF. */
export async function downloadProjectDevis(project: Project) {
  const estimate = await postJSON<Estimate>("/api/simulation/estimate", project.request);
  await downloadDevis(estimate, {
    name: project.client_name, company: project.client_company, email: project.client_email, phone: project.client_phone,
  }, project.reference);
}

/** « mardi 2 décembre 2026 à 09:30 » à partir de « 2026-12-02T09:30 ». */
export function visitLabel(visitAt: string | null, withYear = true): string {
  if (!visitAt) return "Date à définir";
  const date = new Date(visitAt);
  const d = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) });
  return `${d} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

export const APPLIANCE_LABELS: Record<string, string> = {
  lighting: "Éclairage (lampes LED)", air_conditioner: "Climatiseur", water_heater: "Chauffe-eau électrique",
  electric_heater: "Radiateur électrique", standby: "Appareils en veille", ventilation: "Ventilation / pompe", other: "Autre appareil",
};

export const mapsLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
