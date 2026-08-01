-- Миграция: серверный прогресс пользователя
-- user_progress — каждый ответ в режиме «Повторение»
-- exam_attempts — итоги экзаменов

create table if not exists user_progress (
  id            bigint generated always as identity primary key,
  user_id       uuid    not null,
  subject       text    not null default '',
  question_id   int     not null,
  result        text    check (result in ('correct', 'incorrect')) not null,
  answered_at   timestamptz not null default now(),
  unique (user_id, subject, question_id)
);

create index if not exists idx_user_progress_user_subject_question on user_progress (user_id, subject, question_id);

alter table user_progress enable row level security;

create policy "users can view own progress"
  on user_progress for select
  using (auth.uid() = user_id);

create policy "users can insert own progress"
  on user_progress for insert
  with check (auth.uid() = user_id);

create policy "users can update own progress"
  on user_progress for update
  using (auth.uid() = user_id);

create table if not exists exam_attempts (
  id              bigint generated always as identity primary key,
  user_id         uuid    not null,
  subject         text    not null,
  score           int     not null check (score >= 0),
  total_questions int     not null check (total_questions > 0),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists idx_exam_attempts_user_subject on exam_attempts (user_id, subject, started_at desc);

alter table exam_attempts enable row level security;

create policy "users can view own attempts"
  on exam_attempts for select
  using (auth.uid() = user_id);

create policy "users can insert own attempts"
  on exam_attempts for insert
  with check (auth.uid() = user_id);
