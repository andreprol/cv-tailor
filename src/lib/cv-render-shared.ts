import type { GeneratedCv } from './generation-schema'
import type { Skill } from './types'

// Shared between docx-template.ts and pdf-template.ts so a future change to
// labels, grouping, date formatting or the education line only needs to
// happen once.
export const SECTION_LABELS = {
  pt: {
    summary: 'Resumo Profissional',
    experience: 'Experiência Profissional',
    earlierExperience: 'Experiências Anteriores',
    projects: 'Projetos Pessoais',
    education: 'Formação Acadêmica',
    skills: 'Competências',
    languages: 'Idiomas',
  },
  en: {
    summary: 'Professional Summary',
    experience: 'Work Experience',
    earlierExperience: 'Earlier Experience',
    projects: 'Personal Projects',
    education: 'Education',
    skills: 'Skills',
    languages: 'Languages',
  },
} as const

export type RenderLanguage = keyof typeof SECTION_LABELS

const STATUS_LABELS = {
  pt: { present: 'atual', inProgress: 'Em andamento' },
  en: { present: 'Present', inProgress: 'In progress' },
} as const

const MONTH_ABBREVIATIONS = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const

// Postgres `date` columns arrive as plain 'YYYY-MM-DD' strings. Parsed by
// regex and never by `new Date(...)`: that reads the string as UTC midnight,
// and formatting it back in a negative-offset timezone (America/Sao_Paulo is
// UTC-3) reports the previous day — which, for the day-01 dates this app
// stores, silently shifts the whole month backwards ("2014-10-01" would
// render as September 2014).
function parseIsoDate(value: string): { year: string; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const monthIndex = Number(match[2]) - 1
  if (monthIndex < 0 || monthIndex > 11) return null
  return { year: match[1], monthIndex }
}

export function formatMonthYear(value: string, language: RenderLanguage): string | null {
  const parsed = parseIsoDate(value)
  if (!parsed) return null
  const month = MONTH_ABBREVIATIONS[language][parsed.monthIndex]
  return language === 'pt' ? `${month}/${parsed.year}` : `${month} ${parsed.year}`
}

// Returns '' (rather than a partial range) whenever there is no usable start
// date — CVs generated before dates existed have none, and the templates skip
// the period line entirely instead of printing a stray dash.
export function formatPeriod(startDate: string | null, endDate: string | null, language: RenderLanguage): string {
  if (!startDate) return ''
  const start = formatMonthYear(startDate, language)
  if (!start) return ''
  const present = STATUS_LABELS[language].present
  if (!endDate) return `${start} — ${present}`
  const end = formatMonthYear(endDate, language)
  // An unparseable end date must never fall back to "present": that would
  // claim the person still holds a job they already left.
  return end ? `${start} — ${end}` : start
}

// Only the year is shown for a finished degree: the master data stores a full
// date, but the day/month there come from CV parsing and are usually a
// placeholder ('2025-01-01'), so printing them reads as fake precision.
export function formatEducationStatus(entry: GeneratedCv['education'][number], language: RenderLanguage): string | null {
  if (entry.inProgress) return STATUS_LABELS[language].inProgress
  if (!entry.completedOn) return null
  return parseIsoDate(entry.completedOn)?.year ?? entry.completedOn
}

function normalizeCategory(category: string): string {
  return category.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

// Spoken-language fluency lives in the skills table under its own category,
// stored twice like the rest of the bank: a Portuguese-labelled one and an
// English-labelled one.
//
// 'languages' is deliberately NOT in either list. In this data it is the
// category holding PROGRAMMING languages (Node.js, Go, TypeScript, C#), so
// matching it would print the tech stack under the CV's Languages heading.
const SPOKEN_LANGUAGE_CATEGORIES: Record<RenderLanguage, string[]> = {
  pt: ['idiomas', 'idioma', 'linguas'],
  en: ['spoken languages', 'spoken language'],
}

// Copied verbatim from the master data and never routed through the model.
// Fluency was previously only reachable as a `keywords` entry, and `keywords`
// is defined as "terms that appear in BOTH the job ad and the bank" — job ads
// rarely list "Portuguese — Native", so the line silently vanished from every
// generated CV.
export function selectSpokenLanguages(skills: Pick<Skill, 'name' | 'category'>[], language: RenderLanguage): string[] {
  const named = (categories: string[]) =>
    skills.filter((skill) => categories.includes(normalizeCategory(skill.category))).map((skill) => skill.name)

  const preferred = named(SPOKEN_LANGUAGE_CATEGORIES[language])
  if (preferred.length > 0) return preferred
  // Better a fluency line written in the other language than no fluency line
  // at all — a bank that only has one of the two variants is normal.
  return named(SPOKEN_LANGUAGE_CATEGORIES[language === 'pt' ? 'en' : 'pt'])
}

// Only a TRAILING legal suffix is stripped, and only as a whole word, so
// "Heliprol Táxi Aéreo Ltda" and "Heliprol Táxi Aéreo (Aviation)" normalize to
// the same employer while a company whose real name merely contains one of
// these words is left intact.
const TRAILING_LEGAL_SUFFIX = /\s+(ltda|ltd|sa|s a|me|epp|eireli|inc|llc|gmbh)$/

export function normalizeCompany(company: string): string {
  const withoutAccents = company.normalize('NFD').replace(/\p{M}/gu, '')
  // Stripping everything outside [a-z0-9] silently deletes whole alphabets.
  // "Лукойл Ltd" and "Газпром Ltd" would both reduce to "ltd" and be treated
  // as the same employer. When real letters would be lost, don't normalize at
  // all — an unmerged duplicate is a cosmetic flaw; a wrong merge erases a job.
  if (/\p{L}/u.test(withoutAccents.replace(/[a-zA-Z]/g, ''))) return company.trim().toLowerCase()

  let normalized = withoutAccents
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  let previous = ''
  while (previous !== normalized) {
    previous = normalized
    normalized = normalized.replace(TRAILING_LEGAL_SUFFIX, '').trim()
  }

  // A name made entirely of stripped tokens would normalize to '', which would
  // then match every other such company. Fall back to the raw name instead.
  return normalized || company.trim().toLowerCase()
}

export interface RoleEntry {
  company: string
  roleTitle: string
  startDate: string | null
  endDate: string | null
  bullet: string
}

export interface RoleGroup {
  company: string
  roleTitle: string
  startDate: string | null
  endDate: string | null
  bullets: string[]
}

// Same employer + same start date. This is deliberately an EQUIVALENCE
// relation (reflexive, symmetric, transitive), which makes grouping
// independent of the order entries arrive in.
//
// An earlier version matched on overlapping periods instead, which is not
// transitive: with roles A[2010-2012], B[2012-2014] (adjacent, two real
// career steps) and C[2011-2013], whether A and B end up merged depends
// purely on whether C is processed first — C bridges them, the group widens,
// and a career step silently disappears from the CV. Requiring equal start
// dates cannot bridge anything: the bilingual duplicates this exists to merge
// are the same row imported twice, so they share a start date, while a
// promotion at the same employer never does.
export function isSameRealJob(
  group: Pick<RoleGroup, 'company' | 'roleTitle' | 'startDate'>,
  entry: Pick<RoleEntry, 'company' | 'roleTitle' | 'startDate'>,
): boolean {
  if (normalizeCompany(group.company) !== normalizeCompany(entry.company)) return false
  // With no dates on either side there is nothing to compare — fall back to
  // the pre-dates behavior (exact role title) so a CV generated before this
  // feature existed still groups exactly as it used to.
  if (!group.startDate || !entry.startDate) return group.roleTitle === entry.roleTitle
  return group.startDate === entry.startDate
}

// The master data stores one row per bullet, and several bullets commonly
// belong to the same real job — sometimes under two different role titles,
// because the bank is bilingual and the same job was imported from both a
// Portuguese and an English CV. Grouping by company + overlapping period (not
// by exact title) collapses those into a single heading, so one job can never
// be rendered as two.
export function groupRoles(entries: RoleEntry[]): RoleGroup[] {
  const groups: RoleGroup[] = []

  for (const entry of entries) {
    const match = groups.find((group) => isSameRealJob(group, entry))
    if (!match) {
      groups.push({
        company: entry.company,
        roleTitle: entry.roleTitle,
        startDate: entry.startDate,
        endDate: entry.endDate,
        bullets: [entry.bullet],
      })
      continue
    }

    match.bullets.push(entry.bullet)
    // Members of a group share a start date by construction; only the end
    // date can differ (the same job imported twice with a slightly different
    // end). Keep the longest tenure, and let an open end win over any
    // concrete one. A dateless entry carries no period information at all.
    if (!entry.startDate) continue
    if (match.endDate === null) continue
    if (entry.endDate === null) match.endDate = null
    else if (entry.endDate > match.endDate) match.endDate = entry.endDate
  }

  return groups
}

// Plain string comparison, not localeCompare: these are ISO dates, where
// lexicographic order is chronological order, and ICU collation can ignore
// punctuation.
export function sortRoleGroupsByRecency(groups: RoleGroup[]): RoleGroup[] {
  return [...groups].sort((a, b) => {
    const left = a.startDate ?? ''
    const right = b.startDate ?? ''
    if (left === right) return 0
    return left < right ? 1 : -1
  })
}

// The CV shows the current job in full and every earlier one condensed to a
// single line.
//
// Only ONE group can be current: the most recent open-ended one. A second row
// left open by a data-entry omission (rather than because the person is still
// there) would otherwise be rendered in full detail with a period reading
// "sep/2004 — present" — a false factual claim on a document going to a
// recruiter. Every other open row falls back to earlier, where its real end
// date being absent is visible but harmless.
export function splitCurrentAndEarlier(groups: RoleGroup[]): { current: RoleGroup[]; earlier: RoleGroup[] } {
  const open = sortRoleGroupsByRecency(groups.filter((group) => group.startDate !== null && group.endDate === null))
  const [mostRecent] = open.length > 0 ? open : sortRoleGroupsByRecency(groups)
  if (!mostRecent) return { current: [], earlier: [] }
  return { current: [mostRecent], earlier: groups.filter((group) => group !== mostRecent) }
}
