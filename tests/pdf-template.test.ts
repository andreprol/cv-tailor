import { describe, it, expect } from 'vitest'
import pdfParse from 'pdf-parse'
import { renderCvPdf, sanitizeFilename } from '../src/lib/pdf-template'
import type { Profile } from '../src/lib/types'
import type { GeneratedCv } from '../src/lib/generation-schema'

// pdf-parse's bundled pdfjs-dist v1.10.100 (see the alias comment in
// vitest.config.ts — it already fights Vite/Vitest's module loader) has a
// known race under Vitest: parsing a perfectly valid PDF occasionally throws
// "bad XRef entry" on the first invocation in a fresh worker, confirmed by
// reproducing it against a byte-identical buffer that always parses fine
// outside Vitest (plain node/tsx). Retrying the same buffer always succeeds.
async function parsePdfRetrying(buffer: Buffer) {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await pdfParse(buffer)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

const profile: Profile = {
  id: '1', user_id: '1', full_name: 'André Dias Moreira Prol', email: 'andreprol@andreprol.com.br',
  phone: '+55 (21) 97558-9767', location: 'Rio de Janeiro, Brazil', linkedin_url: 'linkedin.com/in/andre-dias-moreira-prol', github_url: 'github.com/andreprol',
}

const content: GeneratedCv = {
  sufficientMatch: true,
  matchWarning: null,
  language: 'en',
  headline: 'Technical Program Manager',
  summary: 'Summary text for this role.',
  coverLetter: 'Cover letter text for this role.',
  selectedAchievements: [
    { company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Reduced Cost of Goods Sold by 5%, generating ~R$5MM/year in savings.' },
  ],
  education: [
    { institution: 'UFRJ', degree: 'Engenharia', completedOn: '2010-12-01', inProgress: false },
  ],
  keywords: ['Agile', 'SAP Business One', 'Stakeholder Management'],
  interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
}

describe('renderCvPdf', () => {
  it('produces a valid, non-empty PDF buffer', async () => {
    const buffer = await renderCvPdf(profile, content)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })

  it('includes the full name, headline and achievement bullet as extractable text', async () => {
    const buffer = await renderCvPdf(profile, content)
    const { text } = await parsePdfRetrying(buffer)
    expect(text).toContain('André Dias Moreira Prol')
    expect(text).toContain('Technical Program Manager')
    expect(text).toContain('Reduced Cost of Goods Sold by 5')
  })

  it('does not throw when there are no selected achievements', async () => {
    const emptyContent: GeneratedCv = { ...content, selectedAchievements: [] }
    const buffer = await renderCvPdf(profile, emptyContent)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('paginates automatically without throwing when content overflows one page', async () => {
    const longAchievements = Array.from({ length: 20 }, (_, i) => ({
      company: `Company ${i}`,
      roleTitle: `Role ${i}`,
      bullet: 'A fairly long bullet point describing significant impact and measurable results achieved over an extended period of dedicated work.',
    }))
    const longContent: GeneratedCv = { ...content, selectedAchievements: longAchievements }
    const buffer = await renderCvPdf(profile, longContent)
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    const { numpages } = await parsePdfRetrying(buffer)
    expect(numpages).toBeGreaterThan(1)
  })

  it('uses Portuguese section headers (uppercase, per the redesign) when language is pt', async () => {
    const ptBuffer = await renderCvPdf(profile, { ...content, language: 'pt' })
    const { text: ptText } = await parsePdfRetrying(ptBuffer)
    expect(ptText).toContain('RESUMO PROFISSIONAL')
    expect(ptText).toContain('EXPERIÊNCIA PROFISSIONAL')
    expect(ptText).toContain('FORMAÇÃO ACADÊMICA')
    expect(ptText).toContain('COMPETÊNCIAS')
  })

  it('uses English section headers when language is en', async () => {
    const enBuffer = await renderCvPdf(profile, { ...content, language: 'en' })
    const { text: enText } = await parsePdfRetrying(enBuffer)
    expect(enText).toContain('PROFESSIONAL SUMMARY')
    expect(enText).toContain('WORK EXPERIENCE')
    expect(enText).toContain('EDUCATION')
  })

  it('groups multiple achievements from the same real job under one heading, instead of repeating the role title per bullet', async () => {
    const testContent: GeneratedCv = {
      ...content,
      selectedAchievements: [
        { company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Bullet one distinct text.' },
        { company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Bullet two distinct text.' },
      ],
    }
    const buffer = await renderCvPdf(profile, testContent)
    const { text } = await parsePdfRetrying(buffer)
    const headingOccurrences = text.split('IT Manager - Delirio Tropical').length - 1
    expect(headingOccurrences).toBe(1)
    expect(text).toContain('Bullet one distinct text.')
    expect(text).toContain('Bullet two distinct text.')
  })

  it('renders the education section', async () => {
    const testContent: GeneratedCv = {
      ...content,
      education: [{ institution: 'FGV', degree: 'MBA em Gestao', completedOn: null, inProgress: true }],
    }
    const buffer = await renderCvPdf(profile, testContent)
    const { text } = await parsePdfRetrying(buffer)
    expect(text).toContain('MBA em Gestao')
    expect(text).toContain('FGV')
    expect(text).toContain('Em andamento')
  })
})

describe('sanitizeFilename', () => {
  it('strips characters unsafe for a filename', () => {
    expect(sanitizeFilename('Acme/Global: Tech?')).toBe('AcmeGlobal Tech')
  })

  it('falls back to a default name when the result would be empty', () => {
    expect(sanitizeFilename('???')).toBe('curriculo')
  })

  it('transliterates accented characters to their base ASCII letter', () => {
    expect(sanitizeFilename('André Global')).toBe('Andre Global')
  })
})
