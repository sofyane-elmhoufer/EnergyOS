import type { CapacitorConfig } from "@capacitor/cli";

// Application mobile Android / iOS : elle embarque le site compilé (dossier dist/)
// et appelle l'API FastAPI à l'adresse définie dans src/api.ts (voir MOBILE.md).
const config: CapacitorConfig = {
  appId: "ma.ensa.energyos",
  appName: "EnergyOS",
  webDir: "dist",
  server: {
    // Développement : l'API locale est en http (émulateur / simulateur).
    // En production, servez l'API en HTTPS et retirez ces deux lignes.
    androidScheme: "http",
    cleartext: true,
  },
};

export default config;
