# Закладки / Сложные вопросы

## Что делаем

1. **Таблица `bookmarks`** в Supabase — закладки per-user, per-question, per-subject
2. **Серверные функции** в `serverProgress.ts`:
   - `toggleBookmark(subject, questionId)` — upsert / delete
   - `loadBookmarks(subject)` — закладные вопроса по предмету
   - `loadAllBookmarks()` — все закладки пользователя (по всем предметам)
3. **UI-элемент**: иконка-закладка на каждом `QuestionCard` (клик = toggle). Состояние: пустая / заполненная.
4. **Страница `/bookmarks`** — список всех закладок с фильтрацией по предмету, кнопкой "Убрать из закладок".
5. **Карточка "Закладки"** в `SubjectHome` (рядом с Экзамен/Повторение/Поиск)
6. **Маршрут** в `App.tsx`: `/:subject/bookmarks`
7. **Сложные вопросы**: автоматически определяются из `user_progress` (`result = 'incorrect'`) — показываем счётчик на SubjectHome рядом с закладками

## Файлы для изменения/создания

| Действие | Файл |
|----------|------|
| Создать | `supabase/migrations/add_bookmarks.sql` |
| Изменить | `src/lib/serverProgress.ts` — добавить 3 функции |
| Изменить | `src/components/QuestionCard.tsx` — проп `isBookmarked`, `onToggleBookmark`, иконка |
| Изменить | `src/components/QuestionCard.css` — стили для `.qcard__bookmark` |
| Создать | `src/pages/BookmarksPage.tsx` |
| Создать | `src/pages/BookmarksPage.css` |
| Изменить | `src/pages/SubjectHome.tsx` — добавить карточку "Закладки" с счётчиком сложных |
| Изменить | `src/App.tsx` — добавить маршрут `/bookmarks` |

## Детали

### Таблица bookmarks
```sql
create table if not exists bookmarks (
  id          bigint generated always as identity primary key,
  user_id     uuid    not null,
  subject     text    not null default '',
  question_id int     not null,
  created_at  timestamptz not null default now(),
  unique (user_id, subject, question_id)
);

create index if not exists idx_bookmarks_user_subject on bookmarks (user_id, subject);

-- RLS policies: select/insert/delete using auth.uid() = user_id
```

### QuestionCard пропсы
- `isBookmarked?: boolean` — текущее состояние закладки
- `onToggleBookmark?: () => void` — коллбэк при клике на иконку

Иконка рендерится в `.qcard__actions` рядом с кнопкой "Помощь". SVG: bookmark shape. Цвет: серый (неактивна) / жёлтый-золотой (активна).

### BookmarksPage
- Layout с crumbs `[{ label: 'Закладки' }]`
- Select для фильтра по предмету (все / каждый предмет из config/subjects.ts)
- Список карточек вопросов — каждая с кнопкой "Убрать" и ссылкой на поиск по этому вопросу
- Если закладок нет — заглушка

### Сложные вопросы
- Считаем из `user_progress` WHERE result='incorrect'
- Показываем счётчик на SubjectHome: "Закладки (12) · Сложные (5)"
- Без отдельной страницы — пользователь переходит в закладки и фильтрует

## Порядок реализации

1. Миграция bookmarks
2. serverProgress.ts функции
3. QuestionCard + CSS (иконка)
4. BookmarksPage + CSS
5. SubjectHome (карточка + счётчик сложных)
6. App.tsx маршрут
7. Build check
