import { SUBJECTS } from '../config/subjects';
import { fetchAndCacheQuestions } from '../hooks/useQuestions';
import { fetchAndCacheTopics } from '../hooks/useTopics';
import { refreshSubjectFromServer, refreshExamHistoryFromServer } from './offlineStore';
import { isOnline } from './network';

/**
 * Требование ТЗ: "После того как пользователь... открыл необходимые материалы, он
 * должен иметь возможность полностью пользоваться сайтом без интернета".
 *
 * Датасет предметов маленький (questions ~577 строк, topics_data ~80 строк на все
 * 6 предметов суммарно, из которых конспекты пока покрывают только часть — см.
 * SUBJECTS), поэтому вместо того, чтобы кэшировать только то, что
 * пользователь физически открыл (что оставляло бы "дыры" — например, офлайн-поиск
 * не нашёл бы вопросы по предмету, который не открывали), мы один раз, в фоне,
 * сразу после входа, докачиваем ВСЁ: вопросы и конспекты всех предметов + прогресс/
 * закладки/историю экзаменов текущего пользователя. Это даёт по-настоящему "не
 * заметный" offline-first опыт (требование 9) ценой одного дополнительного фонового
 * запроса при логине. Если однажды датасет вырастет на порядки — этот файл единственное
 * место, которое нужно будет переделать на прогрессивную докачку по клику.
 */
let prefetchStarted = false;

export async function prefetchAllSubjects(userId: string): Promise<void> {
  if (!isOnline() || prefetchStarted) return;
  prefetchStarted = true;
  try {
    await Promise.all([
      ...SUBJECTS.flatMap((s) => [
        fetchAndCacheQuestions(s.slug).catch(() => {}),
        fetchAndCacheTopics(s.slug, s.topicsSourceFile).catch(() => {}),
        refreshSubjectFromServer(userId, s.slug).catch(() => {}),
      ]),
      refreshExamHistoryFromServer(userId).catch(() => {}),
    ]);
  } finally {
    // Разрешаем повторный прогон при следующей смене пользователя/перезаходе онлайн,
    // но не даём двум одновременным вызовам (например, из-за StrictMode double-invoke)
    // молотить сеть параллельно.
    prefetchStarted = false;
  }
}
