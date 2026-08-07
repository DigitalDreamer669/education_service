import { createClient } from '@supabase/supabase-js';
import { isOnline } from './network';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Отсутствуют переменные окружения VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Скопируйте .env.example в .env и заполните значения.'
  );
}

/**
 * ПОЧЕМУ ЭТО ЗДЕСЬ (см. также lib/network.ts, AuthContext.tsx, authCache.ts):
 *
 * Реальная причина "зависания" при запуске без интернета на iOS Safari — не в
 * нашей логике офлайна (она и так везде проверяла isOnline() перед сетью), а
 * внутри самого supabase-js. При старте GoTrueClient._initialize() -> его
 * _recoverAndRefresh() смотрит на закэшированную в localStorage сессию, и если
 * access_token уже истёк (почти гарантировано после сколько-нибудь долгого
 * офлайна) — БЕЗУСЛОВНО делает fetch на /auth/v1/token для рефреша, без всякой
 * проверки navigator.onLine и без встроенного таймаута. Первое событие
 * onAuthStateChange ('INITIAL_SESSION'), на которое подписан AuthContext, не
 * приходит, пока этот fetch не завершится — а на iOS Safari fetch() к
 * недостижимому хосту при реальном отсутствии сети не отваливается быстро:
 * сетевой стек WebKit может держать попытку соединения аномально долго (заметно
 * дольше на всех наблюдаемых версиях, ещё хуже в standalone/PWA-режиме с экрана
 * "Домой"). Это и создаёт ощущение зависшего приложения перед переходом в
 * офлайн — тот же самый механизм отвечает и за getEffectiveUserId() (см.
 * authCache.ts), которая тоже ждёт supabase.auth.getSession().
 *
 * Правильное архитектурное решение — не гадать таймером "подождать и решить,
 * что офлайн", а не позволять supabase-js вообще ПЫТАТЬСЯ делать сетевой запрос,
 * когда его результат заранее известен. Для этого supabase-js поддерживает
 * подмену fetch на уровне клиента (global.fetch) — она используется ВСЕМИ его
 * подсистемами (auth, postgrest, storage), так что фикс единый и не требует
 * трогать код каждого места отдельно.
 */
const AUTH_FETCH_TIMEOUT_MS = 10_000;

/** AbortSignal.any() недоступен в старых Safari/браузерах (Baseline только с 2024) —
 *  собираем комбинированный сигнал вручную, чтобы не терять чужой signal (его
 *  иногда передаёт PostgREST-клиент, например через .abortSignal()). */
function combineSignals(a: AbortSignal, b?: AbortSignal | null): AbortSignal {
  if (!b) return a;
  if (a.aborted || b.aborted) {
    const controller = new AbortController();
    controller.abort((a.aborted ? a : b).reason);
    return controller.signal;
  }
  const controller = new AbortController();
  const onAbort = (source: AbortSignal) => controller.abort(source.reason);
  a.addEventListener('abort', () => onAbort(a), { once: true });
  b.addEventListener('abort', () => onAbort(b), { once: true });
  return controller.signal;
}

function offlineAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isOnline()) {
    // navigator.onLine === false — авторитетный сигнал браузера "нет ни одного
    // активного сетевого интерфейса" (авиарежим, выключенные wifi/сотовая связь) —
    // именно сценарий "запуск без интернета" из бага. Не пытаемся делать заведомо
    // обречённый запрос вообще: реджект приходит синхронно, а не после ожидания
    // сети. Это не таймаут и не догадка — просто не тратим время на попытку,
    // исход которой уже известен.
    return Promise.reject(new TypeError('Failed to fetch: offline (navigator.onLine is false)'));
  }

  // navigator.onLine может врать в обратную сторону (интерфейс есть, а реального
  // интернета нет — captive portal, битый wifi). Для этого остаточного случая
  // ограничиваем запрос по времени, чтобы одна зависшая попытка не блокировала UI
  // бесконечно — это не решает "офлайн или нет" вместо реальной сети, а просто не
  // даёт TCP-таймауту WebKit (который бывает исключительно долгим) стать нашим UX.
  // Дальше сетевая ошибка обрабатывается ровно так же, как и любая другая (см.
  // isNetworkError() в syncQueue.ts, фолбэк на кэш в authCache.ts/AuthContext.tsx).
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), AUTH_FETCH_TIMEOUT_MS);
  const signal = combineSignals(timeoutController.signal, init?.signal);

  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timeoutId));
}

export const supabase = createClient(url, anonKey, {
  global: { fetch: offlineAwareFetch },
});
