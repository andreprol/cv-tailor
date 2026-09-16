import type { GeneratedCv } from './generation-schema'

// Shared between docx-template.ts and pdf-template.ts so a future change to
// labels, grouping, or the education line format only needs to happen once.
export const SECTION_LABELS = {
  pt: { summary: 'Resumo Profissional', experience: 'Experiência Profissional', education: 'Formação Acadêmica', skills: 'Competências' },
  en: { summary: 'Professional Summary', experience: 'Work Experience', education: 'Education', skills: 'Skills' },
} as const

// The model returns one entry in selectedAchievements per bullet, and several
// bullets commonly belong to the same real job (see Achievement in types.ts —
// each bullet is its own row, all sharing company+role_title). Rendering one
// heading per achievement made the same job look like several duplicate
// entries with the title repeated over and over. Group consecutive
// achievements by company+roleTitle (order of first appearance preserved)
// into a single heading with multiple bullets underneath.
export function groupByRole(achievements: GeneratedCv['selectedAchievements']) {
  const groups: { roleTitle: string; company: string; bullets: string[] }[] = []
  const indexByKey = new Map<string, number>()

  for (const achievement of achievements) {
    const key = JSON.stringify([achievement.roleTitle, achievement.company])
    const existingIndex = indexByKey.get(key)
    if (existingIndex !== undefined) {
      groups[existingIndex].bullets.push(achievement.bullet)
      continue
    }
    indexByKey.set(key, groups.length)
    groups.push({ roleTitle: achievement.roleTitle, company: achievement.company, bullets: [achievement.bullet] })
  }

  return groups
}

export function educationLine(entry: GeneratedCv['education'][number]): string {
  const status = entry.inProgress ? 'Em andamento' : entry.completedOn
  return [entry.degree, entry.institution, status].filter(Boolean).join(' — ')
}
