import './ProgressGraph.css';

export interface ProgressItem {
  id: number;
  state: 'pending' | 'correct' | 'incorrect';
}

interface Props {
  items: ProgressItem[];
  currentId?: number;
  onSelect?: (id: number) => void;
}

export function ProgressGraph({ items, currentId, onSelect }: Props) {
  const done = items.filter((i) => i.state !== 'pending').length;
  const correct = items.filter((i) => i.state === 'correct').length;
  const incorrect = items.filter((i) => i.state === 'incorrect').length;

  return (
    <div className="progress-graph">
      <div className="progress-graph__summary">
        <div className="progress-graph__count">
          <span className="mono">{done}</span> / {items.length}
          <span className="progress-graph__count-label">пройдено</span>
        </div>
        <div className="progress-graph__legend">
          <span className="legend-item">
            <i className="legend-dot legend-dot--correct" />
            {correct}
          </span>
          <span className="legend-item">
            <i className="legend-dot legend-dot--incorrect" />
            {incorrect}
          </span>
          <span className="legend-item">
            <i className="legend-dot legend-dot--pending" />
            {items.length - done}
          </span>
        </div>
      </div>
      <div className="progress-graph__grid">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className={`pg-dot pg-dot--${item.state} ${item.id === currentId ? 'pg-dot--current' : ''}`}
            onClick={() => onSelect?.(item.id)}
            title={`Вопрос ${i + 1}`}
            disabled={!onSelect}
          />
        ))}
      </div>
    </div>
  );
}
