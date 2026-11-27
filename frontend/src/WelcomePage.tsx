// Écran d'accueil : logo EnergyOS d'un côté, connexion / création de compte de l'autre.
import { BarChart3, BellRing, FileText, Smartphone } from "lucide-react";
import LoginPage from "./LoginPage";
import { Logo, LogoMark } from "./Logo";

const FEATURES = [
  { icon: BarChart3, text: "Consommation avec et sans Shelly, salle par salle" },
  { icon: BellRing, text: "Alertes de gaspillage et prévisions de consommation" },
  { icon: FileText, text: "Simulation d'économies et devis PDF pour votre bâtiment" },
  { icon: Smartphone, text: "Disponible sur le web, Android et iOS" },
];

export default function WelcomePage({ onDone, onGuest }: { onDone: () => void; onGuest: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)] lg:grid lg:grid-cols-2">
      {/* Panneau de marque */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-white/5" />

        <Logo size={56} light />

        <div className="relative max-w-lg">
          <LogoMark size={120} className="mb-8 drop-shadow-xl" />
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Maîtrisez l'énergie de vos bâtiments.
          </h1>
          <p className="mt-4 text-lg text-white/80">
            EnergyOS automatise l'éclairage avec les modules Shelly : jusqu'à 31 % d'énergie économisée
            sur l'éclairage mesuré à l'ENSA Fès (données simulées).
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="rounded-lg bg-white/15 p-2"><Icon size={16} /></span>{text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">© ENSA Fès · Smart Campus Energy Management</p>
      </section>

      {/* Connexion */}
      <section className="flex min-h-screen flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto mb-8 flex w-full max-w-md flex-col items-center text-center lg:hidden">
          <LogoMark size={84} className="mb-4 drop-shadow-lg" />
          <p className="text-3xl font-bold tracking-tight">Energy<span className="text-blue-600">OS</span></p>
          <p className="mt-2 text-sm text-gray-500">Maîtrisez l'énergie de vos bâtiments avec les modules Shelly.</p>
        </div>
        <div className="mx-auto mb-6 hidden w-full max-w-md lg:block">
          <h2 className="text-2xl font-semibold tracking-tight">Bienvenue</h2>
          <p className="mt-1 text-sm text-gray-500">Connectez-vous ou créez votre compte client pour continuer.</p>
        </div>
        <div className="w-full">
          <LoginPage onDone={onDone} onGuest={onGuest} />
        </div>
      </section>
    </div>
  );
}
