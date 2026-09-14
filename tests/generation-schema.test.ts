import { describe, it, expect } from 'vitest'
import { parseModelCvResponse } from '../src/lib/generation-schema'

const validJson = JSON.stringify({
  sufficientMatch: true,
  matchWarning: null,
  headline: 'Technical Program Manager',
  summary: 'Summary text',
  selectedAchievements: [{ achievementId: '1', bullet: 'Reduced COGS by 5%' }],
  keywords: ['SAP B1', 'Agile'],
  interviewQuestions: [{ question: 'Tell me about a time you led a cross-functional program', rationale: 'Matches the "cross-functional" requirement in the posting' }],
})

describe('parseModelCvResponse', () => {
  it('parses a valid JSON string into a ModelCvResponse', () => {
    const result = parseModelCvResponse(validJson)
    expect(result.headline).toBe('Technical Program Manager')
    expect(result.selectedAchievements).toHaveLength(1)
    expect(result.selectedAchievements[0].achievementId).toBe('1')
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
    const result = parseModelCvResponse(insufficient)
    expect(result.sufficientMatch).toBe(false)
    expect(result.matchWarning).toContain('Rust/Soroban')
  })

  it('throws when a required field is missing', () => {
    const missingKeywords = JSON.stringify({
      sufficientMatch: true, matchWarning: null,
      headline: 'X', summary: 'Y', selectedAchievements: [], interviewQuestions: [],
    })
    expect(() => parseModelCvResponse(missingKeywords)).toThrow()
  })

  it('throws when sufficientMatch is missing (schema requires an explicit match signal)', () => {
    const missingSufficientMatch = JSON.stringify({
      headline: 'X', summary: 'Y', selectedAchievements: [], keywords: [], interviewQuestions: [],
    })
    expect(() => parseModelCvResponse(missingSufficientMatch)).toThrow()
  })

  it('throws when selectedAchievements items use the old company/roleTitle/bullet shape instead of achievementId', () => {
    const oldShape = JSON.stringify({
      sufficientMatch: true, matchWarning: null,
      headline: 'X', summary: 'Y',
      selectedAchievements: [{ company: 'Acme', roleTitle: 'Role', bullet: 'Did something' }],
      keywords: [], interviewQuestions: [],
    })
    expect(() => parseModelCvResponse(oldShape)).toThrow()
  })

  it('throws when the input is not valid JSON', () => {
    expect(() => parseModelCvResponse('not json at all')).toThrow()
  })

  it('parses JSON wrapped in a ```json markdown fence, as claude-sonnet-5 sometimes returns it despite being told not to', () => {
    const fenced = '```json\n' + validJson + '\n```'
    const result = parseModelCvResponse(fenced)
    expect(result.headline).toBe('Technical Program Manager')
  })
})
