import { describe, it, expect } from 'vitest'
import { parseGeneratedCv } from '../src/lib/generation-schema'

const validJson = JSON.stringify({
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

  it('throws when a required field is missing', () => {
    const missingKeywords = JSON.stringify({
      headline: 'X', summary: 'Y', selectedAchievements: [], interviewQuestions: [],
    })
    expect(() => parseGeneratedCv(missingKeywords)).toThrow()
  })

  it('throws when the input is not valid JSON', () => {
    expect(() => parseGeneratedCv('not json at all')).toThrow()
  })
})
