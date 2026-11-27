// Espace client : mes simulations / devis enregistrés, suivi du dossier, mon profil.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, FolderOpen, KeyRound, Trash2, UserRound } from "lucide-react";
import { deleteJSON, getJSON, patchJSON, postJSON } from "./api";
import { useAuth, type User } from "./auth";
import { day, downloadProjectDevis, type Project } from "./projects";
import { PROJECT_STATUS } from "./roles";
import { fmt, formatPayback } from "./simulation";

const cardClass = "rounded-3xl border border-gray-100 bg-white p-6 shadow-sm";
const inputClass = "mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none focus:border-blue-500";
const labelClass = "block text-xs font-medium text-gray-500";
export function StatusBadge({ status }: { status: string }) {
  const s = PROJECT_STATUS[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

function Projects({ onSimulate }: { onSimulate: () => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getJSON<Project[]>("/api/projects/mine").then(setProjects).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur."));
  }, []);
  useEffect(load, [load]);

  const remove = async (p: Project) => {
    if (!window.confirm(`Supprimer la simulation ${p.reference} ?`)) return;
    try { await deleteJSON(`/api/projects/mine/${p.id}`); load(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur."); }
  };
  const download = async (p: Project) => {
    try { await downloadProjectDevis(p); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur."); }
  };

  return (
    <section className={cardClass}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold"><FolderOpen size={18} className="text-blue-600" /> Mes simulations et devis</h3>
        <button type="button" onClick={onSimulate} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Nouvelle simulation</button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {projects === null && !error && <p className="text-sm text-gray-400">Chargement…</p>}
      {projects?.length === 0 && (
        <p className="text-sm text-gray-500">Aucune simulation enregistrée. Vos simulations sont enregistrées automatiquement quand vous êtes connecté.</p>
      )}
      {projects && projects.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-400">
              <tr><th className="py-2 pr-3">Devis</th><th className="pr-3">Bâtiment</th><th className="pr-3 text-right">Facture / mois</th>
                <th className="pr-3 text-right">Économie / an</th><th className="pr-3 text-right">Retour</th><th className="pr-3">Suivi</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-3"><p className="font-medium">{p.reference}</p><p className="text-xs text-gray-400">{day(p.created_at)}</p></td>
                  <td className="py-3 pr-3">{p.summary.building_label}<p className="text-xs text-gray-400">{p.summary.city_label}</p></td>
                  <td className="py-3 pr-3 text-right">{fmt(p.summary.monthly_bill)} → <span className="text-blue-600">{fmt(p.summary.monthly_bill_with_shelly)}</span></td>
                  <td className="py-3 pr-3 text-right font-medium text-emerald-600">{fmt(p.summary.yearly_saved_cost)} {p.summary.currency}</td>
                  <td className="py-3 pr-3 text-right">{formatPayback(p.summary.payback_months)}</td>
                  <td className="py-3 pr-3"><StatusBadge status={p.status} />{p.technician_name && <p className="mt-1 text-xs text-gray-400">Technicien : {p.technician_name}</p>}</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <button type="button" title="Télécharger le devis" aria-label="Télécharger le devis" onClick={() => download(p)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600"><Download size={16} /></button>
                    {p.status === "new" && (
                      <button type="button" title="Supprimer" aria-label="Supprimer la simulation" onClick={() => remove(p)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-rose-600"><Trash2 size={16} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ProfileForms() {
  const { user, setUser, setSession } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name ?? "", phone: user?.phone ?? "", company: user?.company ?? "" });
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setUser(await patchJSON<User>("/api/auth/me", { name: profile.name.trim(), phone: profile.phone.trim(), company: profile.company.trim() }));
      setMessage({ ok: true, text: "Profil enregistré." });
    } catch (e: unknown) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur." }); }
  };
  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (pwd.next.length < 8) return setMessage({ ok: false, text: "Le nouveau mot de passe doit contenir au moins 8 caractères." });
    if (pwd.next !== pwd.confirm) return setMessage({ ok: false, text: "Les deux mots de passe sont différents." });
    try {
      setSession(await postJSON("/api/auth/password", { current_password: pwd.current, new_password: pwd.next }));
      setPwd({ current: "", next: "", confirm: "" });
      setMessage({ ok: true, text: "Mot de passe modifié. Vos autres appareils ont été déconnectés." });
    } catch (e: unknown) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur." }); }
  };

  if (!user) return null;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={saveProfile} className={cardClass}>
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><UserRound size={18} className="text-blue-600" /> Mon profil</h3>
        <div className="space-y-4">
          <label className={labelClass}>E-mail<input className={`${inputClass} bg-gray-50`} value={user.email} disabled /></label>
          <label className={labelClass}>Nom complet<input className={inputClass} required minLength={2} maxLength={80} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Téléphone<input className={inputClass} type="tel" maxLength={30} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
            <label className={labelClass}>Société<input className={inputClass} maxLength={80} value={profile.company} onChange={(e) => setProfile({ ...profile, company: e.target.value })} /></label>
          </div>
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Enregistrer</button>
        </div>
      </form>
      <form onSubmit={savePassword} className={cardClass}>
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><KeyRound size={18} className="text-blue-600" /> Mot de passe</h3>
        <div className="space-y-4">
          <label className={labelClass}>Mot de passe actuel<input className={inputClass} type="password" required autoComplete="current-password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} /></label>
          <label className={labelClass}>Nouveau mot de passe<input className={inputClass} type="password" required autoComplete="new-password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} /></label>
          <label className={labelClass}>Confirmer<input className={inputClass} type="password" required autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} /></label>
          <button type="submit" className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700">Changer le mot de passe</button>
        </div>
      </form>
      {message && <p role={message.ok ? "status" : "alert"} className={`xl:col-span-2 text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
    </div>
  );
}

export default function MySpace({ onSimulate }: { onSimulate: () => void }) {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Bonjour {user?.name}. Retrouvez vos devis et suivez l'avancement de votre projet : notre équipe commerciale vous contacte après chaque nouvelle simulation.</p>
      <Projects onSimulate={onSimulate} />
      <ProfileForms />
    </div>
  );
}
