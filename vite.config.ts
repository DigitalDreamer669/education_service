import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Относительный base — билд работает и на GitHub Pages (в подпапке /repo-name/),
  // и локально, без дополнительной настройки.
  base: './',
})
