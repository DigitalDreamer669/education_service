import { useState } from 'react';
import type { Question } from '../types';
import { HelpPanel } from './HelpPanel';
import './QuestionCard.css';

interface Props {
  question: Question;
  indexLabel?: string;
  /** revealed=true сразу показывает правильный ответ (поиск, разбор экзамена) без интерактивной проверки */
  revealed?: boolean;
  /** Ранее выбранные варианты — для разбора уже пройденного вопроса (используется вместе с revealed) */
  initialSelected?: string[];
  onAnswered?: (correct: boolean, selected: string[]) => void;
}

export function QuestionCard({
  question,
  indexLabel,
  revealed = false,
  initialSelected,
  onAnswered,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected ?? []));
  const [checked, setChecked] = useState(revealed);
  const [helpOpen, setHelpOpen] = useState(false);

  const isCorrectSet =
    selected.size === question.correctAnswers.length &&
    question.correctAnswers.every((a) => selected.has(a));

  function toggleOption(opt: string) {
    if (checked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (question.isMultiple) {
        if (next.has(opt)) next.delete(opt);
        else next.add(opt);
      } else {
        next.clear();
        next.add(opt);
      }
      return next;
    });
  }

  function handleCheck() {
    if (selected.size === 0) return;
    setChecked(true);
    onAnswered?.(isCorrectSet, Array.from(selected));
  }

  function optionState(opt: string): 'idle' | 'selected' | 'correct' | 'missed' | 'wrong' {
    const isCorrectOpt = question.correctAnswers.includes(opt);
    if (!checked) return selected.has(opt) ? 'selected' : 'idle';
    if (isCorrectOpt) return 'correct';
    if (selected.has(opt)) return 'wrong';
    return 'idle';
  }

  return (
    <div className="qcard">
      <div className="qcard__head">
        {indexLabel && <span className="qcard__index mono">{indexLabel}</span>}
        {question.isMultiple && <span className="qcard__badge">несколько ответов</span>}
      </div>

      <p className="qcard__text">{question.text}</p>

      <div className="qcard__options" role={question.isMultiple ? 'group' : 'radiogroup'}>
        {question.options.map((opt) => {
          const state = optionState(opt);
          return (
            <button
              key={opt}
              type="button"
              className={`qopt qopt--${state} ${question.isMultiple ? 'qopt--checkbox' : 'qopt--radio'}`}
              onClick={() => toggleOption(opt)}
              disabled={checked}
              aria-pressed={selected.has(opt)}
            >
              <span className="qopt__control" aria-hidden="true" />
              <span className="qopt__text">{opt}</span>
              {checked && state === 'correct' && <span className="qopt__mark">✓</span>}
              {checked && state === 'wrong' && <span className="qopt__mark">✕</span>}
            </button>
          );
        })}
      </div>

      <div className="qcard__actions">
        {!checked && (
          <button type="button" className="btn btn--primary" onClick={handleCheck} disabled={selected.size === 0}>
            Проверить
          </button>
        )}
        {checked && selected.size > 0 && (
          <span className={`qcard__result ${isCorrectSet ? 'qcard__result--ok' : 'qcard__result--fail'}`}>
            {isCorrectSet ? 'Верно' : 'Неверно'}
          </span>
        )}
        {checked && revealed && selected.size === 0 && (
          <span className="qcard__result qcard__result--skipped">Без ответа</span>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => setHelpOpen((v) => !v)}>
          {helpOpen ? 'Скрыть помощь' : 'Помощь'}
        </button>
      </div>

      {helpOpen && <HelpPanel explanation={question.explanation} stats={question.stats} />}
    </div>
  );
}
