import type { SubjectConfig, SubjectSlug } from '../types';

export const SUBJECTS: SubjectConfig[] = [
  {
    slug: 'it_product_development',
    name: 'Разработка и развитие ИТ-продуктов',
    shortName: 'ИТ-продукты',
    topicsSourceFile: 'Разработка_и_развитие_ИТ-продуктов.txt',
    exam: { questionCount: 20, minutes: 45 },
  },
  {
    slug: 'business-informatics',
    name: 'Бизнес-информатика',
    shortName: 'Бизнес-информатика',
    topicsSourceFile: 'Бизнес_аналитика.txt',
    exam: { questionCount: 40, minutes: 60 },
  },
  {
    slug: 'technology_entrepreneurship_and_it_leadership',
    name: 'Технологическое предпринимательство и лидерство в сфере IT',
    shortName: 'Технопредпринимательство',
    topicsSourceFile: 'Технологическое_предпринимательство_и_лидерство_в_сфере_ІТ.txt',
    exam: { questionCount: 20, minutes: 60 },
  },
];

export function getSubject(slug: string | undefined): SubjectConfig | undefined {
  return SUBJECTS.find((s) => s.slug === slug);
}

export function isSubjectSlug(slug: string): slug is SubjectSlug {
  return SUBJECTS.some((s) => s.slug === slug);
}
