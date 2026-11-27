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
