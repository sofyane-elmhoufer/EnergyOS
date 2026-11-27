
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backend = { target: "http://127.0.0.1:8000", changeOrigin: true };

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,

    // Seules les routes utilisées par l'interface sont transmises à FastAPI
    // (les routes d'administration des datasets restent inaccessibles depuis le navigateur).
    proxy: {
      "^/api/analytics/(kpis|daily|filters|alerts|forecast)(\\?.*)?$": backend,
      // Espace Client : simulateur d'économies
      "^/api/simulation/(options|estimate|send-devis)(\\?.*)?$": backend,
      // Agent IA
      "^/api/agent/(chat|chat-file|advice)$": backend,
      // Page Settings : état du système
      "^/api/status$": backend,
      // Comptes, profils et dossiers clients
      "^/api/auth/(login|register|logout|me|password|roles)$": backend,
      "^/api/users(/technicians|/\\d+)?$": backend,
      "^/api/projects(/mine(/\\d+)?|/\\d+)?$": backend,
    },
  },
});
