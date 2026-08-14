// ---- Сырые типы строк из Supabase ----

export interface QuestionOption {
  text: string;
}

export interface AnswerStat {
  answer: string;
  selected_by: number;
  correctness?: string;
}

export interface QuestionRow {
  id: number;
  subject_name: string;
  question_number: number;
  image_name: string | null;
  question_text: string;
  options: string | QuestionOption[] | null; // в БД хранится как JSON-строка внутри jsonb
  ai_answer: string | null;
  statistics: string | AnswerStat[] | null; // тоже двойное кодирование
  explanation: string | null;
  created_at: string;
}

export interface TopicRow {
  id: number;
  source_file: string | null;
  source_section: string | null;
  topic_number: number | null;
  topic_text: string | null;
  generated_content_full: string | null;
  generated_content_main: string | null;
  content_format: string | null;
  model_version: string | null;
}

// ---- Нормализованные типы для приложения ----

export interface Question {
  id: number;
  subject: string;
  number: number;
  text: string;
  options: string[];
  correctAnswers: string[]; // одна или несколько (если ai_answer через "; ")
  isMultiple: boolean;
  stats: AnswerStat[];
  explanation: string | null;
  hasValidAnswer: boolean;
}

export interface Topic {
  id: number;
  subject: string;
  number: number;
  title: string;
  contentMain: string | null;
  contentFull: string | null;
}

/**
 * Один "кусок" конспекта (абзац/пункт списка/определение) — минимальная единица
 * для поиска по конспектам, чтобы показывать не всю тему целиком, а только
 * подходящий фрагмент. См. splitTopicIntoChunks в lib/parse.ts.
 */
export interface TopicChunk {
  id: string; // `${topicId}:${индекс куска}` — стабильный ключ для React
  topicId: number;
  topicNumber: number;
  topicTitle: string;
  /** Ближайший предшествующий заголовок markdown (# / ##) внутри конспекта, если есть */
  heading: string | null;
  text: string;
}

export type SubjectSlug =
  | 'it_product_development'
  | 'business-informatics'
  | 'technology_entrepreneurship_and_it_leadership'
  | 'digital_transformation_technologies'
  | 'firm_and_market_economics'
  | 'project_program_management';

export type QuestionResult = 'correct' | 'incorrect';

export interface SubjectConfig {
  slug: SubjectSlug;
  name: string;
  shortName: string;
  topicsSourceFile: string;
  exam: {
    questionCount: number;
    minutes: number;
  };
}

export interface ExamAttempt {
  /** Локальный идентификатор ("server:123" когда подтверждена сервером, "local:..." пока в очереди на отправку) */
  id: string;
  subject: string;
  score: number;
  total_questions: number;
  started_at: string;
  finished_at: string | null;
}
