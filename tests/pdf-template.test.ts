import { describe, it, expect } from 'vitest'
import pdfParse from 'pdf-parse'
import { renderCvPdf, sanitizeFilename } from '../src/lib/pdf-template'
import type { Profile } from '../src/lib/types'
import type { GeneratedCv } from '../src/lib/generation-schema'

const profile: Profile = {
  id: '1', user_id: '1', full_name: 'André Dias Moreira Prol', email: 'andreprol@andreprol.com.br',
  phone: '+55 (21) 97558-9767', location: 'Rio de Janeiro, Brazil', linkedin_url: 'linkedin.com/in/andre-dias-moreira-prol', github_url: 'github.com/andreprol',
}

const content: GeneratedCv = {
  sufficientMatch: true,
  matchWarning: null,
  headline: 'Technical Program Manager',
  summary: 'Summary text for this role.',
  selectedAchievements: [
    { company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Reduced Cost of Goods Sold by 5%, generating ~R$5MM/year in savings.' },
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
    const { text } = await pdfParse(buffer)
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
    const { numpages } = await pdfParse(buffer)
    expect(numpages).toBeGreaterThan(1)
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
