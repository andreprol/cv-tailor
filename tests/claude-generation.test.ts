import { describe, it, expect, vi } from 'vitest'
import { buildGenerationPrompt, assembleGeneratedCv, generateTailoredCv } from '../src/lib/claude-generation'
import type { MasterDataBank } from '../src/lib/types'

const masterData: MasterDataBank = {
  achievements: [
    { id: '1', user_id: '1', company: 'Delirio Tropical', role_title: 'IT Manager', start_date: '2014-10-01', end_date: null, bullet: 'Reduced Cost of Goods Sold by 5%.', metric: '5%', positioning: ['TPM'] },
    { id: '2', user_id: '1', company: 'Acme Corp', role_title: 'TPM', start_date: '2020-01-01', end_date: null, bullet: 'Saved $1,000 in vendor costs.', metric: '$1,000', positioning: ['TPM'] },
  ],
  skills: [{ id: '1', user_id: '1', name: 'SAP Business One', category: 'ERP', positioning: ['TPM'] }],
  education: [
    { id: 'e1', user_id: '1', institution: 'UFRJ', degree: 'Engenharia', completed_on: '2010-12-01', in_progress: false, positioning: ['TPM'] },
    { id: 'e2', user_id: '1', institution: 'FGV', degree: 'MBA', completed_on: null, in_progress: true, positioning: ['TPM'] },
  ],
  certifications: [],
}

describe('buildGenerationPrompt', () => {
  it('includes the job description and the real achievement id', () => {
    const prompt = buildGenerationPrompt(masterData, 'Vaga de Technical Program Manager remoto', 'pt')
    expect(prompt).toContain('Vaga de Technical Program Manager remoto')
    expect(prompt).toContain('[id:1]')
  })

  it('instructs the model to never invent an achievement', () => {
    const prompt = buildGenerationPrompt(masterData, 'Vaga qualquer', 'pt')
    expect(prompt.toLowerCase()).toContain('nunca invente')
  })

  it('instructs the model to signal a real vaga mismatch via sufficientMatch/matchWarning, never inside summary/headline', () => {
    const prompt = buildGenerationPrompt(masterData, 'Vaga qualquer', 'pt')
    expect(prompt).toContain('sufficientMatch')
    expect(prompt).toContain('matchWarning')
    expect(prompt.toLowerCase()).toContain('nunca escreva ali um aviso')
  })

  it('includes a language instruction for the requested language', () => {
    const promptEn = buildGenerationPrompt(masterData, 'Vaga qualquer', 'en')
    expect(promptEn.toLowerCase()).toContain('inglês')

    const promptPt = buildGenerationPrompt(masterData, 'Vaga qualquer', 'pt')
    expect(promptPt.toLowerCase()).toContain('português')
  })
})

describe('assembleGeneratedCv', () => {
  it('throws when achievementId does not exist in the master data', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      selectedAchievements: [{ achievementId: 'does-not-exist', bullet: 'Invented achievement' }],
      keywords: [],
      interviewQuestions: [],
    } as any
    expect(() => assembleGeneratedCv(masterData, model, 'pt')).toThrow(/alucina/)
  })

  it('does not throw when achievementId is real, and sources company/roleTitle from the real master data record (not from the model output)', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      selectedAchievements: [{ achievementId: '1', bullet: 'Reduzimos o custo de mercadorias vendidas em 5%.' }],
      keywords: [],
      interviewQuestions: [],
    } as any

    let result: ReturnType<typeof assembleGeneratedCv>
    expect(() => { result = assembleGeneratedCv(masterData, model, 'pt') }).not.toThrow()

    expect(result!.selectedAchievements).toHaveLength(1)
    expect(result!.selectedAchievements[0].company).toBe('Delirio Tropical')
    expect(result!.selectedAchievements[0].roleTitle).toBe('IT Manager')
    expect(result!.selectedAchievements[0].bullet).toBe('Reduzimos o custo de mercadorias vendidas em 5%.')
  })

  it('throws when a translated bullet drops or alters the real achievement\'s metric', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      // Real metric is "5%" — this bullet says 50%, a hallucinated number.
      selectedAchievements: [{ achievementId: '1', bullet: 'Reduced costs by 50%.' }],
      keywords: [],
      interviewQuestions: [],
    } as any
    expect(() => assembleGeneratedCv(masterData, model, 'pt')).toThrow(/alucina/)
  })

  it('does not false-positive when a thousands separator is added or removed during translation', () => {
    const withoutComma = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      // Real metric is "$1,000" — bullet drops the comma, same real number.
      selectedAchievements: [{ achievementId: '2', bullet: 'Saved $1000 in vendor costs.' }],
      keywords: [],
      interviewQuestions: [],
    } as any
    expect(() => assembleGeneratedCv(masterData, withoutComma, 'pt')).not.toThrow()

    const genuinelyAltered = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      // Real metric is "$1,000" — this is a different number, not a
      // reformat, so it must still be caught.
      selectedAchievements: [{ achievementId: '2', bullet: 'Saved $10000 in vendor costs.' }],
      keywords: [],
      interviewQuestions: [],
    } as any
    expect(() => assembleGeneratedCv(masterData, genuinelyAltered, 'pt')).toThrow(/alucina/)
  })

  it('deduplicates a repeated achievementId instead of rendering the same achievement twice', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      selectedAchievements: [
        { achievementId: '1', bullet: 'Reduced Cost of Goods Sold by 5%.' },
        { achievementId: '1', bullet: 'Reduced Cost of Goods Sold by 5%.' },
      ],
      keywords: [],
      interviewQuestions: [],
    } as any

    const result = assembleGeneratedCv(masterData, model, 'pt')

    expect(result.selectedAchievements).toHaveLength(1)
  })

  it('carries the requested language through untouched, and copies the full education list from master data (never filtered/rewritten by the model)', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      selectedAchievements: [],
      keywords: [],
      interviewQuestions: [],
    } as any

    const result = assembleGeneratedCv(masterData, model, 'en')

    expect(result.language).toBe('en')
    expect(result.education).toHaveLength(2)
    // In-progress entry sorts first regardless of completedOn.
    expect(result.education[0]).toEqual({ institution: 'FGV', degree: 'MBA', completedOn: null, inProgress: true })
    expect(result.education[1]).toEqual({ institution: 'UFRJ', degree: 'Engenharia', completedOn: '2010-12-01', inProgress: false })
  })
})

describe('generateTailoredCv', () => {
  it('retries once when the first response fails validation, then returns the valid result', async () => {
    const goodJson = JSON.stringify({
      sufficientMatch: true,
      matchWarning: null,
      headline: 'Technical Program Manager',
      summary: 'Summary',
      selectedAchievements: [{ achievementId: '1', bullet: 'Reduced Cost of Goods Sold by 5%.' }],
      keywords: ['SAP Business One'],
      interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
    })
    const create = vi.fn()
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: goodJson }] })
    const fakeClient = { messages: { create } } as any

    const result = await generateTailoredCv(fakeClient, masterData, 'Vaga TPM', 'pt')

    expect(create).toHaveBeenCalledTimes(2)
    expect(result.headline).toBe('Technical Program Manager')
  })

  it('propagates the error when both attempts fail', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] })
    const fakeClient = { messages: { create } } as any

    await expect(generateTailoredCv(fakeClient, masterData, 'Vaga TPM', 'pt')).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('finds the text block by type instead of assuming index 0, and fails loudly when there is none (real bug: extended thinking puts a "thinking" block before the text block, and truncation can drop the text block entirely)', async () => {
    const goodJson = JSON.stringify({
      sufficientMatch: true,
      matchWarning: null,
      headline: 'Technical Program Manager',
      summary: 'Summary',
      selectedAchievements: [{ achievementId: '1', bullet: 'Reduced Cost of Goods Sold by 5%.' }],
      keywords: ['SAP Business One'],
      interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
    })
    const thinkingThenText = { content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: goodJson }], stop_reason: 'end_turn' }
    const create = vi.fn().mockResolvedValueOnce(thinkingThenText)
    const fakeClient = { messages: { create } } as any

    const result = await generateTailoredCv(fakeClient, masterData, 'Vaga TPM', 'pt')

    expect(create).toHaveBeenCalledTimes(1)
    expect(result.headline).toBe('Technical Program Manager')
  })

  it('throws a clear error (not a cryptic JSON.parse failure) when no attempt ever produces a text block', async () => {
    const thinkingOnly = { content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'max_tokens' }
    const create = vi.fn().mockResolvedValue(thinkingOnly)
    const fakeClient = { messages: { create } } as any

    await expect(generateTailoredCv(fakeClient, masterData, 'Vaga TPM', 'pt')).rejects.toThrow(/nao retornou nenhum bloco de texto/)
    expect(create).toHaveBeenCalledTimes(2)
  })
})
