// Technicien : ses visites d'installation (date, heure, adresse, client, matériel, consignes) et leur confirmation.
import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, ClipboardList, MapPin, Navigation, Phone, User, Wrench } from "lucide-react";
import { getJSON, patchJSON } from "./api";
import { APPLIANCE_LABELS, mapsLink, visitLabel, type Project } from "./projects";

const card = "rounded-3xl border border-gray-100 bg-white p-6 shadow-sm";

function isToday(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function VisitCard({ project, onDone }: { project: Project; onDone: (p: Project) => void }) {
  const [report, setReport] = useState(project.report ?? "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const done = project.status === "installed";
  const address = project.site_address || project.client_address || "";

  const confirm = async () => {
    setError("");
    try { onDone(await patchJSON<Project>(`/api/projects/${project.id}`, { status: "installed", report: report.trim() })); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur."); }
  };

  return (
    <article className={`${card} ${done ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-2xl p-3 ${done ? "bg-emerald-50 text-emerald-600" : isToday(project.visit_at) ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"}`}>
            {done ? <CheckCircle2 size={22} /> : <CalendarClock size={22} />}
          </span>
          <div>
            <p className="text-lg font-semibold first-letter:uppercase">{visitLabel(project.visit_at)}</p>
            <p className="text-xs text-gray-400">{isToday(project.visit_at) && !done ? "Aujourd'hui · " : ""}Devis {project.reference}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {done ? "Installation terminée" : "À réaliser"}
        </span>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2"><User size={16} className="mt-0.5 shrink-0 text-gray-400" />
            <span><strong>{project.client_name}</strong>{project.client_company && <span className="text-gray-500"> · {project.client_company}</span>}</span></p>
          {project.client_phone && (
            <a href={`tel:${project.client_phone}`} className="flex items-center gap-2 text-blue-600 hover:underline"><Phone size={16} className="shrink-0" /> {project.client_phone}</a>
          )}
          <div className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-gray-400" />
            {address ? (
              <div>
                <p>{address}</p>
                <a href={mapsLink(address)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                  <Navigation size={12} /> Itinéraire</a>
              </div>
            ) : <p className="text-amber-700">Adresse non renseignée : appelez le client.</p>}
          </div>
          <p className="text-xs text-gray-400">{project.summary.building_label} · {project.summary.city_label}</p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="mb-2 flex items-center gap-2 font-semibold"><Wrench size={15} /> {project.summary.modules} module{project.summary.modules > 1 ? "s" : ""} Shelly à installer</p>
            <ul className="space-y-1 text-gray-600">
              {project.request.appliances.map((a, i) => (
                <li key={i}>• {APPLIANCE_LABELS[a.type] ?? a.type} × {a.quantity}{a.power_w ? ` (${a.power_w} W)` : ""}</li>
              ))}
            </ul>
          </div>
          {project.note && (
            <p className="flex gap-2 rounded-2xl bg-amber-50 p-3 text-amber-900"><ClipboardList size={15} className="mt-0.5 shrink-0" /> <span><strong>Consignes :</strong> {project.note}</span></p>
          )}
        </div>
      </div>

      {done ? (
        project.report && <p className="mt-5 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Compte rendu :</strong> {project.report}</p>
      ) : confirming ? (
        <div className="mt-5 space-y-3 border-t border-gray-100 pt-4">
          <label className="block text-xs font-medium text-gray-500">Compte rendu de l'intervention (facultatif)
            <textarea className="mt-2 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-500" rows={3} maxLength={2000}
              placeholder="Ex : 8 modules posés sur le tableau du 1er étage, programmation 8h-18h testée avec le client."
              value={report} onChange={(e) => setReport(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={confirm} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><CheckCircle2 size={16} /> Valider : installation terminée</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-200">Annuler</button>
          </div>
        </div>
      ) : (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><CheckCircle2 size={16} /> J'ai terminé l'installation</button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </article>
  );
}

export default function TechnicianVisits() {
  const [visits, setVisits] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getJSON<Project[]>("/api/projects").then(setVisits).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur."));
  }, []);

  const byDate = (a: Project, b: Project) => (a.visit_at ?? "9").localeCompare(b.visit_at ?? "9");
  const upcoming = (visits ?? []).filter((v) => v.status !== "installed").sort(byDate);
  const done = (visits ?? []).filter((v) => v.status === "installed").sort((a, b) => byDate(b, a));
  const replace = (p: Project) => setVisits((list) => (list ?? []).map((x) => (x.id === p.id ? p : x)));

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Vos visites d'installation, planifiées par l'équipe commerciale. Après chaque intervention, confirmez-la et laissez un court compte rendu.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {visits === null && !error && <p className="text-sm text-gray-400">Chargement…</p>}
      {visits && upcoming.length === 0 && (
        <div className={`${card} text-center text-sm text-gray-500`}>Aucune visite à venir. Les nouvelles visites apparaîtront ici dès qu'elles vous seront affectées.</div>
      )}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <h3 className="font-semibold">À venir ({upcoming.length})</h3>
          {upcoming.map((v) => <VisitCard key={v.id} project={v} onDone={replace} />)}
        </section>
      )}
      {done.length > 0 && (
        <section className="space-y-4">
          <h3 className="font-semibold text-gray-500">Terminées ({done.length})</h3>
          {done.map((v) => <VisitCard key={v.id} project={v} onDone={replace} />)}
        </section>
      )}
    </div>
  );
}
