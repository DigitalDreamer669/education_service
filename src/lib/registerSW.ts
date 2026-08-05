import { registerSW } from 'virtual:pwa-register';
import { flushQueue } from './syncQueue';

/**
 * registerType: 'autoUpdate' (см. vite.config.ts) — новый SW активируется сам, без
 * блокирующего confirm()'а поверх экрана. onOfflineReady/onNeedRefresh — не обязательны
 * для работы офлайна как такового (Workbox справляется сам), но полезны, чтобы не
 * оставлять пользователя с "невидимым" наполовину обновившимся кэшем.
 */
export function initServiceWorker(): void {
  if (import.meta.env.SSR) return;

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      // На случай, если событие 'online' произошло ДО того, как SW/страница успели
      // подписаться — пробуем слить очередь сразу после регистрации, если уже online.
      if (navigator.onLine) void flushQueue();
      // Периодически проверяем обновление SW, пока вкладка открыта (не влияет на офлайн-логику).
      if (registration) {
        setInterval(() => void registration.update(), 60 * 60 * 1000);
      }
    },
    onOfflineReady() {
      // eslint-disable-next-line no-console
      console.info('[pwa] офлайн-режим готов: приложение и данные закэшированы локально');
    },
    onNeedRefresh() {
      // registerType: 'autoUpdate' сам применит обновление на следующей загрузке —
      // здесь достаточно тихого лога, без модального окна поверх UI.
      // eslint-disable-next-line no-console
      console.info('[pwa] доступно обновление, будет применено при следующем запуске');
    },
  });

  // Экспортируем на window для ручной отладки в devtools при желании (не используется в UI).
  (window as unknown as { __updateSW?: typeof updateSW }).__updateSW = updateSW;
}
