/**
 * Общая защита для горячих клавиш на десктопе: игнорируем событие, если
 * зажат модификатор (Ctrl/Alt/Cmd — это уже клавиши браузера/ОС), если
 * клавиша зажата и автоповторяется, или если фокус сейчас в поле ввода
 * (чтобы не мешать обычному набору текста, например в поиске).
 */
export function shouldIgnoreShortcut(e: KeyboardEvent): boolean {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return true;

  const target = e.target as HTMLElement | null;
  if (!target) return false;

  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;

  return false;
}
