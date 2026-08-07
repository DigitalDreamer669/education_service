import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Локальные шрифты (см. комментарий в index.css) — импортируются ДО index.css,
// чтобы их @font-face объявления были доступны раньше, но порядок здесь не
// критичен: font-display: swap (задан в самих @fontsource-файлах) не блокирует
// первую отрисовку в любом случае, оффлайн-независимость важнее порядка.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/fraunces/500.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './index.css'
import App from './App.tsx'
import { initServiceWorker } from './lib/registerSW.ts'

initServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
