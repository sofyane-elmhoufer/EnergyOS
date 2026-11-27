// Administration : comptes et profils.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, Eye, KeyRound, LogOut, Pencil, Search, ShieldCheck, Trash2, UserCheck, UserPlus, UserX, X } from "lucide-react";
import { deleteJSON, getJSON, patchJSON, postJSON } from "./api";
import { useAuth } from "./auth";
import { day } from "./projects";
import UserDetail from "./UserDetail";
import { ROLE_LABELS, type User } from "./roles";

const ROLES = ["client", "commercial", "technicien", "admin"] as const;
const ROLE_HELP: Record<string, string> = {
  client: "simulations, devis, suivi de son dossier, agent IA",
  commercial: "tous les dossiers clients, contact, acceptation, affectation",
  technicien: "dossiers acceptés à installer, état du système",
  admin: "tout, dont la gestion des utilisateurs",
};
const cardClass = "rounded-3xl border border-gray-100 bg-white p-6 shadow-sm";
const inputClass = "mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none focus:border-blue-500";
const labelClass = "block text-xs font-medium text-gray-500";
const smallInput = "rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-blue-500";

function CreateUser({ onCreated }: { onCreated: () => void }) {
  const empty = { email: "", name: "", role: "commercial", password: "", phone: "", company: "" };
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password.length < 8) return setMessage({ ok: false, text: "Mot de passe : 8 caractères minimum." });
    try {
      await postJSON("/api/users", { ...form, email: form.email.trim(), name: form.name.trim() });
      setMessage({ ok: true, text: `Compte ${ROLE_LABELS[form.role as keyof typeof ROLE_LABELS]} créé pour ${form.email.trim()}. Transmettez-lui son mot de passe en privé.` });
      setForm(empty);
      onCreated();
    } catch (e: unknown) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur." }); }
  };
  return (
    <form onSubmit={submit} className={cardClass}>
      <h3 className="mb-4 flex items-center gap-2 font-semibold"><UserPlus size={18} className="text-blue-600" /> Créer un compte</h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className={labelClass}>Profil
          <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </label>
        <label className={labelClass}>Nom complet<input className={inputClass} required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className={labelClass}>E-mail<input className={inputClass} type="email" required maxLength={120} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className={labelClass}>Mot de passe provisoire<input className={inputClass} type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <label className={labelClass}>Téléphone<input className={inputClass} type="tel" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className={labelClass}>Société<input className={inputClass} maxLength={80} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
      </div>
      <p className="mt-3 text-xs text-gray-400">Accès du profil « {ROLE_LABELS[form.role as keyof typeof ROLE_LABELS]} » : {ROLE_HELP[form.role]}.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Créer le compte</button>
        {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
      </div>
    </form>
  );
}

type AdminUser = User & { sessions?: number };

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  // Neutralise les formules Excel (=, +, -, @) et échappe les guillemets.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportCsv(users: AdminUser[]) {
  const header = ["Nom", "E-mail", "Profil", "Téléphone", "Société", "Statut", "Créé le", "Dernière connexion"];
  const rows = users.map((u) => [u.name, u.email, ROLE_LABELS[u.role], u.phone, u.company, u.active ? "Actif" : "Désactivé",
    day(u.created_at), u.last_login_at ? day(u.last_login_at) : ""]);
  const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `utilisateurs-energyos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function EditUser({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: (u: AdminUser) => void }) {
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone, company: user.company, role: user.role, password: "" });
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password && form.password.length < 8) return setError("Mot de passe : 8 caractères minimum.");
    const changes: Record<string, string> = {};
    (["name", "email", "phone", "company", "role"] as const).forEach((k) => { if (form[k].trim() !== String(user[k])) changes[k] = form[k].trim(); });
    if (form.password) changes.password = form.password;
    if (Object.keys(changes).length === 0) return onClose();
    try { onSaved({ ...(await patchJSON<AdminUser>(`/api/users/${user.id}`, changes)), sessions: 0 }); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur."); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Modifier ${user.name}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Modifier le compte</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Nom complet<input className={inputClass} required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className={labelClass}>Profil
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as User["role"] })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>E-mail<input className={inputClass} type="email" required maxLength={120} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className={labelClass}>Téléphone<input className={inputClass} type="tel" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className={labelClass}>Société<input className={inputClass} maxLength={80} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Nouveau mot de passe (laisser vide pour ne pas changer)
            <input className={inputClass} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        </div>
        <p className="mt-3 text-xs text-gray-400">Changer l'e-mail, le profil ou le mot de passe déconnecte l'utilisateur sur tous ses appareils.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-200">Annuler</button>
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Enregistrer</button>
        </div>
      </form>
    </div>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  const load = useCallback(() => {
    getJSON<AdminUser[]>("/api/users").then(setUsers).catch((e: unknown) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur." }));
  }, []);
  useEffect(load, [load]);

  const replace = (updated: AdminUser) => setUsers((list) => (list ?? []).map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
  const run = async (action: () => Promise<void>, ok: string) => {
    setMessage(null);
    try { await action(); setMessage({ ok: true, text: ok }); }
    catch (e: unknown) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur." }); }
  };
  const toggleActive = (u: AdminUser) => run(async () => {
    replace({ ...(await patchJSON<AdminUser>(`/api/users/${u.id}`, { active: !u.active })), sessions: 0 });
  }, u.active ? `${u.name} est désactivé (il ne peut plus se connecter).` : `${u.name} est réactivé.`);
  const changeRole = (u: AdminUser, role: User["role"]) => run(async () => {
    replace({ ...(await patchJSON<AdminUser>(`/api/users/${u.id}`, { role })), sessions: 0 });
  }, `${u.name} est maintenant ${ROLE_LABELS[role]}.`);
  const resetPassword = (u: AdminUser) => {
    const password = window.prompt(`Nouveau mot de passe pour ${u.email} (8 caractères minimum) :`);
    if (password === null) return;
    if (password.length < 8) return setMessage({ ok: false, text: "Mot de passe trop court (8 caractères minimum)." });
    void run(async () => { replace({ ...(await patchJSON<AdminUser>(`/api/users/${u.id}`, { password })), sessions: 0 }); },
      `Mot de passe de ${u.name} réinitialisé : transmettez-le-lui en privé.`);
  };
  const forceLogout = (u: AdminUser) => run(async () => {
    const r = await postJSON<{ closed: number }>(`/api/users/${u.id}/logout`, {});
    replace({ ...u, sessions: 0 });
    if (r.closed === 0) throw new Error(`${u.name} n'avait aucune session ouverte.`);
  }, `${u.name} a été déconnecté de tous ses appareils.`);
  const remove = (u: AdminUser) => {
    const warning = u.role === "client" ? "\nSes simulations et dossiers seront aussi supprimés." : "";
    if (!window.confirm(`Supprimer définitivement le compte de ${u.name} (${u.email}) ?${warning}\n\nCette action est irréversible. Pour garder l'historique, préférez « Désactiver ».`)) return;
    void run(async () => {
      await deleteJSON(`/api/users/${u.id}`);
      setUsers((list) => (list ?? []).filter((x) => x.id !== u.id));
    }, `Compte de ${u.name} supprimé.`);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    users?.forEach((u) => { c[u.role] = (c[u.role] ?? 0) + 1; });
    return c;
  }, [users]);
  const q = query.trim().toLowerCase();
  const shown = (users ?? []).filter((u) => (roleFilter === "all" || u.role === roleFilter)
    && (statusFilter === "all" || (statusFilter === "active") === u.active)
    && (!q || [u.name, u.email, u.company, u.phone].some((v) => v.toLowerCase().includes(q))));
  const iconBtn = "rounded-lg p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-30";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {ROLES.map((r) => (
          <button key={r} type="button" onClick={() => setRoleFilter(roleFilter === r ? "all" : r)}
            className={`rounded-2xl border p-4 text-left transition ${roleFilter === r ? "border-blue-600 bg-blue-50" : "border-gray-100 bg-white hover:shadow-sm"}`}>
            <p className="text-xs text-gray-400">{ROLE_LABELS[r]}s</p>
            <p className="mt-1 text-2xl font-semibold">{counts[r] ?? 0}</p>
          </button>
        ))}
      </div>

      <CreateUser onCreated={load} />

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-blue-600" /> Utilisateurs</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Filtrer par statut" className={smallInput} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="all">Tous les statuts</option><option value="active">Actifs</option><option value="inactive">Désactivés</option>
            </select>
            <div className="relative w-56">
              <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
              <input className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" placeholder="Rechercher…" aria-label="Rechercher un utilisateur"
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <button type="button" onClick={() => exportCsv(shown)} disabled={shown.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-40"><Download size={15} /> Exporter (CSV)</button>
          </div>
        </div>
        {message && <p role={message.ok ? "status" : "alert"} className={`mb-3 text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
        {users === null && !message && <p className="text-sm text-gray-400">Chargement…</p>}
        {users && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-gray-400">
                <tr><th className="py-2 pr-3">Utilisateur</th><th className="pr-3">Profil</th><th className="pr-3">Statut</th><th className="pr-3">Dernière connexion</th><th className="pr-3">Créé le</th><th className="text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                      <td className="py-3 pr-3"><p className="font-medium">{u.name}{self && <span className="ml-2 text-xs text-blue-600">(vous)</span>}</p><p className="text-xs text-gray-400">{u.email}{u.company && ` · ${u.company}`}</p></td>
                      <td className="py-3 pr-3">
                        <select aria-label={`Profil de ${u.name}`} className={smallInput} value={u.role} disabled={self} onChange={(e) => changeRole(u, e.target.value as User["role"])}>
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${u.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{u.active ? "Actif" : "Désactivé"}</span>
                        {!!u.sessions && <p className="mt-1 text-xs text-gray-400">{u.sessions} appareil{u.sessions > 1 ? "s" : ""} connecté{u.sessions > 1 ? "s" : ""}</p>}
                      </td>
                      <td className="py-3 pr-3 text-gray-500">{u.last_login_at ? day(u.last_login_at) : "Jamais"}</td>
                      <td className="py-3 pr-3 text-gray-500">{day(u.created_at)}</td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button type="button" title="Voir la fiche" aria-label={`Voir la fiche de ${u.name}`} onClick={() => setViewing(u.id)} className={`${iconBtn} hover:text-blue-600`}><Eye size={15} /></button>
                        <button type="button" title="Modifier" aria-label={`Modifier ${u.name}`} onClick={() => setEditing(u)} className={`${iconBtn} hover:text-blue-600`}><Pencil size={15} /></button>
                        <button type="button" title="Réinitialiser le mot de passe" aria-label={`Réinitialiser le mot de passe de ${u.name}`} onClick={() => resetPassword(u)} className={`${iconBtn} hover:text-blue-600`}><KeyRound size={15} /></button>
                        <button type="button" title="Déconnecter de tous les appareils" aria-label={`Déconnecter ${u.name}`} onClick={() => forceLogout(u)} disabled={self} className={`${iconBtn} hover:text-amber-600`}><LogOut size={15} /></button>
                        <button type="button" title={u.active ? "Désactiver" : "Réactiver"} aria-label={`${u.active ? "Désactiver" : "Réactiver"} ${u.name}`} onClick={() => toggleActive(u)} disabled={self} className={`${iconBtn} hover:text-amber-600`}>{u.active ? <UserX size={15} /> : <UserCheck size={15} />}</button>
                        <button type="button" title="Supprimer définitivement" aria-label={`Supprimer ${u.name}`} onClick={() => remove(u)} disabled={self} className={`${iconBtn} hover:text-rose-600`}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className="py-4 text-sm text-gray-500">Aucun utilisateur ne correspond.</p>}
          </div>
        )}
        <p className="mt-4 text-xs text-gray-400">« Désactiver » bloque l'accès en gardant l'historique ; « Supprimer » efface définitivement le compte (et, pour un client, ses dossiers). Toutes ces actions sont tracées dans le journal d'activité.</p>
      </section>
      {viewing !== null && <UserDetail userId={viewing} onClose={() => setViewing(null)} onChanged={load} />}
      {editing && <EditUser user={editing} onClose={() => setEditing(null)} onSaved={(u) => { replace(u); setEditing(null); setMessage({ ok: true, text: `Compte de ${u.name} mis à jour.` }); }} />}
    </div>
  );
}
