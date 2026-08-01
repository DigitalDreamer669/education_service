// Прогресс режима "Повторение" хранится в localStorage по предметам,
// чтобы при повторном заходе пользователь видел, что уже пройдено.

export type QuestionResult = 'correct' | 'incorrect';

interface SubjectProgress {
  [questionId: number]: QuestionResult;
}

const STORAGE_PREFIX = 'itmo-prep:progress:';

function key(subject: string): string {
  return `${STORAGE_PREFIX}${subject}`;
}

export function loadProgress(subject: string): SubjectProgress {
  try {
    const raw = localStorage.getItem(key(subject));
    if (!raw) return {};
    return JSON.parse(raw) as SubjectProgress;
  } catch {
    return {};
  }
}

export function saveResult(subject: string, questionId: number, result: QuestionResult): void {
  const progress = loadProgress(subject);
  progress[questionId] = result;
  try {
    localStorage.setItem(key(subject), JSON.stringify(progress));
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — молча игнорируем
  }
}

export function resetProgress(subject: string): void {
  try {
    localStorage.removeItem(key(subject));
  } catch {
    // ignore
  }
}
