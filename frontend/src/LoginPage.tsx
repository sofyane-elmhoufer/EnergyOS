import { useState, type FormEvent } from "react";
import { ArrowRight, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "./auth";

const inputClass = "mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none focus:border-blue-500";
const labelClass = "block text-xs font-medium text-gray-500";

export default function LoginPage({ onDone, onGuest }: { onDone: () => void; onGuest?: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", confirm: "", name: "", phone: "", company: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register") {
      if (form.password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
      if (form.password !== form.confirm) return setError("Les deux mots de passe sont différents.");
    }
    setBusy(true);
    try {
      if (mode === "login") await login(form.email.trim(), form.password);
      else await register({ email: form.email.trim(), password: form.password, name: form.name.trim(), phone: form.phone.trim(), company: form.company.trim() });
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setBusy(false);
    }
  };

  const tab = (active: boolean) =>
    `flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${active ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-800"}`;

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-3xl border border-gray-100 bg-white p-7 shadow-sm">
        <div className="mb-6 flex rounded-2xl bg-gray-100 p-1" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "login"} className={tab(mode === "login")} onClick={() => { setMode("login"); setError(""); }}>Se connecter</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={tab(mode === "register")} onClick={() => { setMode("register"); setError(""); }}>Créer un compte client</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <label className={labelClass}>Nom complet
              <input className={inputClass} required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={(e) => update("name", e.target.value)} />
            </label>
          )}
          <label className={labelClass}>E-mail
            <input className={inputClass} type="email" required maxLength={120} autoComplete="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </label>
          <label className={labelClass}>Mot de passe
            <input className={inputClass} type="password" required maxLength={200} autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={form.password} onChange={(e) => update("password", e.target.value)} />
          </label>
          {mode === "register" && (
            <>
              <label className={labelClass}>Confirmer le mot de passe
                <input className={inputClass} type="password" required maxLength={200} autoComplete="new-password" value={form.confirm} onChange={(e) => update("confirm", e.target.value)} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Téléphone (facultatif)
                  <input className={inputClass} type="tel" maxLength={30} autoComplete="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </label>
                <label className={labelClass}>Société (facultatif)
                  <input className={inputClass} maxLength={80} autoComplete="organization" value={form.company} onChange={(e) => update("company", e.target.value)} />
                </label>
              </div>
            </>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
            {busy ? "Patientez…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>

        <p className="mt-5 text-xs text-gray-400">
          {mode === "login"
            ? "Les comptes commercial, technicien et administrateur sont créés par l'administrateur."
            : "Votre compte client vous permet d'enregistrer vos simulations, de retrouver vos devis et de suivre votre dossier."}
        </p>
      </div>
      {onGuest ? (
        <div className="mt-5 text-center">
          <button type="button" onClick={onGuest} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-blue-600">
            Continuer sans compte <ArrowRight size={15} />
          </button>
          <p className="mt-1 text-xs text-gray-400">Tableaux de bord et simulation accessibles en tant qu'invité.</p>
        </div>
      ) : (
        <p className="mt-4 text-center text-xs text-gray-400">
          Sans compte, vous pouvez consulter les tableaux de bord et faire une simulation en tant qu'invité.
        </p>
      )}
    </div>
  );
}
