import { describe, it, expect, vi } from 'vitest'
import { buildGenerationPrompt, assertAchievementsAreReal, generateTailoredCv } from '../src/lib/claude-generation'
import type { MasterDataBank } from '../src/lib/types'

const masterData: MasterDataBank = {
  achievements: [
    { id: '1', user_id: '1', company: 'Delirio Tropical', role_title: 'IT Manager', start_date: '2014-10-01', end_date: null, bullet: 'Reduced Cost of Goods Sold by 5%.', metric: '5%', positioning: ['TPM'] },
  ],
  skills: [{ id: '1', user_id: '1', name: 'SAP Business One', category: 'ERP', positioning: ['TPM'] }],
  education: [],
  certifications: [],
}

describe('buildGenerationPrompt', () => {
  it('includes the job description and the real achievement bullet', () => {
    const prompt = buildGenerationPrompt(masterData, 'Vaga de Technical Program Manager remoto')
    expect(prompt).toContain('Vaga de Technical Program Manager remoto')
    expect(prompt).toContain('Reduced Cost of Goods Sold by 5%.')
  })

  it('instructs the model to never invent an achievement', () => {
    const prompt = buildGenerationPrompt(masterData, 'Vaga qualquer')
    expect(prompt.toLowerCase()).toContain('nunca invente')
  })

  it('instructs the model to signal a real vaga mismatch via sufficientMatch/matchWarning, never inside summary/headline', () => {
    const prompt = buildGenerationPrompt(masterData, 'Vaga qualquer')
    expect(prompt).toContain('sufficientMatch')
    expect(prompt).toContain('matchWarning')
    expect(prompt.toLowerCase()).toContain('nunca escreva ali um aviso')
  })
})

describe('assertAchievementsAreReal', () => {
  it('throws when a selected bullet is not in the master data', () => {
    const generated = { selectedAchievements: [{ company: 'X', roleTitle: 'Y', bullet: 'Invented achievement' }] } as any
    expect(() => assertAchievementsAreReal(masterData, generated)).toThrow(/alucina/)
  })

  it('does not throw when every selected bullet is real', () => {
    const generated = { selectedAchievements: [{ company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Reduced Cost of Goods Sold by 5%.' }] } as any
    expect(() => assertAchievementsAreReal(masterData, generated)).not.toThrow()
  })
})

describe('generateTailoredCv', () => {
  it('retries once when the first response fails validation, then returns the valid result', async () => {
    const goodJson = JSON.stringify({
      sufficientMatch: true,
      matchWarning: null,
      headline: 'Technical Program Manager',
      summary: 'Summary',
      selectedAchievements: [{ company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Reduced Cost of Goods Sold by 5%.' }],
      keywords: ['SAP Business One'],
      interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
    })
    const create = vi.fn()
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: goodJson }] })
    const fakeClient = { messages: { create } } as any

    const result = await generateTailoredCv(fakeClient, masterData, 'Vaga TPM')

    expect(create).toHaveBeenCalledTimes(2)
    expect(result.headline).toBe('Technical Program Manager')
  })

  it('propagates the error when both attempts fail', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] })
    const fakeClient = { messages: { create } } as any

    await expect(generateTailoredCv(fakeClient, masterData, 'Vaga TPM')).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('finds the text block by type instead of assuming index 0, and fails loudly when there is none (real bug: extended thinking puts a "thinking" block before the text block, and truncation can drop the text block entirely)', async () => {
    const goodJson = JSON.stringify({
      sufficientMatch: true,
      matchWarning: null,
      headline: 'Technical Program Manager',
      summary: 'Summary',
      selectedAchievements: [{ company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Reduced Cost of Goods Sold by 5%.' }],
      keywords: ['SAP Business One'],
      interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
    })
    const thinkingThenText = { content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: goodJson }], stop_reason: 'end_turn' }
    const create = vi.fn().mockResolvedValueOnce(thinkingThenText)
    const fakeClient = { messages: { create } } as any

    const result = await generateTailoredCv(fakeClient, masterData, 'Vaga TPM')

    expect(create).toHaveBeenCalledTimes(1)
    expect(result.headline).toBe('Technical Program Manager')
  })

  it('throws a clear error (not a cryptic JSON.parse failure) when no attempt ever produces a text block', async () => {
    const thinkingOnly = { content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'max_tokens' }
    const create = vi.fn().mockResolvedValue(thinkingOnly)
    const fakeClient = { messages: { create } } as any

    await expect(generateTailoredCv(fakeClient, masterData, 'Vaga TPM')).rejects.toThrow(/nao retornou nenhum bloco de texto/)
    expect(create).toHaveBeenCalledTimes(2)
  })
})
