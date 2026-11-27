import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyAppearance } from './settings'
import { AuthProvider } from './auth'

// Appliqué avant le premier affichage : pas de « flash » clair si le thème sombre est choisi.
applyAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
