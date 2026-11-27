// Tableau de bord propre à chaque profil.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Bot, Briefcase, Calculator, CheckCircle2, CircleDashed, FileText, Leaf, Server, ShieldCheck, Users, Wrench, Zap } from "lucide-react";
import { formatNumber, getJSON } from "./api";
import UserDetail from "./UserDetail";
import { useAuth } from "./auth";
import { StatusBadge } from "./MySpace";
import { day, mapsLink, visitLabel, type Project } from "./projects";
import { PROJECT_STATUS, ROLE_LABELS, type User } from "./roles";
import { fmt, formatPayback } from "./simulation";

type Go = (page: string) => void;
type Kpis = { without_shelly_kwh: number; with_shelly_kwh: number; saved_kwh: number; savings_percent: number | null; total_rooms: number };
type Status = { api: string; dataset: { start: string; end: string; rooms: number }; agent: { configured: boolean }; shelly_connected: boolean };

const card = "rounded-3xl border border-gray-100 bg-white p-6 shadow-sm";

function useData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    getJSON<T>(path, controller.signal).then(setData).catch((e: unknown) => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Erreur.");
    });
    return () => controller.abort();
  }, [path]);
  return { data, error };
}

function Stat({ label, value, hint, color = "", icon }: { label: string; value: ReactNode; hint?: string; color?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="flex items-center gap-2 text-sm text-gray-400">{icon}{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function Welcome({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm text-gray-400">{ROLE_LABELS[role]}</p>
        <p className="text-xl font-semibold">Bonjour {user?.name.split(" ")[0]} 👋</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Action({ onClick, children, primary = false }: { onClick: () => void; children: ReactNode; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${primary ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-white text-gray-700 shadow-sm hover:bg-gray-50"}`}>
      {children}
    </button>
  );
}

function ErrorBox({ text }: { text: string }) {
  return text ? <p role="alert" className="text-sm text-red-600">{text}</p> : null;
}

const countBy = (projects: Project[]) => projects.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {});

// --- Client --------------------------------------------------------------

const STEPS = ["new", "contacted", "won", "scheduled", "installed"];

function ProjectTimeline({ project }: { project: Project }) {
  const lost = project.status === "lost";
  const reached = STEPS.indexOf(project.status);
  return (
    <ol className="mt-4 grid gap-3 sm:grid-cols-5">
      {STEPS.map((step, i) => {
        const done = !lost && i <= reached;
        return (
          <li key={step} className={`flex items-center gap-2 rounded-xl p-3 text-sm ${done ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-400"}`}>
            {done ? <CheckCircle2 size={16} className="shrink-0" /> : <CircleDashed size={16} className="shrink-0" />}
            {step === "new" ? "Simulation envoyée" : PROJECT_STATUS[step].label}
          </li>
        );
      })}
    </ol>
  );
}

export function ClientDashboard({ go }: { go: Go }) {
  const { data: projects, error } = useData<Project[]>("/api/projects/mine");
  const latest = projects?.[0];
  const best = projects?.reduce((max, p) => Math.max(max, p.summary.yearly_saved_cost), 0) ?? 0;
  return (
    <div className="space-y-6">
      <Welcome>
        <Action primary onClick={() => go("Simulation")}><Calculator size={15} /> Nouvelle simulation</Action>
        <Action onClick={() => go("Mes devis")}><FileText size={15} /> Mes devis</Action>
        <Action onClick={() => go("Conseiller IA")}><Bot size={15} /> Conseiller IA</Action>
      </Welcome>
      <ErrorBox text={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Simulations enregistrées" value={projects?.length ?? "…"} icon={<FileText size={15} />} />
        <Stat label="Meilleure économie possible" value={`${fmt(best, 0)} MAD / an`} color="text-emerald-600" icon={<Leaf size={15} />} />
        <Stat label="Suivi de mon projet" value={latest ? <StatusBadge status={latest.status} /> : "Aucun"} icon={<Briefcase size={15} />} />
      </div>
      {latest ? (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Mon projet en cours · {latest.reference}</h3>
            <span className="text-xs text-gray-400">Mis à jour le {day(latest.updated_at)}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {latest.summary.building_label} à {latest.summary.city_label} : facture {fmt(latest.summary.monthly_bill, 0)} → {fmt(latest.summary.monthly_bill_with_shelly, 0)} MAD / mois,
            {" "}{latest.summary.modules} modules, retour sur investissement {formatPayback(latest.summary.payback_months)}.
            {latest.technician_name && ` Technicien : ${latest.technician_name}.`}
          </p>
          {latest.status === "scheduled" && latest.visit_at && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              📅 Visite d'installation prévue le <strong>{visitLabel(latest.visit_at)}</strong>{latest.technician_name ? ` avec ${latest.technician_name}` : ""}{latest.site_address ? `, ${latest.site_address}` : ""}.
            </p>
          )}
          {latest.status === "lost"
            ? <p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-500">Ce projet a été clôturé. Lancez une nouvelle simulation si votre situation a changé.</p>
            : <ProjectTimeline project={latest} />}
        </section>
      ) : projects && (
        <section className={`${card} text-center`}>
          <Zap size={28} className="mx-auto text-blue-600" />
          <h3 className="mt-3 font-semibold">Combien pourriez-vous économiser ?</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">Décrivez votre bâtiment et vos appareils : vous obtenez votre nouvelle facture, le retour sur investissement et un devis PDF.</p>
          <div className="mt-4 flex justify-center"><Action primary onClick={() => go("Simulation")}>Lancer ma première simulation <ArrowRight size={15} /></Action></div>
        </section>
      )}
    </div>
  );
}

// --- Commercial ------------------------------------------------------------

export function CommercialDashboard({ go }: { go: Go }) {
  const { data: projects, error } = useData<Project[]>("/api/projects");
  const stats = useMemo(() => {
    const list = projects ?? [];
    const c = countBy(list);
    const signed = (c.won ?? 0) + (c.scheduled ?? 0) + (c.installed ?? 0);
    const decided = signed + (c.lost ?? 0);
    const open = list.filter((p) => ["new", "contacted"].includes(p.status));
    return {
      c, signed, open,
      conversion: decided ? Math.round((signed / decided) * 100) : null,
      pipeline: open.reduce((s, p) => s + p.summary.investment_total, 0),
      signedAmount: list.filter((p) => ["won", "scheduled", "installed"].includes(p.status)).reduce((s, p) => s + p.summary.investment_total, 0),
      toCall: list.filter((p) => p.status === "new").sort((a, b) => b.summary.yearly_saved_cost - a.summary.yearly_saved_cost).slice(0, 5),
    };
  }, [projects]);
  return (
    <div className="space-y-6">
      <Welcome>
        <Action primary onClick={() => go("Dossiers clients")}><Briefcase size={15} /> Dossiers clients</Action>
        <Action onClick={() => go("Clients")}><Users size={15} /> Clients</Action>
      </Welcome>
      <ErrorBox text={error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="À contacter" value={stats.c.new ?? 0} hint="nouvelles simulations" color="text-blue-600" />
        <Stat label="En négociation" value={stats.c.contacted ?? 0} hint={`${fmt(stats.pipeline, 0)} MAD en jeu`} />
        <Stat label="Signés" value={stats.signed} hint={`${fmt(stats.signedAmount, 0)} MAD`} color="text-emerald-600" />
        <Stat label="Taux de transformation" value={stats.conversion === null ? "—" : `${stats.conversion} %`} hint="signés / dossiers décidés" />
      </div>
      <section className={card}>
        <h3 className="mb-1 font-semibold">À contacter en priorité</h3>
        <p className="mb-4 text-xs text-gray-400">Nouveaux dossiers, classés par économie annuelle pour le client.</p>
        {projects && stats.toCall.length === 0 && <p className="text-sm text-gray-500">Aucun nouveau dossier. 🎉</p>}
        <ul className="divide-y divide-gray-100">
          {stats.toCall.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div><p className="font-medium">{p.client_name}{p.client_company && <span className="text-gray-400"> · {p.client_company}</span>}</p>
                <p className="text-xs text-gray-400">{p.summary.building_label}, {p.summary.city_label} · {day(p.created_at)}</p></div>
              <div className="text-right"><p className="font-medium text-emerald-600">{fmt(p.summary.yearly_saved_cost, 0)} MAD / an</p>
                <p className="text-xs text-gray-400">{p.summary.modules} modules · {fmt(p.summary.investment_total, 0)} MAD</p></div>
            </li>
          ))}
        </ul>
        {stats.toCall.length > 0 && <button type="button" onClick={() => go("Dossiers clients")} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600">Traiter les dossiers <ArrowRight size={14} /></button>}
      </section>
    </div>
  );
}

// --- Technicien ------------------------------------------------------------

function CampusAndSystem({ go }: { go: Go }) {
  const { data: kpis } = useData<Kpis>("/api/analytics/kpis");
  const { data: status } = useData<Status>("/api/status");
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className={card}>
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><Zap size={18} className="text-blue-600" /> Campus ENSA Fès</h3>
        {kpis ? (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-gray-400">Sans Shelly</dt><dd className="text-lg font-semibold text-rose-500">{formatNumber(kpis.without_shelly_kwh, 0)} kWh</dd></div>
            <div><dt className="text-xs text-gray-400">Avec Shelly</dt><dd className="text-lg font-semibold text-blue-600">{formatNumber(kpis.with_shelly_kwh, 0)} kWh</dd></div>
            <div><dt className="text-xs text-gray-400">Économisé</dt><dd className="text-lg font-semibold text-emerald-600">{formatNumber(kpis.saved_kwh, 0)} kWh</dd></div>
            <div><dt className="text-xs text-gray-400">Taux d'économie</dt><dd className="text-lg font-semibold">{kpis.savings_percent === null ? "—" : `${formatNumber(kpis.savings_percent, 1)} %`}</dd></div>
          </dl>
        ) : <p className="text-sm text-gray-400">Chargement…</p>}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <button type="button" onClick={() => go("Alertes & Gaspillage")} className="font-medium text-blue-600">Alertes de gaspillage →</button>
          <button type="button" onClick={() => go("Prévisions")} className="font-medium text-blue-600">Prévisions →</button>
        </div>
      </section>
      <section className={card}>
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><Server size={18} className="text-blue-600" /> État du système</h3>
        {status ? (
          <ul className="space-y-2 text-sm">
            {[
              ["Serveur API", status.api === "ok"],
              ["Agent IA (clé Groq)", status.agent.configured],
              ["Modules Shelly réels", status.shelly_connected],
            ].map(([label, ok]) => (
              <li key={String(label)} className="flex items-center justify-between">
                <span>{label}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{ok ? "OK" : label === "Modules Shelly réels" ? "Simulation" : "À configurer"}</span>
              </li>
            ))}
            <li className="flex items-center justify-between"><span>Données</span><span className="text-gray-500">{status.dataset.rooms} salles · {day(status.dataset.start)} → {day(status.dataset.end)}</span></li>
          </ul>
        ) : <p className="text-sm text-gray-400">Chargement…</p>}
      </section>
    </div>
  );
}

export function TechnicienDashboard({ go }: { go: Go }) {
  const { data: visits, error } = useData<Project[]>("/api/projects");
  const upcoming = (visits ?? []).filter((p) => p.status === "scheduled").sort((a, b) => (a.visit_at ?? "9").localeCompare(b.visit_at ?? "9"));
  const [today] = useState(() => new Date().toDateString());
  const todayCount = upcoming.filter((p) => p.visit_at && new Date(p.visit_at).toDateString() === today).length;
  const next = upcoming[0];
  const address = next ? next.site_address || next.client_address || "" : "";
  return (
    <div className="space-y-6">
      <Welcome><Action primary onClick={() => go("Mes visites")}><Wrench size={15} /> Mes visites</Action></Welcome>
      <ErrorBox text={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Aujourd'hui" value={todayCount} hint="visites prévues" color="text-blue-600" />
        <Stat label="À venir" value={upcoming.length} hint="installations planifiées" color="text-amber-600" />
        <Stat label="Terminées" value={(visits ?? []).filter((p) => p.status === "installed").length} color="text-emerald-600" />
      </div>
      <section className={card}>
        <h3 className="mb-3 font-semibold">Prochaine visite</h3>
        {visits && !next && <p className="text-sm text-gray-500">Aucune visite planifiée pour le moment.</p>}
        {next && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 text-sm">
              <p className="text-lg font-semibold first-letter:uppercase">{visitLabel(next.visit_at)}</p>
              <p><strong>{next.client_name}</strong>{next.client_phone && <> · <a href={`tel:${next.client_phone}`} className="text-blue-600">{next.client_phone}</a></>}</p>
              <p className="text-gray-500">{address || "Adresse à demander au client"} · {next.summary.modules} modules Shelly</p>
            </div>
            <div className="flex gap-2">
              {address && <a href={mapsLink(address)} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200">Itinéraire</a>}
              <Action primary onClick={() => go("Mes visites")}>Voir le détail <ArrowRight size={15} /></Action>
            </div>
          </div>
        )}
        {upcoming.length > 1 && (
          <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
            {upcoming.slice(1, 6).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="first-letter:uppercase">{visitLabel(p.visit_at, false)}</span>
                <span className="text-gray-500">{p.client_name} · {p.summary.city_label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CampusAndSystem go={go} />
    </div>
  );
}

// --- Administrateur ----------------------------------------------------------

type AuditEntry = { id: number; created_at: string; action: string; actor_name: string; target: string; details: string };
const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Connexion", "auth.failed": "Connexion refusée", "auth.register": "Nouvelle inscription",
  "user.create": "Compte créé", "user.update": "Compte modifié", "user.logout": "Déconnexion forcée",
  "user.delete": "Compte supprimé", "project.status": "Dossier mis à jour", "project.delete": "Dossier supprimé",
};

export function AdminDashboard({ go }: { go: Go }) {
  const { data: users, error } = useData<User[]>("/api/users");
  const { data: projects } = useData<Project[]>("/api/projects");
  const { data: audit } = useData<AuditEntry[]>("/api/users/audit?limit=8");
  const [open, setOpen] = useState<number | null>(null);
  const recentClients = (users ?? []).filter((u) => u.role === "client").slice(0, 5);
  const byRole = (users ?? []).reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.role]: (acc[u.role] ?? 0) + 1 }), {});
  const c = countBy(projects ?? []);
  return (
    <div className="space-y-6">
      <Welcome>
        <Action primary onClick={() => go("Utilisateurs")}><ShieldCheck size={15} /> Utilisateurs</Action>
        <Action onClick={() => go("Dossiers clients")}><Briefcase size={15} /> Dossiers</Action>
        <Action onClick={() => go("Clients")}><Users size={15} /> Clients</Action>
      </Welcome>
      <ErrorBox text={error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["client", "commercial", "technicien", "admin"] as const).map((r) => (
          <Stat key={r} label={`${ROLE_LABELS[r]}s`} value={byRole[r] ?? 0} icon={<Users size={15} />} />
        ))}
      </div>
      <section className={card}>
        <h3 className="mb-4 font-semibold">Dossiers clients par étape</h3>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Object.keys(PROJECT_STATUS).map((st) => (
            <div key={st} className="rounded-2xl bg-gray-50 p-4"><StatusBadge status={st} /><p className="mt-2 text-2xl font-semibold">{c[st] ?? 0}</p></div>
          ))}
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className={card}>
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Dernières simulations</h3>
            <button type="button" onClick={() => go("Dossiers clients")} className="text-sm font-medium text-blue-600">Tout voir →</button></div>
          {projects?.length === 0 && <p className="text-sm text-gray-500">Aucune simulation enregistrée.</p>}
          <ul className="divide-y divide-gray-100">
            {(projects ?? []).slice(0, 6).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen(p.client_id)} className="flex w-full items-center justify-between gap-3 rounded-lg py-3 text-left text-sm hover:bg-gray-50">
                  <div className="min-w-0"><p className="truncate font-medium">{p.client_name}</p><p className="truncate text-xs text-gray-400">{p.reference} · {p.summary.building_label}, {p.summary.city_label} · {day(p.created_at)}</p></div>
                  <div className="shrink-0 text-right"><p className="text-emerald-600">{fmt(p.summary.yearly_saved_cost, 0)} MAD/an</p><StatusBadge status={p.status} /></div>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Activité récente</h3>
            <button type="button" onClick={() => go("Journal d'activité")} className="text-sm font-medium text-blue-600">Journal complet →</button></div>
          <ol className="space-y-3">
            {(audit ?? []).map((e) => (
              <li key={e.id} className="text-sm">
                <p><span className="font-medium">{AUDIT_LABELS[e.action] ?? e.action}</span> <span className="text-gray-500">· {e.target}</span></p>
                <p className="text-xs text-gray-400">{new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}{e.actor_name ? ` · par ${e.actor_name}` : ""}{e.details ? ` · ${e.details}` : ""}</p>
              </li>
            ))}
          </ol>
          {recentClients.length > 0 && (
            <>
              <h4 className="mb-2 mt-6 text-sm font-semibold">Derniers clients inscrits</h4>
              <div className="flex flex-wrap gap-2">
                {recentClients.map((u) => (
                  <button key={u.id} type="button" onClick={() => setOpen(u.id)} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700">{u.name}</button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      <CampusAndSystem go={go} />
      {open !== null && <UserDetail userId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
