// Suivi des dossiers clients : commercial (contact, acceptation, planification de la visite), administrateur (tout).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, CalendarClock, CheckCircle2, Download, Mail, MapPin, Phone, Search, Trash2 } from "lucide-react";
import { deleteJSON, getJSON, patchJSON } from "./api";
import { useAuth } from "./auth";
import { StatusBadge } from "./MySpace";
import { day, downloadProjectDevis, mapsLink, visitLabel, type Project } from "./projects";
import { PROJECT_STATUS } from "./roles";
import { fmt, formatPayback } from "./simulation";

// « Installation planifiée » s'obtient en planifiant la visite (technicien + date) ; « Installé » est confirmé par le technicien.
const STATUS_RIGHTS: Record<string, string[]> = {
  commercial: ["new", "contacted", "won", "lost"],
  admin: Object.keys(PROJECT_STATUS),
};
const cardClass = "rounded-3xl border border-gray-100 bg-white p-6 shadow-sm";
const smallInput = "w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700 outline-none focus:border-blue-500";

function ProjectCard({ project, role, technicians, onChange, onDelete }: {
  project: Project; role: string; technicians: { id: number; name: string }[]; onChange: (p: Project) => void; onDelete: (id: number) => void;
}) {
  const [note, setNote] = useState(project.note ?? "");
  const [error, setError] = useState("");
  const [visit, setVisit] = useState({
    technician_id: project.technician_id ?? 0,
    visit_at: project.visit_at ?? "",
    site_address: project.site_address || project.client_address || "",
  });
  const planning = ["won", "scheduled", "installed"].includes(project.status);
  const visitChanged = visit.technician_id !== (project.technician_id ?? 0) || visit.visit_at !== (project.visit_at ?? "")
    || visit.site_address !== (project.site_address || project.client_address || "");
  const allowed = STATUS_RIGHTS[role] ?? [];
  const statuses = allowed.includes(project.status) ? allowed : [project.status, ...allowed];

  const save = async (changes: Record<string, unknown>) => {
    setError("");
    try { onChange(await patchJSON<Project>(`/api/projects/${project.id}`, changes)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur."); }
  };
  const s = project.summary;

  return (
    <article className="rounded-2xl border border-gray-100 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{project.client_name}{project.client_company && <span className="font-normal text-gray-400"> · {project.client_company}</span>}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <a href={`mailto:${project.client_email}?subject=${encodeURIComponent(`Votre devis ${project.reference}`)}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Mail size={12} /> {project.client_email}</a>
            {project.client_phone && <a href={`tel:${project.client_phone}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Phone size={12} /> {project.client_phone}</a>}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-gray-400">Devis</dt><dd className="font-medium">{project.reference}</dd><dd className="text-xs text-gray-400">{day(project.created_at)}</dd></div>
        <div><dt className="text-xs text-gray-400">Bâtiment</dt><dd>{s.building_label}</dd><dd className="text-xs text-gray-400">{s.city_label}</dd></div>
        <div><dt className="text-xs text-gray-400">Économie / an</dt><dd className="font-medium text-emerald-600">{fmt(s.yearly_saved_cost, 0)} {s.currency}</dd><dd className="text-xs text-gray-400">facture {fmt(s.monthly_bill, 0)} {s.currency}/mois</dd></div>
        <div><dt className="text-xs text-gray-400">Installation</dt><dd>{s.modules} modules · {fmt(s.investment_total, 0)} {s.currency}</dd><dd className="text-xs text-gray-400">retour {formatPayback(s.payback_months)}</dd></div>
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr]">
        <label className="text-xs text-gray-500">Statut commercial
          <select className={`${smallInput} mt-1`} value={project.status} onChange={(e) => save({ status: e.target.value })}>
            {statuses.map((st) => <option key={st} value={st} disabled={!allowed.includes(st)}>{PROJECT_STATUS[st]?.label ?? st}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">Note interne et consignes pour le technicien (invisible pour le client)
          <div className="mt-1 flex gap-2">
            <input className={smallInput} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : sonner au portail, tableau électrique au sous-sol…" />
            <button type="button" onClick={() => save({ note })} disabled={note === (project.note ?? "")}
              className="shrink-0 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white disabled:opacity-30">OK</button>
          </div>
        </label>
      </div>

      {planning ? (
        <div className="mt-4 rounded-2xl bg-gray-50 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarClock size={16} className="text-blue-600" />
            {project.status === "installed" ? "Installation réalisée" : project.status === "scheduled" ? `Visite planifiée : ${visitLabel(project.visit_at)}` : "Planifier la visite d'installation"}</p>
          {project.status === "installed" ? (
            <div className="space-y-1 text-sm text-gray-600">
              <p className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-600" /> Par {project.technician_name ?? "—"}{project.installed_at && `, le ${day(project.installed_at)}`}</p>
              {project.report && <p className="rounded-xl bg-white p-3"><strong>Compte rendu :</strong> {project.report}</p>}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
                <label className="text-xs text-gray-500">Technicien
                  <select className={`${smallInput} mt-1`} value={visit.technician_id} onChange={(e) => setVisit({ ...visit, technician_id: Number(e.target.value) })}>
                    <option value={0}>Choisir…</option>
                    {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">Date et heure
                  <input type="datetime-local" className={`${smallInput} mt-1`} value={visit.visit_at} onChange={(e) => setVisit({ ...visit, visit_at: e.target.value })} />
                </label>
                <label className="text-xs text-gray-500">Adresse d'intervention
                  <input className={`${smallInput} mt-1`} maxLength={200} value={visit.site_address} placeholder="N°, rue, quartier, ville"
                    onChange={(e) => setVisit({ ...visit, site_address: e.target.value })} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" disabled={!visitChanged || !visit.technician_id || !visit.visit_at}
                  onClick={() => save({ technician_id: visit.technician_id, visit_at: visit.visit_at, site_address: visit.site_address.trim() })}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                  {project.status === "scheduled" ? "Modifier la visite" : "Planifier la visite"}</button>
                {visit.site_address && <a href={mapsLink(visit.site_address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"><MapPin size={12} /> Voir sur la carte</a>}
                <span className="text-xs text-gray-400">Le technicien voit la visite dans « Mes visites » avec l'adresse, l'horaire, le matériel et vos consignes.</span>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">Passez le dossier en « Accepté » pour planifier la visite d'installation.</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : <span />}
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => downloadProjectDevis(project).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur."))}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"><Download size={13} /> Devis PDF</button>
          {role === "admin" && (
            <button type="button" onClick={async () => {
              if (!window.confirm(`Supprimer définitivement le dossier ${project.reference} de ${project.client_name} ?`)) return;
              try { await deleteJSON(`/api/projects/${project.id}`); onDelete(project.id); }
              catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur."); }
            }} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-rose-600"><Trash2 size={13} /> Supprimer</button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ProjectsPage() {
  const { role } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [technicians, setTechnicians] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    getJSON<Project[]>("/api/projects").then(setProjects).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur."));
    getJSON<{ id: number; name: string }[]>("/api/users/technicians").then(setTechnicians).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    projects?.forEach((p) => { c[p.status] = (c[p.status] ?? 0) + 1; });
    return c;
  }, [projects]);
  const visibleStatuses = Object.keys(PROJECT_STATUS);
  const shown = (projects ?? []).filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || [p.client_name, p.client_email, p.client_company, p.reference, p.summary.city_label].some((v) => v.toLowerCase().includes(q));
  });
  const pipeline = (projects ?? []).filter((p) => !["lost"].includes(p.status)).reduce((sum, p) => sum + p.summary.investment_total, 0);

  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Briefcase size={16} className="text-blue-600" />
        Chaque simulation enregistrée par un client crée un dossier : contactez le client, passez-le en « Accepté », puis planifiez la visite (technicien, date, heure, adresse).
      </p>

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {visibleStatuses.map((st) => (
          <button key={st} type="button" onClick={() => setFilter(filter === st ? "all" : st)}
            className={`rounded-2xl border p-4 text-left transition ${filter === st ? "border-blue-600 bg-blue-50" : "border-gray-100 bg-white hover:shadow-sm"}`}>
            <p className="text-xs text-gray-400">{PROJECT_STATUS[st].label}</p>
            <p className="mt-1 text-2xl font-semibold">{counts[st] ?? 0}</p>
          </button>
        ))}
      </div>

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search size={15} className="absolute left-3 top-3 text-gray-400" />
            <input className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" placeholder="Rechercher un client, une ville, un devis…"
              value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
          </div>
          <p className="text-xs text-gray-400">Montant des dossiers en cours : <strong className="text-gray-700">{fmt(pipeline, 0)} MAD</strong></p>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {projects === null && !error && <p className="text-sm text-gray-400">Chargement…</p>}
        {projects && shown.length === 0 && <p className="text-sm text-gray-500">Aucun dossier{filter !== "all" ? " avec ce statut" : ""}.</p>}
        <div className="space-y-4">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} role={role} technicians={technicians}
              onDelete={(id) => setProjects((list) => (list ?? []).filter((x) => x.id !== id))}
              onChange={(updated) => setProjects((list) => (list ?? []).map((x) => (x.id === updated.id ? updated : x)))} />
          ))}
        </div>
      </section>
    </div>
  );
}
