import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts bundled locally: Urbanist (Synapse design system) + JetBrains Mono for codes.
import '@fontsource/urbanist/400.css'
import '@fontsource/urbanist/500.css'
import '@fontsource/urbanist/600.css'
import '@fontsource/urbanist/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/synapse.css'
import './styles/hub-cards.css'
import './styles/service-card.css'
import './styles/doctor-card-styles.css'
import './styles/doctor-profile.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
