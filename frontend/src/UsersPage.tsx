// Administration : comptes et profils.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Search, ShieldCheck, UserPlus } from "lucide-react";
import { getJSON, patchJSON, postJSON } from "./api";
import { useAuth } from "./auth";
import { day } from "./projects";
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

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const load = useCallback(() => {
    getJSON<User[]>("/api/users").then(setUsers).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur."));
  }, []);
  useEffect(load, [load]);

  const update = async (u: User, changes: Partial<User> & { password?: string }) => {
    setError("");
    try {
      const updated = await patchJSON<User>(`/api/users/${u.id}`, changes);
      setUsers((list) => (list ?? []).map((x) => (x.id === u.id ? updated : x)));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur."); }
  };
  const resetPassword = (u: User) => {
    const password = window.prompt(`Nouveau mot de passe pour ${u.email} (8 caractères minimum) :`);
    if (password === null) return;
    if (password.length < 8) return setError("Mot de passe trop court (8 caractères minimum).");
    void update(u, { password });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    users?.forEach((u) => { c[u.role] = (c[u.role] ?? 0) + 1; });
    return c;
  }, [users]);
  const shown = (users ?? []).filter((u) => (roleFilter === "all" || u.role === roleFilter)
    && (!query.trim() || [u.name, u.email, u.company].some((v) => v.toLowerCase().includes(query.trim().toLowerCase()))));

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
          <div className="relative w-full max-w-xs">
            <Search size={15} className="absolute left-3 top-3 text-gray-400" />
            <input className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" placeholder="Rechercher…" aria-label="Rechercher un utilisateur"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {users === null && !error && <p className="text-sm text-gray-400">Chargement…</p>}
        {users && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-gray-400">
                <tr><th className="py-2 pr-3">Utilisateur</th><th className="pr-3">Profil</th><th className="pr-3">Statut</th><th className="pr-3">Dernière connexion</th><th className="pr-3">Créé le</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((u) => (
                  <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                    <td className="py-3 pr-3"><p className="font-medium">{u.name}{u.id === me?.id && <span className="ml-2 text-xs text-blue-600">(vous)</span>}</p><p className="text-xs text-gray-400">{u.email}{u.company && ` · ${u.company}`}</p></td>
                    <td className="py-3 pr-3">
                      <select aria-label={`Profil de ${u.name}`} className={smallInput} value={u.role} onChange={(e) => update(u, { role: e.target.value as User["role"] })}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${u.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{u.active ? "Actif" : "Désactivé"}</span>
                    </td>
                    <td className="py-3 pr-3 text-gray-500">{u.last_login_at ? day(u.last_login_at) : "Jamais"}</td>
                    <td className="py-3 pr-3 text-gray-500">{day(u.created_at)}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => resetPassword(u)} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-blue-600">Mot de passe</button>
                      {u.id !== me?.id && (
                        <button type="button" onClick={() => update(u, { active: !u.active })} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-rose-600">
                          {u.active ? "Désactiver" : "Réactiver"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-gray-400">Changer le profil, le mot de passe ou désactiver un compte déconnecte immédiatement l'utilisateur sur tous ses appareils.</p>
      </section>
    </div>
  );
}
