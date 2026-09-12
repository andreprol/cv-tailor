import { describe, it, expect, vi } from 'vitest'
import { runCvGeneration, type GenerateCvDeps } from '../src/lib/generate-cv-orchestrator'

function makeDeps(overrides: Partial<GenerateCvDeps> = {}): GenerateCvDeps {
  return {
    getApplication: vi.fn().mockResolvedValue({ id: 'app-1', job_description_raw: 'vaga...' }),
    getMasterDataBank: vi.fn().mockResolvedValue({
      achievements: [{ bullet: 'Reduced Cost of Goods Sold by 5%.' }], skills: [], education: [], certifications: [],
    }),
    getProfile: vi.fn().mockResolvedValue({ full_name: 'André Prol' }),
    generateTailoredCv: vi.fn().mockResolvedValue({
      headline: 'TPM', summary: 'S', selectedAchievements: [{ company: 'Acme', roleTitle: 'Role', bullet: 'Did something real' }], keywords: [], interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
    }),
    renderCvDocx: vi.fn().mockResolvedValue(Buffer.from('docx-bytes')),
    uploadCvDocx: vi.fn().mockResolvedValue('app-1.docx'),
    saveCvVersion: vi.fn().mockResolvedValue(undefined),
    saveInterviewQuestions: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as GenerateCvDeps
}

describe('runCvGeneration', () => {
  it('runs the full pipeline for an existing application', async () => {
    const deps = makeDeps()

    await runCvGeneration(deps, 'app-1')

    expect(deps.generateTailoredCv).toHaveBeenCalledWith(expect.objectContaining({ achievements: expect.any(Array) }), 'vaga...')
    expect(deps.uploadCvDocx).toHaveBeenCalledWith('app-1', Buffer.from('docx-bytes'))
    expect(deps.saveCvVersion).toHaveBeenCalledWith('app-1', 'app-1.docx', expect.any(Object))
    expect(deps.saveInterviewQuestions).toHaveBeenCalledWith('app-1', [{ question: 'Q1', rationale: 'R1' }])
  })

  it('throws before calling Claude when the master data bank is empty', async () => {
    const deps = makeDeps({
      getMasterDataBank: vi.fn().mockResolvedValue({ achievements: [], skills: [], education: [], certifications: [] }),
    })

    await expect(runCvGeneration(deps, 'app-1')).rejects.toThrow('Banco mestre vazio')
    expect(deps.generateTailoredCv).not.toHaveBeenCalled()
  })

  it('propagates the error from generateTailoredCv without uploading anything', async () => {
    const deps = makeDeps({ generateTailoredCv: vi.fn().mockRejectedValue(new Error('Claude failed twice')) })

    await expect(runCvGeneration(deps, 'app-1')).rejects.toThrow('Claude failed twice')
    expect(deps.uploadCvDocx).not.toHaveBeenCalled()
  })

  it('throws when Claude finds no relevant achievements for this posting', async () => {
    const deps = makeDeps({
      generateTailoredCv: vi.fn().mockResolvedValue({
        headline: 'X', summary: 'Y', selectedAchievements: [], keywords: [], interviewQuestions: [],
      }),
    })

    await expect(runCvGeneration(deps, 'app-1')).rejects.toThrow(/relevante/)
    expect(deps.uploadCvDocx).not.toHaveBeenCalled()
  })
})
