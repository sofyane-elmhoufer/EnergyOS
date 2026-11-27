// Conseiller énergétique IA du client : il répond à partir de l'une de ses simulations enregistrées.
import { useEffect, useState } from "react";
import { Bot, Calculator, ShieldCheck } from "lucide-react";
import { getJSON } from "./api";
import ChatPanel from "./ChatPanel";
import { day, type Project } from "./projects";
import { fmt } from "./simulation";

const SUGGESTIONS = [
  "Quel appareil dois-je équiper en premier ?",
  "Comment réduire encore ma facture ?",
  "Explique-moi le retour sur investissement",
  "Quels horaires programmer pour mes appareils ?",
];

export default function AdvisorPage({ onSimulate }: { onSimulate: () => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    getJSON<Project[]>("/api/projects/mine")
      .then((list) => { setProjects(list); setSelected(list[0]?.id ?? null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur."));
  }, []);

  const project = projects?.find((p) => p.id === selected);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {projects === null && !error && <p className="text-sm text-gray-400">Chargement…</p>}

      {projects?.length === 0 && (
        <section className="rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <Bot size={30} className="mx-auto text-blue-600" />
          <h3 className="mt-3 font-semibold">Votre conseiller a besoin d'une simulation</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            Décrivez d'abord votre bâtiment et vos appareils : le conseiller s'appuiera sur vos chiffres pour vous recommander quoi équiper, dans quel ordre et avec quels horaires.
          </p>
          <button type="button" onClick={onSimulate}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <Calculator size={16} /> Faire ma simulation
          </button>
        </section>
      )}

      {project && projects && (
        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 font-semibold"><Bot size={18} className="text-blue-600" /> Votre conseiller énergétique</h3>
              <p className="mt-1 text-xs text-gray-400">
                Il répond à partir de la simulation choisie : {project.summary.building_label} à {project.summary.city_label},
                facture {fmt(project.summary.monthly_bill, 0)} MAD / mois, économie estimée {fmt(project.summary.yearly_saved_cost, 0)} MAD / an.
              </p>
            </div>
            {projects.length > 1 && (
              <label className="text-xs text-gray-500">Simulation
                <select className="mt-1 block rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm" value={selected ?? ""}
                  onChange={(e) => setSelected(Number(e.target.value))}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.reference} · {p.summary.building_label} · {day(p.created_at)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {/* key : changer de simulation repart d'une conversation vierge. */}
          <ChatPanel
            key={project.id}
            endpoint="advice"
            extraBody={{ simulation: project.request }}
            suggestions={SUGGESTIONS}
            placeholder="Ex : Par quoi dois-je commencer avec un budget de 2000 MAD ?"
          />
          <p className="mt-4 flex gap-2 text-xs text-gray-400">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            Conseils indicatifs générés par une IA à partir de vos chiffres ; le prix et le plan définitifs sont fixés avec notre équipe après la visite technique.
          </p>
        </section>
      )}
    </div>
  );
}
