/**
 * ИИ-поиск (OpenRouter) — полностью отдельный от локального поиска по вопросам
 * и конспектам (см. Search.tsx / lib/parse.ts). Активируется только вручную,
 * отдельной кнопкой, и ничего не запускает автоматически при вводе текста.
 *
 * Используем сырой fetch к OpenAI-совместимому эндпоинту OpenRouter, а не npm-пакет
 * `openai`, чтобы не тащить лишнюю зависимость в клиентский бандл — нам нужен один
 * простой POST-запрос.
 *
 * ВАЖНО (безопасность): VITE_-переменные попадают в клиентский бандл в открытом виде,
 * то есть ключ OpenRouter будет виден любому в devtools/исходниках сайта — точно так
 * же, как сейчас виден Supabase anon key. Для Supabase это нормально (ключ для того и
 * создан, доступ ограничивается RLS-политиками). Для OpenRouter это НЕ то же самое:
 * ключ привязан к аккаунту/квоте, и любой желающий сможет скопировать его из бандла и
 * расходовать вашу бесплатную квоту (или, если на ключе когда-нибудь появится платный
 * баланс — тратить деньги). Так как модель бесплатная (:free), риск ограничен
 * "кто-то исчерпает мой дневной лимit", но не нулевой. Если это станет проблемой —
 * лучший фикс: вынести этот вызов в Supabase Edge Function и хранить ключ там как
 * секрет на сервере, а фронтенд будет дёргать вашу функцию без ключа вообще.
 */

export interface AiExplanation {
  /** Короткий прямой ответ на запрос (1-2 предложения) */
  summary: string;
  /** Развёрнутое определение термина/понятия */
  definition: string;
  /** Объяснение простыми словами / контекст применения */
  explanation: string;
  /** Пример из практики, если уместен (может быть пустым) */
  example: string | null;
  /** Связанные термины/темы, если модель их называет */
  related: string[];
}

export class AiSearchRateLimitError extends Error {
  readonly waitMs: number;

  constructor(waitMs: number) {
    super(`Подождите ещё ${Math.ceil(waitMs / 1000)} с перед следующим запросом к ИИ`);
    this.name = 'AiSearchRateLimitError';
    this.waitMs = waitMs;
  }
}

export class AiSearchConfigError extends Error {
  constructor() {
    super('Не задан VITE_OPENROUTER_API_KEY — ИИ-поиск недоступен');
    this.name = 'AiSearchConfigError';
  }
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Точное имя free-модели может со временем меняться в каталоге OpenRouter
// (бесплатные модели иногда исчезают/заменяются без предупреждения) —
// при необходимости замените здесь на актуальный id из openrouter.ai/models.
const MODEL = 'google/gemma-4-26b-a4b-it:free';

// Минимальный интервал между запросами к ИИ — простой троттлинг на клиенте,
// чтобы случайный "дабл-клик" или быстрый повтор запроса не долбил API.
// Не заменяет серверный rate limit, но покрывает основной случай.
const MIN_INTERVAL_MS = 2000;
let lastRequestAt = 0;

function msUntilNextAllowedRequest(): number {
  const elapsed = Date.now() - lastRequestAt;
  return Math.max(0, MIN_INTERVAL_MS - elapsed);
}

/** Убирает ```json ... ``` обёртку и прочий мусор вокруг JSON, если модель её добавила. */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return candidate.trim();
  return candidate.slice(start, end + 1);
}

function normalizeResult(parsed: unknown): AiExplanation {
  const p = (parsed ?? {}) as Record<string, unknown>;
  const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const related = Array.isArray(p.related)
    ? p.related.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  return {
    summary: asString(p.summary),
    definition: asString(p.definition),
    explanation: asString(p.explanation),
    example: asString(p.example) || null,
    related,
  };
}

const SYSTEM_PROMPT = `Ты — помощник по подготовке к экзамену. Пользователь ввёл в поиск термин или
вопрос, для которого не нашлось точного совпадения среди локальных вопросов/конспектов.
Дай краткое и точное объяснение на русском языке.

Отвечай СТРОГО в виде одного JSON-объекта без какого-либо текста до или после, без Markdown-обёртки,
со следующими полями:
{
  "summary": "1-2 предложения — прямой ответ по существу",
  "definition": "развёрнутое определение понятия",
  "explanation": "объяснение простыми словами / где и зачем применяется",
  "example": "короткий практический пример, если уместен, иначе пустая строка",
  "related": ["связанный термин 1", "связанный термин 2"]
}

Если запрос неоднозначен — выбери наиболее вероятную для учебного контекста трактовку и объясни именно её.`;

/**
 * Запрашивает у ИИ объяснение термина/вопроса. Бросает AiSearchRateLimitError,
 * если вызвано слишком рано после предыдущего запроса — вызывающий код должен
 * поймать эту ошибку и просто не давать нажать кнопку повторно (см. Search.tsx).
 */
export async function askAi(query: string): Promise<AiExplanation> {
  const wait = msUntilNextAllowedRequest();
  if (wait > 0) throw new AiSearchRateLimitError(wait);

  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
  if (!apiKey) throw new AiSearchConfigError();

  lastRequestAt = Date.now();

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
      reasoning: { enabled: true },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ошибка ИИ-поиска (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('ИИ вернул пустой ответ');

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    // Модель не выдержала формат JSON — не роняем фичу, показываем как есть в summary.
    return { summary: content.trim(), definition: '', explanation: '', example: null, related: [] };
  }

  return normalizeResult(parsed);
}

/** Сколько ещё миллисекунд ждать до следующего разрешённого запроса (0 — можно прямо сейчас). */
export function getAiSearchCooldownMs(): number {
  return msUntilNextAllowedRequest();
}
