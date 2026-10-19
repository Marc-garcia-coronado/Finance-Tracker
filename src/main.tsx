import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { applyTheme } from './lib/theme'

applyTheme() // sincroniza theme-color con el tema ya aplicado por index.html

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('No se encontró el elemento #root')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
