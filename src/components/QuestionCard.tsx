import { useEffect, useMemo, useState } from 'react';
import type { Question } from '../types';
import { HelpPanel } from './HelpPanel';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useSettings } from '../hooks/useSettings';
import { shuffle } from '../lib/parse';
import { shouldIgnoreShortcut } from '../lib/keyboard';
import './QuestionCard.css';

/** Цифровые клавиши 1–9 в порядке появления на клавиатуре (ряд цифр) */
const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface Props {
  question: Question;
  indexLabel?: string;
  /** revealed=true сразу показывает правильный ответ (поиск, разбор экзамена) без интерактивной проверки */
  revealed?: boolean;
  /** Ранее выбранные варианты — для разбора уже пройденного вопроса (используется вместе с revealed) */
  initialSelected?: string[];
  onAnswered?: (correct: boolean, selected: string[]) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  /**
   * Включает горячие клавиши для этой карточки: 1–9 — выбрать вариант,
   * Enter — проверить ответ, H — помощь, B — закладка. Включать только
   * для одной активной карточки на странице (экзамен, повторение), иначе
   * при списке из нескольких карточек (поиск, закладки) нажатие будет
   * прилетать во все сразу.
   */
  keyboardEnabled?: boolean;
}

export function QuestionCard({
  question,
  indexLabel,
  revealed = false,
  initialSelected,
  onAnswered,
  isBookmarked = false,
  onToggleBookmark,
  keyboardEnabled = false,
}: Props) {
  const { settings } = useSettings();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected ?? []));
  const [checked, setChecked] = useState(revealed);
  const [helpOpen, setHelpOpen] = useState(false);

  // Порядок вариантов: перемешивается один раз на вопрос, если включена настройка
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const displayOptions = useMemo(
    () => (settings.shuffleOptions ? shuffle(question.options) : question.options),
    [question.id, settings.shuffleOptions]
  );

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

  // Горячие клавиши: 1–9 — выбрать вариант, Enter — проверить, H — помощь, B — закладка.
  useEffect(() => {
    if (!keyboardEnabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (shouldIgnoreShortcut(e)) return;

      const digitIndex = DIGIT_KEYS.indexOf(e.key);
      if (digitIndex !== -1 && !checked && displayOptions[digitIndex]) {
        e.preventDefault();
        toggleOption(displayOptions[digitIndex]);
        return;
      }

      if (e.key === 'Enter' && !checked && selected.size > 0) {
        e.preventDefault();
        // Останавливаем всплытие к странице (там Enter отвечает за переход
        // к следующему вопросу) — иначе одно нажатие и проверит ответ, и
        // сразу перелистнёт вопрос дальше.
        e.stopImmediatePropagation();
        handleCheck();
        return;
      }

      // 'р'/'Р' — та же физическая клавиша, что и H, в русской раскладке
      if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // 'и'/'И' — та же физическая клавиша, что и B, в русской раскладке
      if ((e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И') && onToggleBookmark) {
        e.preventDefault();
        onToggleBookmark();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardEnabled, checked, selected, displayOptions, onToggleBookmark]);

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

      <div className="qcard__text">
        <MarkdownRenderer content={question.text} />
      </div>

      <div className="qcard__options" role={question.isMultiple ? 'group' : 'radiogroup'}>
        {displayOptions.map((opt, i) => {
          const state = optionState(opt);
          const showKey = keyboardEnabled && !checked && i < DIGIT_KEYS.length;
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
              {showKey && <span className="kbd qopt__kbd" aria-hidden="true">{DIGIT_KEYS[i]}</span>}
            </button>
          );
        })}
      </div>

      <div className="qcard__actions">
        {!checked && (
          <button type="button" className="btn btn--primary" onClick={handleCheck} disabled={selected.size === 0}>
            Проверить
            {keyboardEnabled && selected.size > 0 && (
              <span className="kbd" aria-hidden="true">Enter</span>
            )}
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
        {onToggleBookmark && (
          <span className="qbookmark-group">
            <button
              type="button"
              className={`qbookmark ${isBookmarked ? 'qbookmark--active' : ''}`}
              onClick={onToggleBookmark}
              aria-label={isBookmarked ? 'Убрать из закладок' : 'Добавить в закладки'}
              title={isBookmarked ? 'В закладках (B)' : 'Добавить в закладки (B)'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            {keyboardEnabled && <span className="kbd" aria-hidden="true">B</span>}
          </span>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => setHelpOpen((v) => !v)}>
          {helpOpen ? 'Скрыть помощь' : 'Помощь'}
          {keyboardEnabled && <span className="kbd" aria-hidden="true">H</span>}
        </button>
      </div>

      {helpOpen && <HelpPanel explanation={question.explanation} stats={question.stats} />}
    </div>
  );
}
