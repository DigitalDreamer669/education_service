create table if not exists bookmarks (
  id          bigint generated always as identity primary key,
  user_id     uuid    not null,
  subject     text    not null default '',
  question_id int     not null,
  created_at  timestamptz not null default now(),
  unique (user_id, subject, question_id)
);

create index if not exists idx_bookmarks_user_subject on bookmarks (user_id, subject);

insert into auth.policies (table_name, policy_name, definition)
values (
  'bookmarks',
  'Allow users to view own bookmarks',
  'auth.uid() = user_id'
) on conflict (table_name, policy_name) do update
set definition = 'auth.uid() = user_id';

insert into auth.policies (table_name, policy_name, definition)
values (
  'bookmarks',
  'Allow users to insert own bookmarks',
  'auth.uid() = user_id'
) on conflict (table_name, policy_name) do update
set definition = 'auth.uid() = user_id';

insert into auth.policies (table_name, policy_name, definition)
values (
  'bookmarks',
  'Allow users to delete own bookmarks',
  'auth.uid() = user_id'
) on conflict (table_name, policy_name) do update
set definition = 'auth.uid() = user_id';
