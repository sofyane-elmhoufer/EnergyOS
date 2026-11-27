// Fiche complète d'un compte : profil, simulations / dossiers, interventions, activité, actions d'administration.
import { useCallback, useEffect, useState } from "react";
import { Download, KeyRound, LogOut, Mail, Phone, Trash2, UserCheck, UserX, X } from "lucide-react";
import { deleteJSON, getJSON, patchJSON, postJSON } from "./api";
import { useAuth } from "./auth";
import { StatusBadge } from "./MySpace";
import { day, downloadProjectDevis, type Project } from "./projects";
import { ROLE_LABELS, type User } from "./roles";
import { fmt, formatPayback } from "./simulation";

type Overview = {
  user: User & { sessions?: number };
  projects: Project[];
  assigned_projects: Project[];
  activity: { id: number; created_at: string; action: string; actor_name: string; target: string; details: string }[];
  totals: { simulations: number; yearly_saving_best: number; investment_signed: number };
};

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Connexion", "auth.failed": "Connexion refusée", "auth.register": "Inscription",
  "user.create": "Compte créé", "user.update": "Compte modifié", "user.logout": "Déconnexion forcée",
  "user.delete": "Compte supprimé", "project.status": "Dossier : statut", "project.delete": "Dossier supprimé",
};
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

function ProjectsTable({ projects, showClient = false }: { projects: Project[]; showClient?: boolean }) {
  const [error, setError] = useState("");
  return (
    <div className="overflow-x-auto">
      {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-gray-400">
          <tr><th className="py-2 pr-3">Devis</th>{showClient && <th className="pr-3">Client</th>}<th className="pr-3">Bâtiment</th>
            <th className="pr-3 text-right">Facture / mois</th><th className="pr-3 text-right">Économie / an</th>
            <th className="pr-3 text-right">Installation</th><th className="pr-3">Statut</th><th /></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {projects.map((p) => (
            <tr key={p.id} className="align-top">
              <td className="py-3 pr-3"><p className="font-medium">{p.reference}</p><p className="text-xs text-gray-400">{day(p.created_at)}</p></td>
              {showClient && <td className="py-3 pr-3">{p.client_name}<p className="text-xs text-gray-400">{p.client_phone || p.client_email}</p></td>}
              <td className="py-3 pr-3">{p.summary.building_label}<p className="text-xs text-gray-400">{p.summary.city_label}</p></td>
              <td className="py-3 pr-3 text-right">{fmt(p.summary.monthly_bill, 0)} → <span className="text-blue-600">{fmt(p.summary.monthly_bill_with_shelly, 0)}</span></td>
              <td className="py-3 pr-3 text-right font-medium text-emerald-600">{fmt(p.summary.yearly_saved_cost, 0)} MAD</td>
              <td className="py-3 pr-3 text-right">{p.summary.modules} modules<p className="text-xs text-gray-400">{fmt(p.summary.investment_total, 0)} MAD · {formatPayback(p.summary.payback_months)}</p></td>
              <td className="py-3 pr-3"><StatusBadge status={p.status} />
                {p.technician_name && <p className="mt-1 text-xs text-gray-400">Tech. : {p.technician_name}</p>}
                {p.note && <p className="mt-1 max-w-[14rem] text-xs italic text-gray-500">« {p.note} »</p>}</td>
              <td className="py-3 text-right">
                <button type="button" title="Télécharger le devis" aria-label={`Télécharger le devis ${p.reference}`}
                  onClick={() => downloadProjectDevis(p).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur."))}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"><Download size={15} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UserDetail({ userId, onClose, onChanged }: { userId: number; onClose: () => void; onChanged?: () => void }) {
  const { role: viewerRole, user: me } = useAuth();
  const admin = viewerRole === "admin";
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    getJSON<Overview>(`/api/users/${userId}/overview`).then(setData)
      .catch((e: unknown) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur." }));
  }, [userId]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action: () => Promise<unknown>, ok: string, reload = true) => {
    setMessage(null);
    try { await action(); setMessage({ ok: true, text: ok }); if (reload) load(); onChanged?.(); }
    catch (e: unknown) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur." }); }
  };

  const u = data?.user;
  const self = u?.id === me?.id;
  const btn = "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Fiche utilisateur"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="h-full w-full max-w-4xl overflow-y-auto bg-[var(--app-bg)] p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-400">Fiche {u ? ROLE_LABELS[u.role].toLowerCase() : "utilisateur"}</p>
            <h3 className="text-2xl font-semibold tracking-tight">{u?.name ?? "Chargement…"}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la fiche" className="rounded-xl bg-white p-2 text-gray-500 shadow-sm hover:text-gray-900"><X size={18} /></button>
        </div>
        {message && <p role={message.ok ? "status" : "alert"} className={`mb-4 text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}

        {u && data && (
          <div className="space-y-6">
            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs text-gray-400">Contact</p>
                  <a href={`mailto:${u.email}`} className="mt-1 flex items-center gap-1 text-sm hover:text-blue-600"><Mail size={13} /> {u.email}</a>
                  {u.phone && <a href={`tel:${u.phone}`} className="mt-1 flex items-center gap-1 text-sm hover:text-blue-600"><Phone size={13} /> {u.phone}</a>}
                  {u.company && <p className="mt-1 text-sm text-gray-500">{u.company}</p>}</div>
                <div><p className="text-xs text-gray-400">Compte</p>
                  <p className="mt-1 text-sm">{ROLE_LABELS[u.role]} · <span className={u.active ? "text-emerald-700" : "text-gray-500"}>{u.active ? "actif" : "désactivé"}</span></p>
                  {admin && <p className="text-xs text-gray-400">{u.sessions ?? 0} appareil(s) connecté(s)</p>}</div>
                <div><p className="text-xs text-gray-400">Inscrit le</p><p className="mt-1 text-sm">{day(u.created_at)}</p></div>
                <div><p className="text-xs text-gray-400">Dernière connexion</p><p className="mt-1 text-sm">{u.last_login_at ? when(u.last_login_at) : "Jamais"}</p></div>
              </div>
              {admin && !self && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                  <button type="button" className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`} onClick={() => {
                    const password = window.prompt(`Nouveau mot de passe pour ${u.email} (8 caractères minimum) :`);
                    if (password === null) return;
                    if (password.length < 8) return setMessage({ ok: false, text: "Mot de passe trop court (8 caractères minimum)." });
                    void run(() => patchJSON(`/api/users/${u.id}`, { password }), "Mot de passe réinitialisé : transmettez-le en privé.");
                  }}><KeyRound size={15} /> Réinitialiser le mot de passe</button>
                  <button type="button" className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`} disabled={!u.sessions}
                    onClick={() => run(() => postJSON(`/api/users/${u.id}/logout`, {}), "Déconnecté de tous ses appareils.")}><LogOut size={15} /> Déconnecter partout</button>
                  <button type="button" className={`${btn} bg-amber-50 text-amber-800 hover:bg-amber-100`}
                    onClick={() => run(() => patchJSON(`/api/users/${u.id}`, { active: !u.active }), u.active ? "Compte désactivé." : "Compte réactivé.")}>
                    {u.active ? <><UserX size={15} /> Désactiver</> : <><UserCheck size={15} /> Réactiver</>}</button>
                  <button type="button" className={`${btn} bg-rose-50 text-rose-700 hover:bg-rose-100`} onClick={() => {
                    const extra = data.projects.length ? `\nSes ${data.projects.length} dossier(s) seront aussi supprimés.` : "";
                    if (!window.confirm(`Supprimer définitivement le compte de ${u.name} ?${extra}\n\nCette action est irréversible.`)) return;
                    void run(() => deleteJSON(`/api/users/${u.id}`), "Compte supprimé.", false).then(() => { onChanged?.(); onClose(); });
                  }}><Trash2 size={15} /> Supprimer le compte</button>
                </div>
              )}
            </section>

            {u.role === "client" && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-sm text-gray-400">Simulations</p><p className="mt-2 text-2xl font-semibold">{data.totals.simulations}</p></div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-sm text-gray-400">Meilleure économie</p><p className="mt-2 text-2xl font-semibold text-emerald-600">{fmt(data.totals.yearly_saving_best, 0)} MAD/an</p></div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-sm text-gray-400">Montant signé</p><p className="mt-2 text-2xl font-semibold">{fmt(data.totals.investment_signed, 0)} MAD</p></div>
                </div>
                <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h4 className="mb-3 font-semibold">Simulations et dossiers</h4>
                  {data.projects.length === 0 ? <p className="text-sm text-gray-500">Ce client n'a encore enregistré aucune simulation.</p> : <ProjectsTable projects={data.projects} />}
                </section>
              </>
            )}

            {u.role === "technicien" && (
              <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <h4 className="mb-3 font-semibold">Interventions affectées</h4>
                {data.assigned_projects.length === 0 ? <p className="text-sm text-gray-500">Aucune intervention affectée.</p> : <ProjectsTable projects={data.assigned_projects} showClient />}
              </section>
            )}

            {admin && (
              <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <h4 className="mb-3 font-semibold">Activité du compte</h4>
                {data.activity.length === 0 ? <p className="text-sm text-gray-500">Aucune activité enregistrée.</p> : (
                  <ol className="space-y-2">
                    {data.activity.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                        <span className="w-32 shrink-0 text-xs text-gray-400">{when(e.created_at)}</span>
                        <span className="font-medium">{ACTION_LABELS[e.action] ?? e.action}</span>
                        <span className="text-gray-500">{e.details}{e.actor_name && e.actor_name !== u.name ? ` · par ${e.actor_name}` : ""}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
