import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './i18n'
import { ThemeProvider } from './theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
    <ThemeProvider>
    <App />
    </ThemeProvider>
    </LanguageProvider>
  </StrictMode>,
)
