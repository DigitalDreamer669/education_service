import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'generateSW' — минимальные изменения: Workbox сам строит service worker и
      // прекэширует весь билд (app shell), нам не нужно писать свой SW с нуля.
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      // Разрешаем HashRouter отдавать index.html офлайн при прямом заходе на
      // произвольный маршрут (навигационный fallback).
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Подготовка к экзамену',
        short_name: 'Экзамен-прод',
        description: 'Подготовка к вступительному экзамену в магистратуру: вопросы, экзамен с таймером, поиск, конспекты — работает офлайн.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0d0d0f',
        theme_color: '#0d0d0f',
        lang: 'ru',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // База — весь собранный бандл (JS/CSS/HTML) в precache, чтобы приложение
        // (включая ленивые чанки страниц — Exam/Review/Search/Topics/...) открывалось
        // и переключало маршруты полностью офлайн после первого визита.
        // woff2 — шрифты KaTeX (формулы в вопросах/конспектах): без них Workbox не
        // прекэшировал ни один из ~59 файлов шрифтов, и после ухода в офлайн формулы
        // рендерились бы без глифов/с фолбэк-шрифтом. Современные Chrome/Safari всегда
        // выбирают woff2 первым из font-face src (см. katex.min.css) — woff/ttf это
        // фолбэк для очень старых браузеров вне текущей цели (см. ТЗ), поэтому не
        // тащим их в прекэш, чтобы не раздувать его вдвое.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        // HashRouter => один и тот же index.html обслуживает все маршруты (#/subject/exam
        // и т.п.), поэтому единого navigateFallback достаточно и не требует списка роутов.
        navigateFallback: 'index.html',
        // Данные Supabase (вопросы/конспекты/прогресс) уже дублируются в IndexedDB
        // на уровне приложения (см. src/lib) — это основной источник для офлайн-логики.
        // Рантайм-кэш ниже — вторая, более грубая линия защиты именно для GET-запросов
        // (например, если что-то не попало в IndexedDB) и для будущих изображений вопросов.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              url.hostname.endsWith('.supabase.co') && request.method === 'GET',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-get-cache',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            // Подстраховка сверх precache выше — на случай шрифтов, которые почему-то
            // не попали в него (например, если globPatterns когда-нибудь не будет
            // включать нужное расширение). Шрифты по хэшу в имени файла не меняются
            // никогда, поэтому CacheFirst без риска отдать устаревшее.
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
        // POST/PATCH/DELETE к Supabase (запись прогресса и т.п.) НЕ проксируем через
        // Workbox — этим осознанно занимается собственная очередь приложения
        // (src/lib/syncQueue.ts), которая даёт нам atomic-per-item retry, дедупликацию
        // и идемпотентность на уровне бизнес-логики (upsert/insert-if-absent), чего
        // универсальный Background Sync плагин Workbox сам по себе не гарантирует.
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  // Относительный base — билд работает и на GitHub Pages (в подпапке /repo-name/),
  // и локально, без дополнительной настройки.
  base: './',
})
