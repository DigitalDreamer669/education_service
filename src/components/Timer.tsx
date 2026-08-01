import { useEffect, useRef, useState } from 'react';
import './Timer.css';

interface Props {
  totalSeconds: number;
  onExpire: () => void;
}

function formatTime(s: number): string {
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, '0');
  return `${mm}:${ss}`;
}

export function Timer({ totalSeconds, onExpire }: Props) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, totalSeconds - elapsed);
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(interval);
        onExpire();
      }
    }, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSeconds]);

  const ratio = remaining / totalSeconds;
  const state = ratio <= 0.1 ? 'critical' : ratio <= 0.25 ? 'warn' : 'ok';

  return (
    <div className={`timer timer--${state}`}>
      <span className="timer__dot" />
      <span className="timer__value mono">{formatTime(remaining)}</span>
    </div>
  );
}
