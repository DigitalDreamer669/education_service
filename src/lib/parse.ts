import type { AnswerStat, Question, QuestionOption, QuestionRow, Topic, TopicChunk, TopicRow } from '../types';

/**
 * Поля options и statistics в таблице questions хранятся как jsonb,
 * но внутри лежит НЕ массив/объект, а JSON-СТРОКА (двойное кодирование).
 * supabase-js вернёт такое поле как обычную JS-строку — её нужно распарсить ещё раз.
 * На случай если формат когда-нибудь исправят на нативный jsonb-массив — поддерживаем оба варианта.
 */
function parseDoubleEncoded<T>(value: string | T | null): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

const BROKEN_ANSWER_MARKER = '_(';

/**
 * Превращает сырую строку question_row.ai_answer в список правильных ответов.
 * В базе некоторые вопросы имеют несколько правильных ответов,
 * записанных через "; " одной строкой в ai_answer.
 */
function splitCorrectAnswers(aiAnswer: string | null): string[] {
  if (!aiAnswer) return [];
  return aiAnswer
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeQuestion(row: QuestionRow): Question | null {
  const options = parseDoubleEncoded<QuestionOption[]>(row.options);
  if (!options || options.length === 0) return null;
  if (!row.ai_answer || row.ai_answer.startsWith(BROKEN_ANSWER_MARKER)) return null;

  const optionTexts = options.map((o) => o.text).filter(Boolean);
  const correctAnswers = splitCorrectAnswers(row.ai_answer).filter((a) =>
    optionTexts.includes(a)
  );
  if (correctAnswers.length === 0) return null;

  const stats = parseDoubleEncoded<AnswerStat[]>(row.statistics) ?? [];

  return {
    id: row.id,
    subject: row.subject_name,
    number: row.question_number,
    text: row.question_text,
    options: optionTexts,
    correctAnswers,
    isMultiple: correctAnswers.length > 1,
    stats,
    explanation:
      row.explanation && !row.explanation.startsWith(BROKEN_ANSWER_MARKER) ? row.explanation : null,
    hasValidAnswer: true,
  };
}

export function normalizeQuestions(rows: QuestionRow[]): Question[] {
  return rows
    .map(normalizeQuestion)
    .filter((q): q is Question => q !== null);
}

/**
 * generated_content_main иногда содержит остаток "мыслительного" текста модели
 * перед финальным markdown (артефакт генерации), отделённый тегом </think>.
 * Отрезаем всё, что до него, чтобы не показывать пользователю мусор.
 */
function stripThinkingArtifacts(content: string | null): string | null {
  if (!content) return content;
  const marker = '</think>';
  const idx = content.indexOf(marker);
  if (idx === -1) return content.trim();
  return content.slice(idx + marker.length).trim();
}

export function normalizeTopic(row: TopicRow, subject: string): Topic {
  return {
    id: row.id,
    subject,
    number: row.topic_number ?? 0,
    title: row.topic_text?.trim() || `Тема ${row.topic_number ?? row.id}`,
    contentMain: stripThinkingArtifacts(row.generated_content_main),
    contentFull: stripThinkingArtifacts(row.generated_content_full),
  };
}

/** Тасование Фишера–Йетса — не мутирует исходный массив. */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Нормализация строки для нестрогого поиска: нижний регистр, без "ё"→"е", без лишних пробелов/пунктуации. */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Нестрогий поиск: разбивает запрос на слова и считает вопрос совпадением,
 * если КАЖДОЕ слово запроса встречается где-то в тексте вопроса или вариантах ответа
 * (подстрокой, без учёта регистра/порядка) — терпимо к опечаткам в раскладке не будет,
 * но не требует точного совпадения фразы целиком.
 */
/** Общая часть нестрогого поиска: разбивает запрос на слова (>1 символа). */
function searchWords(rawQuery: string): string[] {
  return normalizeForSearch(rawQuery)
    .split(' ')
    .filter((w) => w.length > 1);
}

/** true, если КАЖДОЕ слово запроса встречается где-то в haystack (уже нормализованном или сыром — нормализуем сами). */
function matchesWords(haystack: string, words: string[]): boolean {
  if (words.length === 0) return false;
  const normalizedHaystack = normalizeForSearch(haystack);
  return words.every((w) => normalizedHaystack.includes(w));
}

export function matchesSearch(q: Question, rawQuery: string): boolean {
  const words = searchWords(rawQuery);
  if (words.length === 0) return false;

  const haystack = [q.text, ...q.options, q.explanation ?? ''].join(' ');
  return matchesWords(haystack, words);
}

/**
 * Разбивает markdown-конспект темы на самостоятельные куски (абзацы/пункты списка),
 * запоминая ближайший предшествующий заголовок (#, ##, ###) как контекст.
 * Не пытается понять, что именно является "определением" — семантика конспектов
 * слишком разная (то список терминов, то нумерованные этапы, то таблица),
 * поэтому единица поиска — просто блок текста между пустыми строками.
 * Это достаточно, чтобы показать пользователю short-версию "нужного места",
 * а не весь конспект целиком.
 */
export function splitTopicIntoChunks(topic: Topic): TopicChunk[] {
  const content = topic.contentMain ?? topic.contentFull;
  if (!content) return [];

  const headingRe = /^#{1,6}\s+(.+?)\s*$/;
  const blocks = content.split(/\n\s*\n/);

  const chunks: TopicChunk[] = [];
  let currentHeading: string | null = null;
  let index = 0;

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;

    const headingMatch = block.match(headingRe);
    if (headingMatch && block.split('\n').length === 1) {
      // Строка целиком — заголовок markdown: запоминаем как контекст, самим куском не делаем.
      currentHeading = headingMatch[1].trim();
      continue;
    }

    // Отбрасываем совсем короткий "шум" (например, одиночный разделитель таблицы).
    if (block.replace(/[^\p{L}\p{N}]/gu, '').length < 8) continue;

    chunks.push({
      id: `${topic.id}:${index}`,
      topicId: topic.id,
      topicNumber: topic.number,
      topicTitle: topic.title,
      heading: currentHeading,
      text: block,
    });
    index += 1;
  }

  return chunks;
}

/** Строит единый индекс кусков конспектов по всем темам предмета (для поиска). */
export function buildDefinitionIndex(topics: Topic[]): TopicChunk[] {
  return topics.flatMap(splitTopicIntoChunks);
}

/**
 * Поиск по кускам конспектов той же логикой, что и поиск вопросов
 * (все слова запроса должны встретиться в тексте куска, порядок и регистр не важны).
 * В haystack включаем заголовок и заголовок темы, чтобы находить куски даже
 * если само слово упомянуто только в заголовке раздела.
 */
export function searchDefinitions(chunks: TopicChunk[], rawQuery: string): TopicChunk[] {
  const words = searchWords(rawQuery);
  if (words.length === 0) return [];

  return chunks.filter((c) =>
    matchesWords([c.heading ?? '', c.topicTitle, c.text].join(' '), words)
  );
}
