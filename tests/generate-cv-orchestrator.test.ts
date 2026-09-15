import { describe, it, expect, vi } from 'vitest'
import { runCvGeneration, type GenerateCvDeps } from '../src/lib/generate-cv-orchestrator'

function makeDeps(overrides: Partial<GenerateCvDeps> = {}): GenerateCvDeps {
  return {
    getApplication: vi.fn().mockResolvedValue({ id: 'app-1', job_description_raw: 'vaga...' }),
    getMasterDataBank: vi.fn().mockResolvedValue({
      achievements: [{ bullet: 'Reduced Cost of Goods Sold by 5%.' }], skills: [], education: [], certifications: [],
    }),
    getProfile: vi.fn().mockResolvedValue({ full_name: 'André Prol' }),
    generateTailoredCv: vi.fn().mockImplementation((_masterData, _jobDescription, _language) => Promise.resolve({
      sufficientMatch: true, matchWarning: null,
      headline: 'TPM', summary: 'S', selectedAchievements: [{ company: 'Acme', roleTitle: 'Role', bullet: 'Did something real' }], keywords: [], interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
    })),
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

    await runCvGeneration(deps, 'app-1', 'pt')

    expect(deps.generateTailoredCv).toHaveBeenCalledWith(expect.objectContaining({ achievements: expect.any(Array) }), 'vaga...', 'pt')
    expect(deps.uploadCvDocx).toHaveBeenCalledWith('app-1', Buffer.from('docx-bytes'))
    expect(deps.saveCvVersion).toHaveBeenCalledWith('app-1', 'app-1.docx', expect.any(Object))
    expect(deps.saveInterviewQuestions).toHaveBeenCalledWith('app-1', [{ question: 'Q1', rationale: 'R1' }])
  })

  it('throws before calling Claude when the master data bank is empty', async () => {
    const deps = makeDeps({
      getMasterDataBank: vi.fn().mockResolvedValue({ achievements: [], skills: [], education: [], certifications: [] }),
    })

    await expect(runCvGeneration(deps, 'app-1', 'pt')).rejects.toThrow('Banco mestre vazio')
    expect(deps.generateTailoredCv).not.toHaveBeenCalled()
  })

  it('propagates the error from generateTailoredCv without uploading anything', async () => {
    const deps = makeDeps({ generateTailoredCv: vi.fn().mockRejectedValue(new Error('Claude failed twice')) })

    await expect(runCvGeneration(deps, 'app-1', 'pt')).rejects.toThrow('Claude failed twice')
    expect(deps.uploadCvDocx).not.toHaveBeenCalled()
  })

  it('generates the CV anyway when Claude finds no relevant achievements, backfilling a matchWarning', async () => {
    const deps = makeDeps({
      generateTailoredCv: vi.fn().mockResolvedValue({
        sufficientMatch: false, matchWarning: null,
        headline: 'X', summary: 'Y', selectedAchievements: [], keywords: [], interviewQuestions: [],
      }),
    })

    await runCvGeneration(deps, 'app-1', 'pt')

    expect(deps.uploadCvDocx).toHaveBeenCalled()
    expect(deps.saveCvVersion).toHaveBeenCalledWith(
      'app-1',
      'app-1.docx',
      expect.objectContaining({ matchWarning: expect.stringContaining('Nenhuma conquista') }),
    )
  })

  it('backfills a matchWarning when sufficientMatch is false and the model forgot to explain why, even with some achievements selected', async () => {
    const deps = makeDeps({
      generateTailoredCv: vi.fn().mockResolvedValue({
        sufficientMatch: false, matchWarning: null,
        headline: 'X', summary: 'Y',
        selectedAchievements: [{ company: 'Acme', roleTitle: 'Role', bullet: 'Did something real' }],
        keywords: [], interviewQuestions: [],
      }),
    })

    await runCvGeneration(deps, 'app-1', 'pt')

    expect(deps.uploadCvDocx).toHaveBeenCalled()
    expect(deps.saveCvVersion).toHaveBeenCalledWith(
      'app-1',
      'app-1.docx',
      expect.objectContaining({ matchWarning: expect.stringContaining('Nenhuma conquista') }),
    )
  })

  it('generates the CV anyway when sufficientMatch is false, preserving the model\'s own matchWarning untouched (real case: a Web3 posting against a TPM-only bank got 3 real, verbatim, but topically irrelevant achievements selected — the app must not decide for the user whether the vaga is worth applying to)', async () => {
    const deps = makeDeps({
      generateTailoredCv: vi.fn().mockResolvedValue({
        sufficientMatch: false,
        matchWarning: 'Banco de dados nao tem experiencia real em Rust/Solidity/Soroban, exigidos pela vaga.',
        headline: 'Soroban Smart Contract Developer',
        summary: 'Some summary the model still filled in',
        selectedAchievements: [{ company: 'Acme', roleTitle: 'Role', bullet: 'Did something real but unrelated to Web3' }],
        keywords: [],
        interviewQuestions: [],
      }),
    })

    await runCvGeneration(deps, 'app-1', 'pt')

    expect(deps.renderCvDocx).toHaveBeenCalled()
    expect(deps.uploadCvDocx).toHaveBeenCalled()
    expect(deps.saveCvVersion).toHaveBeenCalledWith(
      'app-1',
      'app-1.docx',
      expect.objectContaining({ matchWarning: 'Banco de dados nao tem experiencia real em Rust/Solidity/Soroban, exigidos pela vaga.' }),
    )
  })
})
