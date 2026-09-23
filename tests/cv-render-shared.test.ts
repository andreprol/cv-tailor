import { describe, it, expect } from 'vitest'
import {
  formatEducationStatus,
  formatMonthYear,
  formatPeriod,
  groupRoles,
  normalizeCompany,
  selectSpokenLanguages,
  splitCurrentAndEarlier,
  type RoleEntry,
} from '../src/lib/cv-render-shared'

function entry(partial: Partial<RoleEntry> & Pick<RoleEntry, 'company' | 'roleTitle'>): RoleEntry {
  return { startDate: null, endDate: null, bullet: 'b', ...partial }
}

describe('formatMonthYear', () => {
  it('formats a Postgres date per language', () => {
    expect(formatMonthYear('2014-10-01', 'pt')).toBe('out/2014')
    expect(formatMonthYear('2014-10-01', 'en')).toBe('Oct 2014')
  })

  it('does not shift the month backwards in a negative-offset timezone (the reason this is parsed by regex, not by new Date)', () => {
    // `new Date('2014-10-01')` is UTC midnight; rendered as local time in
    // America/Sao_Paulo (UTC-3) that is 2014-09-30, i.e. September.
    expect(formatMonthYear('2014-10-01', 'en')).toContain('Oct')
    expect(formatMonthYear('2014-01-01', 'en')).toContain('Jan')
  })

  it('returns null for a value that is not a date', () => {
    expect(formatMonthYear('', 'pt')).toBeNull()
    expect(formatMonthYear('not-a-date', 'pt')).toBeNull()
    expect(formatMonthYear('2014-13-01', 'pt')).toBeNull()
  })
})

describe('formatPeriod', () => {
  it('renders an open-ended period as "present" in the requested language', () => {
    expect(formatPeriod('2014-10-01', null, 'pt')).toBe('out/2014 — atual')
    expect(formatPeriod('2014-10-01', null, 'en')).toBe('Oct 2014 — Present')
  })

  it('renders a closed period', () => {
    expect(formatPeriod('2010-02-01', '2012-11-01', 'pt')).toBe('fev/2010 — nov/2012')
  })

  it('returns an empty string when there is no start date, so a CV generated before dates existed shows no period line instead of a stray dash', () => {
    expect(formatPeriod(null, null, 'pt')).toBe('')
    expect(formatPeriod(null, '2012-11-01', 'pt')).toBe('')
  })

  it('never falls back to "present" for an unparseable end date, which would claim the person still holds a job they left', () => {
    expect(formatPeriod('2010-02-01', 'garbage', 'pt')).toBe('fev/2010')
    expect(formatPeriod('2010-02-01', 'garbage', 'en')).not.toContain('Present')
  })
})

describe('formatEducationStatus', () => {
  it('shows only the year for a finished degree (the stored day/month are a parsing placeholder)', () => {
    expect(formatEducationStatus({ institution: 'i', degree: 'd', completedOn: '2025-01-01', inProgress: false }, 'pt')).toBe('2025')
  })

  it('localizes the in-progress label instead of always writing Portuguese', () => {
    const inProgress = { institution: 'i', degree: 'd', completedOn: null, inProgress: true }
    expect(formatEducationStatus(inProgress, 'pt')).toBe('Em andamento')
    expect(formatEducationStatus(inProgress, 'en')).toBe('In progress')
  })

  it('returns null when a finished degree has no date at all', () => {
    expect(formatEducationStatus({ institution: 'i', degree: 'd', completedOn: null, inProgress: false }, 'pt')).toBeNull()
  })
})

describe('selectSpokenLanguages', () => {
  const skills = [
    { name: 'Português nativo', category: 'Idiomas' },
    { name: 'Inglês fluente (C1)', category: 'Idiomas' },
    { name: 'English — Fluent (C1)', category: 'Spoken Languages' },
    { name: 'Portuguese — Native', category: 'Spoken Languages' },
    { name: 'TypeScript', category: 'Languages' },
    { name: 'Go', category: 'Languages' },
  ]

  it('picks the fluency entries written in the CV language', () => {
    expect(selectSpokenLanguages(skills, 'pt')).toEqual(['Português nativo', 'Inglês fluente (C1)'])
    expect(selectSpokenLanguages(skills, 'en')).toEqual(['English — Fluent (C1)', 'Portuguese — Native'])
  })

  it('never mistakes the programming-language category for spoken languages', () => {
    // "Languages" in this bank holds Node.js/Go/TypeScript. Matching it would
    // print the tech stack under the CV's Languages heading.
    expect(selectSpokenLanguages(skills, 'en')).not.toContain('TypeScript')
    expect(selectSpokenLanguages(skills, 'en')).not.toContain('Go')
  })

  it('falls back to the other variant rather than dropping fluency entirely', () => {
    const onlyPortuguese = skills.filter((s) => s.category !== 'Spoken Languages')
    expect(selectSpokenLanguages(onlyPortuguese, 'en')).toEqual(['Português nativo', 'Inglês fluente (C1)'])
  })

  it('returns empty when the bank has no spoken-language category at all', () => {
    expect(selectSpokenLanguages([{ name: 'Go', category: 'Languages' }], 'pt')).toEqual([])
  })
})

describe('normalizeCompany', () => {
  it('treats the same employer written two ways as one', () => {
    expect(normalizeCompany('Heliprol Táxi Aéreo (Aviation)')).toBe(normalizeCompany('Heliprol Táxi Aéreo Ltda'))
  })

  it('does not collapse genuinely different employers', () => {
    expect(normalizeCompany('Cruzeiro Táxi Aéreo')).not.toBe(normalizeCompany('Sênior Táxi Aéreo Executivo'))
  })

  it('only strips a legal suffix at the end, never a word inside the real name', () => {
    expect(normalizeCompany('Ltda Comercio')).toBe('ltda comercio')
  })

  it('falls back to the raw name rather than returning an empty key that would match everything', () => {
    expect(normalizeCompany('S.A.')).not.toBe('')
    expect(normalizeCompany('Ltda')).not.toBe(normalizeCompany('Inc'))
  })

  it('does not collapse two companies whose names are written in a non-Latin alphabet', () => {
    // Stripping everything outside [a-z0-9] would reduce both of these to
    // "ltd" and merge two unrelated employers.
    expect(normalizeCompany('Лукойл Ltd')).not.toBe(normalizeCompany('Газпром Ltd'))
  })
})

describe('groupRoles', () => {
  it('merges concurrent roles at the same employer into one entry (the same job stored in two languages)', () => {
    const groups = groupRoles([
      entry({ company: 'Delírio Tropical', roleTitle: 'Gerente de TI', startDate: '2014-10-01', endDate: null, bullet: 'one' }),
      entry({ company: 'Delírio Tropical', roleTitle: 'IT Manager', startDate: '2014-10-01', endDate: null, bullet: 'two' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].roleTitle).toBe('Gerente de TI')
    expect(groups[0].bullets).toEqual(['one', 'two'])
  })

  it('keeps adjacent roles separate — an end date equal to the next start date is a promotion, not the same job', () => {
    const groups = groupRoles([
      entry({ company: 'Delírio Tropical', roleTitle: 'IT Manager', startDate: '2014-10-01', endDate: null }),
      entry({ company: 'Delírio Tropical', roleTitle: 'Store Manager', startDate: '2012-12-01', endDate: '2014-10-01' }),
    ])

    expect(groups).toHaveLength(2)
  })

  it('keeps the longest tenure when two rows of the same job disagree on the end date', () => {
    const groups = groupRoles([
      entry({ company: 'Sênior Táxi Aéreo', roleTitle: 'Coordenador de Finanças', startDate: '2004-09-01', endDate: '2008-10-01' }),
      entry({ company: 'Sênior Táxi Aéreo', roleTitle: 'Finance Coordinator', startDate: '2004-09-01', endDate: '2009-10-01' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].startDate).toBe('2004-09-01')
    expect(groups[0].endDate).toBe('2009-10-01')
  })

  it('does not merge different jobs at the same employer just because their periods overlap — a role in the middle must never bridge two adjacent ones', () => {
    // The failure this guards: with overlap-based matching, C bridges A and B
    // (which are adjacent, i.e. two real career steps) into one entry, and
    // whether that happens depends only on the order the rows arrive in.
    const rows = [
      entry({ company: 'Acme', roleTitle: 'A', startDate: '2010-01-01', endDate: '2012-01-01' }),
      entry({ company: 'Acme', roleTitle: 'B', startDate: '2012-01-01', endDate: '2014-01-01' }),
      entry({ company: 'Acme', roleTitle: 'C', startDate: '2011-06-01', endDate: '2013-06-01' }),
    ]

    expect(groupRoles(rows)).toHaveLength(3)
  })

  it('produces the same grouping whatever order the rows arrive in', () => {
    const rows = [
      entry({ company: 'Acme', roleTitle: 'A', startDate: '2010-01-01', endDate: '2012-01-01', bullet: 'a' }),
      entry({ company: 'Acme', roleTitle: 'B', startDate: '2012-01-01', endDate: '2014-01-01', bullet: 'b' }),
      entry({ company: 'Acme', roleTitle: 'C', startDate: '2011-06-01', endDate: '2013-06-01', bullet: 'c' }),
    ]

    const forward = groupRoles(rows).map((g) => g.startDate).sort()
    const reversed = groupRoles([...rows].reverse()).map((g) => g.startDate).sort()
    expect(forward).toEqual(reversed)
  })

  it('falls back to exact-title grouping for dateless entries, so a CV generated before dates existed groups exactly as it used to', () => {
    const groups = groupRoles([
      entry({ company: 'Acme', roleTitle: 'TPM', bullet: 'one' }),
      entry({ company: 'Acme', roleTitle: 'TPM', bullet: 'two' }),
      entry({ company: 'Acme', roleTitle: 'Director', bullet: 'three' }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].bullets).toEqual(['one', 'two'])
  })
})

describe('splitCurrentAndEarlier', () => {
  it('puts the open-ended job in current and everything else in earlier', () => {
    const groups = groupRoles([
      entry({ company: 'Now', roleTitle: 'A', startDate: '2014-10-01', endDate: null }),
      entry({ company: 'Before', roleTitle: 'B', startDate: '2010-02-01', endDate: '2012-11-01' }),
    ])

    const { current, earlier } = splitCurrentAndEarlier(groups)
    expect(current.map((g) => g.company)).toEqual(['Now'])
    expect(earlier.map((g) => g.company)).toEqual(['Before'])
  })

  it('treats only the most recent open-ended job as current — a second row left open by a data-entry omission must not be rendered as a present-day job', () => {
    const groups = groupRoles([
      entry({ company: 'Now', roleTitle: 'A', startDate: '2014-10-01', endDate: null }),
      entry({ company: 'Long ago', roleTitle: 'B', startDate: '2004-09-01', endDate: null }),
    ])

    const { current, earlier } = splitCurrentAndEarlier(groups)
    expect(current.map((g) => g.company)).toEqual(['Now'])
    expect(earlier.map((g) => g.company)).toEqual(['Long ago'])
  })

  it('falls back to the most recent job when nothing is open, so the experience section is never empty', () => {
    const groups = groupRoles([
      entry({ company: 'Older', roleTitle: 'A', startDate: '2008-10-01', endDate: '2009-10-01' }),
      entry({ company: 'Newer', roleTitle: 'B', startDate: '2010-02-01', endDate: '2012-11-01' }),
    ])

    const { current, earlier } = splitCurrentAndEarlier(groups)
    expect(current.map((g) => g.company)).toEqual(['Newer'])
    expect(earlier.map((g) => g.company)).toEqual(['Older'])
  })
})
