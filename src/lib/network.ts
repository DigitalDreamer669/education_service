import { useEffect, useState } from 'react';

/**
 * navigator.onLine — грубый сигнал (в некоторых браузерах врёт про "captive portal"
 * и т.п.), но для нашей цели (решить: писать в очередь или пробовать сеть сразу)
 * этого достаточно — реальные сетевые ошибки всё равно ловятся в syncQueue и не
 * теряют данные, просто откладывают попытку. Более точная проверка (реальный ping
 * до Supabase) была бы избыточна для минимальных изменений.
 */
type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();

function notify(online: boolean) {
  for (const l of listeners) l(online);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => notify(true));
  window.addEventListener('offline', () => notify(false));
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function onNetworkChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline());
  useEffect(() => onNetworkChange(setOnline), []);
  return online;
}
