import { useId } from "react";

// Logo EnergyOS : un éclair dans une prise / feuille, aux couleurs d'accent de l'application.
export function LogoMark({ size = 48, className = "" }: { size?: number; className?: string }) {
  const gradient = `energyos-bg-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Logo EnergyOS" className={className}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--color-blue-500)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-blue-700)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradient})`} />
      {/* Anneau : le bâtiment / le campus supervisé */}
      <circle cx="32" cy="32" r="19" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="3" />
      {/* Éclair : l'énergie maîtrisée */}
      <path d="M35.5 13 21 35h9.5L27 51l16-23h-9.8L35.5 13Z" fill="#ffffff" />
      {/* Point vert : les économies */}
      <circle cx="47" cy="17" r="5" fill="#34d399" stroke="#ffffff" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ size = 48, light = false }: { size?: number; light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={size} />
      <div>
        <p className={`font-bold tracking-tight ${light ? "text-white" : ""}`} style={{ fontSize: size * 0.42 }}>
          Energy<span className={light ? "text-emerald-300" : "text-blue-600"}>OS</span>
        </p>
        <p className={`text-xs ${light ? "text-white/70" : "text-gray-400"}`}>ENSA Fès · Smart Campus</p>
      </div>
    </div>
  );
}
