import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useOnlineStatus } from '../lib/network';
import { getPendingCount, subscribeQueue, flushQueue } from '../lib/syncQueue';
import './OfflineStatus.css';

/**
 * Показывает состояние офлайн/онлайн только когда это реально важно — либо нет
 * сети, либо есть несинхронизированные изменения. Если всё в порядке (онлайн, очередь
 * пуста), бейдж не рендерится вовсе — пользователь "не замечает" переход online/offline,
 * пока всё работает штатно (требование 9 ТЗ).
 */
export function OfflineStatus() {
  const { user, isOfflineSession } = useAuth();
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = () => {
      getPendingCount(user.id).then((n) => {
        if (!cancelled) setPending(n);
      });
    };
    refresh();
    const unsub = subscribeQueue(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

  // isOfflineSession: авторизация восстановлена из локального кэша, а не живой
  // сессией (обычно потому что офлайн дольше времени жизни токена) — показываем
  // бейдж даже если navigator.onLine соврал, что мы online (см. AuthContext).
  if (online && pending === 0 && !isOfflineSession) return null;

  return (
    <div className={`offline-badge ${!online ? 'offline-badge--offline' : ''}`}>
      {!online ? (
        <span>Офлайн{pending > 0 ? ` · ${pending} ${pluralChanges(pending)} ждут синхронизации` : ''}</span>
      ) : pending > 0 ? (
        <button type="button" className="offline-badge__sync" onClick={() => void flushQueue()}>
          Синхронизация… ({pending})
        </button>
      ) : (
        <span>Восстанавливаем сессию…</span>
      )}
    </div>
  );
}

function pluralChanges(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'изменение';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'изменения';
  return 'изменений';
}
