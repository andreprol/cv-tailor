import { describe, it, expect } from 'vitest'
import { parseGeneratedCv } from '../src/lib/generation-schema'

const validJson = JSON.stringify({
  sufficientMatch: true,
  matchWarning: null,
  headline: 'Technical Program Manager',
  summary: 'Summary text',
  selectedAchievements: [{ company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Reduced COGS by 5%' }],
  keywords: ['SAP B1', 'Agile'],
  interviewQuestions: [{ question: 'Tell me about a time you led a cross-functional program', rationale: 'Matches the "cross-functional" requirement in the posting' }],
})

describe('parseGeneratedCv', () => {
  it('parses a valid JSON string into a GeneratedCv', () => {
    const result = parseGeneratedCv(validJson)
    expect(result.headline).toBe('Technical Program Manager')
    expect(result.selectedAchievements).toHaveLength(1)
  })

  it('parses sufficientMatch: false with a matchWarning', () => {
    const insufficient = JSON.stringify({
      sufficientMatch: false,
      matchWarning: 'Banco de dados nao tem experiencia real em Rust/Soroban.',
      headline: 'Soroban Smart Contract Developer',
      summary: 'Summary text',
      selectedAchievements: [],
      keywords: [],
      interviewQuestions: [],
    })
    const result = parseGeneratedCv(insufficient)
    expect(result.sufficientMatch).toBe(false)
    expect(result.matchWarning).toContain('Rust/Soroban')
  })

  it('throws when a required field is missing', () => {
    const missingKeywords = JSON.stringify({
      sufficientMatch: true, matchWarning: null,
      headline: 'X', summary: 'Y', selectedAchievements: [], interviewQuestions: [],
    })
    expect(() => parseGeneratedCv(missingKeywords)).toThrow()
  })

  it('throws when sufficientMatch is missing (schema requires an explicit match signal)', () => {
    const missingSufficientMatch = JSON.stringify({
      headline: 'X', summary: 'Y', selectedAchievements: [], keywords: [], interviewQuestions: [],
    })
    expect(() => parseGeneratedCv(missingSufficientMatch)).toThrow()
  })

  it('throws when the input is not valid JSON', () => {
    expect(() => parseGeneratedCv('not json at all')).toThrow()
  })

  it('parses JSON wrapped in a ```json markdown fence, as claude-sonnet-5 sometimes returns it despite being told not to', () => {
    const fenced = '```json\n' + validJson + '\n```'
    const result = parseGeneratedCv(fenced)
    expect(result.headline).toBe('Technical Program Manager')
  })
})
