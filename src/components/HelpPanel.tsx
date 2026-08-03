import { MarkdownRenderer } from './MarkdownRenderer';
import { useSettings } from '../hooks/useSettings';
import type { AnswerStat } from '../types';
import './HelpPanel.css';

interface Props {
  explanation: string | null;
  stats: AnswerStat[];
}

export function HelpPanel({ explanation, stats }: Props) {
  const { settings } = useSettings();
  const total = stats.reduce((sum, s) => sum + (s.selected_by || 0), 0);

  const showExplanationSection = settings.showExplanations;
  const showStatsSection = settings.showAnswerStats && stats.length > 0;

  return (
    <div className="help-panel">
      {showExplanationSection && (
        explanation ? (
          <div className="help-panel__section">
            <h4>Пояснение</h4>
            <MarkdownRenderer content={explanation} />
          </div>
        ) : (
          <p className="help-panel__empty">Пояснение для этого вопроса отсутствует.</p>
        )
      )}

      {!showExplanationSection && !showStatsSection && (
        <p className="help-panel__empty">
          Пояснения и статистика ответов скрыты. Включите их в «Доп. параметры» сверху страницы.
        </p>
      )}

      {showStatsSection && (
        <div className="help-panel__section">
          <h4>Как отвечали другие</h4>
          <ul className="stat-list">
            {stats
              .slice()
              .sort((a, b) => (b.selected_by || 0) - (a.selected_by || 0))
              .map((s, i) => {
                const pct = total > 0 ? Math.round(((s.selected_by || 0) / total) * 100) : 0;
                return (
                  <li key={i} className="stat-list__row">
                    <div className="stat-list__label">
                      <span>{s.answer}</span>
                      <span className="mono">{s.selected_by}</span>
                    </div>
                    <div className="stat-list__bar">
                      <div className="stat-list__bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}
