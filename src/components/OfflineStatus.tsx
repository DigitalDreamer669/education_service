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
  const { user } = useAuth();
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

  if (online && pending === 0) return null;

  return (
    <div className={`offline-badge ${!online ? 'offline-badge--offline' : ''}`}>
      {!online ? (
        <span>Офлайн{pending > 0 ? ` · ${pending} ${pluralChanges(pending)} ждут синхронизации` : ''}</span>
      ) : (
        <button type="button" className="offline-badge__sync" onClick={() => void flushQueue()}>
          Синхронизация… ({pending})
        </button>
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
