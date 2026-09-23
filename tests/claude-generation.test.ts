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

  it('instructs the model to write a coverLetter grounded only in real achievements, with a generic greeting/closing and no fabricated name', () => {
    const prompt = buildGenerationPrompt(masterData, 'Vaga qualquer', 'pt')
    expect(prompt).toContain('"coverLetter"')
    expect(prompt.toLowerCase()).toContain('nunca escreva o nome do candidato')
  })
})

describe('assembleGeneratedCv', () => {
  it('throws when achievementId does not exist in the master data', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      coverLetter: 'CL',
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
      coverLetter: 'CL',
      selectedAchievements: [{ achievementId: '1', bullet: 'Reduzimos o custo de mercadorias vendidas em 5%.' }],
      keywords: [],
      interviewQuestions: [],
    } as any

    let result: ReturnType<typeof assembleGeneratedCv>
    expect(() => { result = assembleGeneratedCv(masterData, model, 'pt') }).not.toThrow()

    const delirio = result!.selectedAchievements.filter((a) => a.company === 'Delirio Tropical')
    expect(delirio).toHaveLength(1)
    expect(delirio[0].roleTitle).toBe('IT Manager')
    expect(delirio[0].bullet).toBe('Reduzimos o custo de mercadorias vendidas em 5%.')
    // Dates come from the master data row, never from the model's JSON.
    expect(delirio[0].startDate).toBe('2014-10-01')
    expect(delirio[0].endDate).toBeNull()
  })

  it('throws when a translated bullet drops or alters the real achievement\'s metric', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      coverLetter: 'CL',
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
      coverLetter: 'CL',
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
      coverLetter: 'CL',
      // Real metric is "$1,000" — this is a different number, not a
      // reformat, so it must still be caught.
      selectedAchievements: [{ achievementId: '2', bullet: 'Saved $10000 in vendor costs.' }],
      keywords: [],
      interviewQuestions: [],
    } as any
    expect(() => assembleGeneratedCv(masterData, genuinelyAltered, 'pt')).toThrow(/alucina/)
  })

  it('accepts a scale word expanded during translation ("US$200 mil" -> "$200,000") instead of calling it a hallucination', () => {
    const scaled: MasterDataBank = {
      ...masterData,
      achievements: [
        { id: 'm1', user_id: '1', company: 'Delirio Tropical', role_title: 'IT Manager', start_date: '2014-10-01', end_date: null, bullet: 'Reduzi o orçamento de US$200 mil para US$25 mil.', metric: 'US$200 mil para US$25 mil', positioning: ['TPM'] },
      ],
    }
    const model = {
      sufficientMatch: true, matchWarning: null, headline: 'H', summary: 'S',
      coverLetter: 'I cut the maintenance budget from $200,000 to $25,000.',
      selectedAchievements: [{ achievementId: 'm1', bullet: 'Cut the budget from $200,000 to $25,000.' }],
      keywords: [], interviewQuestions: [],
    } as any

    expect(() => assembleGeneratedCv(scaled, model, 'en')).not.toThrow()
  })

  it('still catches a genuinely different number after the scale-word expansion', () => {
    const scaled: MasterDataBank = {
      ...masterData,
      achievements: [
        { id: 'm1', user_id: '1', company: 'Delirio Tropical', role_title: 'IT Manager', start_date: '2014-10-01', end_date: null, bullet: 'Reduzi o orçamento de US$200 mil para US$25 mil.', metric: 'US$200 mil', positioning: ['TPM'] },
      ],
    }
    const model = {
      sufficientMatch: true, matchWarning: null, headline: 'H', summary: 'S',
      coverLetter: 'CL',
      // $900,000 is not the real number in any spelling.
      selectedAchievements: [{ achievementId: 'm1', bullet: 'Cut the budget from $900,000.' }],
      keywords: [], interviewQuestions: [],
    } as any

    expect(() => assembleGeneratedCv(scaled, model, 'en')).toThrow(/alucina/)
  })

  it('catches a number invented in the generated bullet, even when the achievement has no metric at all', () => {
    const withoutMetric: MasterDataBank = {
      ...masterData,
      achievements: [
        { id: 'n1', user_id: '1', company: 'Delirio Tropical', role_title: 'IT Manager', start_date: '2014-10-01', end_date: null, bullet: 'Gerenciei a infraestrutura de TI da rede.', metric: null, positioning: ['TPM'] },
      ],
    }
    const model = {
      sufficientMatch: true, matchWarning: null, headline: 'H', summary: 'S', coverLetter: 'CL',
      // Nothing in the real achievement mentions 450 stores or 99.9% uptime.
      selectedAchievements: [{ achievementId: 'n1', bullet: 'Managed IT infrastructure across 450 stores with 99.9% uptime.' }],
      keywords: [], interviewQuestions: [],
    } as any

    expect(() => assembleGeneratedCv(withoutMetric, model, 'en')).toThrow(/alucina/)
  })

  it('does not flag numbers that are in the real achievement but outside its metric field', () => {
    const richBullet: MasterDataBank = {
      ...masterData,
      achievements: [
        { id: 'n2', user_id: '1', company: 'Delirio Tropical', role_title: 'IT Manager', start_date: '2014-10-01', end_date: null, bullet: 'Eliminei o reporte manual em 224 endpoints de 10 unidades.', metric: '224', positioning: ['TPM'] },
      ],
    }
    const model = {
      sufficientMatch: true, matchWarning: null, headline: 'H', summary: 'S', coverLetter: 'CL',
      selectedAchievements: [{ achievementId: 'n2', bullet: 'Eliminated manual reporting across 224 endpoints in 10 sites.' }],
      keywords: [], interviewQuestions: [],
    } as any

    expect(() => assembleGeneratedCv(richBullet, model, 'en')).not.toThrow()
  })

  it('deduplicates a repeated achievementId instead of rendering the same achievement twice', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      coverLetter: 'CL',
      selectedAchievements: [
        { achievementId: '1', bullet: 'Reduced Cost of Goods Sold by 5%.' },
        { achievementId: '1', bullet: 'Reduced Cost of Goods Sold by 5%.' },
      ],
      keywords: [],
      interviewQuestions: [],
    } as any

    const result = assembleGeneratedCv(masterData, model, 'pt')

    // Only the repeated selection is dropped — the coverage guarantee still
    // adds the other real employer, so count this employer's entries rather
    // than the whole list.
    expect(result.selectedAchievements.filter((a) => a.company === 'Delirio Tropical')).toHaveLength(1)
  })

  it('carries the requested language through untouched, and copies the full education list from master data (never filtered/rewritten by the model)', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      coverLetter: 'CL',
      selectedAchievements: [],
      keywords: [],
      interviewQuestions: [],
    } as any

    const result = assembleGeneratedCv(masterData, model, 'en')

    expect(result.language).toBe('en')
    expect(result.coverLetter).toBe('CL')
    expect(result.education).toHaveLength(2)
    // In-progress entry sorts first regardless of completedOn.
    expect(result.education[0]).toEqual({ institution: 'FGV', degree: 'MBA', completedOn: null, inProgress: true })
    expect(result.education[1]).toEqual({ institution: 'UFRJ', degree: 'Engenharia', completedOn: '2010-12-01', inProgress: false })
  })

  it('does not throw when the coverLetter only references numbers that appear in the selected achievements\' real bullets/metrics', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      coverLetter: 'Reduzi o CMV em 5%, e economizei $1,000 em custos de fornecedores.',
      selectedAchievements: [
        { achievementId: '1', bullet: 'Reduced Cost of Goods Sold by 5%.' },
        { achievementId: '2', bullet: 'Saved $1,000 in vendor costs.' },
      ],
      keywords: [],
      interviewQuestions: [],
    } as any

    expect(() => assembleGeneratedCv(masterData, model, 'pt')).not.toThrow()
  })

  it('throws when the coverLetter contains a number not present in any selected achievement\'s real bullet/metric (possible fabrication)', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      // 87% never appears in the selected achievement (real metric is 5%) — a hallucinated number.
      coverLetter: 'Reduzi custos em 87% ao longo do programa.',
      selectedAchievements: [{ achievementId: '1', bullet: 'Reduced Cost of Goods Sold by 5%.' }],
      keywords: [],
      interviewQuestions: [],
    } as any

    expect(() => assembleGeneratedCv(masterData, model, 'pt')).toThrow(/alucina/)
  })

  it('does not throw when the coverLetter has no numbers at all', () => {
    const model = {
      sufficientMatch: true,
      matchWarning: null,
      headline: 'H',
      summary: 'S',
      coverLetter: 'Tenho grande interesse nessa posicao e acredito que minha experiencia agrega valor.',
      selectedAchievements: [{ achievementId: '1', bullet: 'Reduced Cost of Goods Sold by 5%.' }],
      keywords: [],
      interviewQuestions: [],
    } as any

    expect(() => assembleGeneratedCv(masterData, model, 'pt')).not.toThrow()
  })
})

// Mirrors the real shape of André's master data bank, which is what surfaced
// all of the bugs this block covers: the same current job stored twice (once
// with a Portuguese title, once English), an adjacent earlier role at the
// same employer, one employer whose name is written two different ways, and
// GitHub-imported repositories carrying company "Projeto Pessoal".
const careerMasterData: MasterDataBank = {
  achievements: [
    { id: 'c1', user_id: '1', company: 'Delírio Tropical', role_title: 'Technical Program Manager / IT Manager', start_date: '2014-10-01', end_date: null, bullet: 'Delivered 13 real-time BI queries.', metric: '13', positioning: ['TPM'] },
    { id: 'c2', user_id: '1', company: 'Delírio Tropical', role_title: 'Gerente de TI', start_date: '2014-10-01', end_date: null, bullet: 'Reduzi o orçamento de manutenção em 87%.', metric: '87%', positioning: ['TPM'] },
    { id: 'c3', user_id: '1', company: 'Delírio Tropical', role_title: 'Store Manager', start_date: '2012-12-01', end_date: '2014-10-01', bullet: 'Ran a flagship store.', metric: null, positioning: ['TPM'] },
    { id: 'c4', user_id: '1', company: 'Heliprol Táxi Aéreo (Aviation)', role_title: 'Co-founder & CEO', start_date: '2010-02-01', end_date: '2012-11-01', bullet: 'Founded an air taxi company.', metric: null, positioning: ['TPM'] },
    { id: 'c5', user_id: '1', company: 'Heliprol Táxi Aéreo Ltda', role_title: 'Administrador e Diretor Geral', start_date: '2010-02-01', end_date: '2012-11-01', bullet: 'Dirigi a operação com 3 aeronaves.', metric: '3', positioning: ['TPM'] },
    { id: 'p1', user_id: '1', company: 'Projeto Pessoal', role_title: 'cv-tailor', start_date: '2026-09-12', end_date: null, bullet: 'Gerador de currículo ATS-safe.', metric: null, positioning: ['TPM'] },
  ],
  skills: [],
  education: [],
  certifications: [],
}

function modelSelecting(...selected: { achievementId: string; bullet: string }[]) {
  return {
    sufficientMatch: true,
    matchWarning: null,
    headline: 'H',
    summary: 'S',
    coverLetter: 'CL',
    selectedAchievements: selected,
    keywords: [],
    interviewQuestions: [],
  } as any
}

describe('assembleGeneratedCv — career coverage and role grouping', () => {
  it('keeps every real employer in the CV even when the model only selected from the current job (the real bug: a relevance-ranked selection made the whole pre-2014 career disappear)', () => {
    const result = assembleGeneratedCv(careerMasterData, modelSelecting({ achievementId: 'c1', bullet: 'Entreguei 13 consultas de BI em tempo real.' }), 'pt')

    const companies = [
      ...result.selectedAchievements.map((a) => a.company),
      ...result.earlierExperience.map((e) => e.company),
    ]
    expect(companies).toContain('Delírio Tropical')
    expect(companies.some((c) => c.startsWith('Heliprol'))).toBe(true)
    expect(result.earlierExperience.some((e) => e.roleTitle === 'Store Manager')).toBe(true)
  })

  it('merges the same job stored under a Portuguese and an English title into a single entry', () => {
    const result = assembleGeneratedCv(careerMasterData, modelSelecting(
      { achievementId: 'c2', bullet: 'Reduzi o orçamento de manutenção em 87%.' },
      { achievementId: 'c1', bullet: 'Entreguei 13 consultas de BI em tempo real.' },
    ), 'pt')

    const current = result.selectedAchievements.filter((a) => a.company === 'Delírio Tropical' && a.endDate === null)
    expect(current).toHaveLength(2)
    // One heading, not two: every entry of the merged group carries the title
    // of the first one the model selected (rule 6.3 steers that to the
    // requested language).
    expect(new Set(current.map((a) => a.roleTitle))).toEqual(new Set(['Gerente de TI']))
  })

  it('does not merge an adjacent earlier role at the same employer (a promotion ending exactly when the next role starts is still two real jobs)', () => {
    const result = assembleGeneratedCv(careerMasterData, modelSelecting(
      { achievementId: 'c1', bullet: 'Entreguei 13 consultas de BI em tempo real.' },
      { achievementId: 'c3', bullet: 'Gerenciei uma loja principal.' },
    ), 'pt')

    expect(result.selectedAchievements.every((a) => a.roleTitle !== 'Store Manager')).toBe(true)
    const storeManager = result.earlierExperience.find((e) => e.roleTitle === 'Store Manager')
    expect(storeManager).toBeDefined()
    expect(storeManager!.startDate).toBe('2012-12-01')
    expect(storeManager!.endDate).toBe('2014-10-01')
  })

  it('treats one employer written two different ways as a single entry', () => {
    const result = assembleGeneratedCv(careerMasterData, modelSelecting({ achievementId: 'c1', bullet: 'Entreguei 13 consultas de BI em tempo real.' }), 'pt')

    expect(result.earlierExperience.filter((e) => e.company.startsWith('Heliprol'))).toHaveLength(1)
  })

  it('quotes a metric-bearing bullet for an employer the model left out entirely', () => {
    const result = assembleGeneratedCv(careerMasterData, modelSelecting({ achievementId: 'c1', bullet: 'Entreguei 13 consultas de BI em tempo real.' }), 'pt')

    const heliprol = result.earlierExperience.find((e) => e.company.startsWith('Heliprol'))
    expect(heliprol!.summary).toBe('Dirigi a operação com 3 aeronaves.')
  })

  it('sorts earlier experience most recent first', () => {
    const result = assembleGeneratedCv(careerMasterData, modelSelecting({ achievementId: 'c1', bullet: 'Entreguei 13 consultas de BI em tempo real.' }), 'pt')

    const startDates = result.earlierExperience.map((e) => e.startDate)
    expect(startDates).toEqual([...startDates].sort().reverse())
  })

  it('keeps GitHub-imported repositories out of work experience and lists them as personal projects instead', () => {
    const result = assembleGeneratedCv(careerMasterData, modelSelecting(
      { achievementId: 'c1', bullet: 'Entreguei 13 consultas de BI em tempo real.' },
      { achievementId: 'p1', bullet: 'Gerador de currículo ATS-safe.' },
    ), 'pt')

    expect(result.selectedAchievements.every((a) => a.company !== 'Projeto Pessoal')).toBe(true)
    expect(result.earlierExperience.every((e) => e.company !== 'Projeto Pessoal')).toBe(true)
    expect(result.personalProjects).toEqual([{ name: 'cv-tailor', summary: 'Gerador de currículo ATS-safe.' }])
  })

  it('never lets an employer rebuilt by the coverage guarantee take over the detailed section with its raw, untranslated bullets', () => {
    // The model picked only a personal project, so nothing real was selected.
    // Work Experience must still not be empty, but the promoted job is
    // condensed to one bullet — not the employer's whole raw bank.
    const result = assembleGeneratedCv(careerMasterData, modelSelecting({ achievementId: 'p1', bullet: 'Gerador de currículo ATS-safe.' }), 'pt')

    expect(result.selectedAchievements).toHaveLength(1)
    expect(result.selectedAchievements[0].company).toBe('Delírio Tropical')
    expect(result.earlierExperience.length).toBeGreaterThan(0)
  })

  it('keeps a hand-edited "projeto pessoal" spelling out of work experience, matching the employer the same normalized way as everything else', () => {
    const edited: MasterDataBank = {
      ...careerMasterData,
      achievements: careerMasterData.achievements.map((a) => (a.id === 'p1' ? { ...a, company: 'projeto pessoal ' } : a)),
    }
    const result = assembleGeneratedCv(edited, modelSelecting(
      { achievementId: 'c1', bullet: 'Entreguei 13 consultas de BI em tempo real.' },
      { achievementId: 'p1', bullet: 'Gerador de currículo ATS-safe.' },
    ), 'pt')

    const experienceCompanies = [
      ...result.selectedAchievements.map((a) => a.company),
      ...result.earlierExperience.map((e) => e.company),
    ]
    expect(experienceCompanies.some((c) => c.toLowerCase().includes('projeto pessoal'))).toBe(false)
    expect(result.personalProjects).toHaveLength(1)
  })

  it('prints the job period from the full master group, not from whichever row the model cited', () => {
    // Two rows of one job (bilingual bank, imported separately) disagreeing
    // on the end date. The model cites the one that ends earlier; the CV must
    // still show the job's real end, or the same job prints a different
    // period depending on the CV's language.
    const disagreeing: MasterDataBank = {
      ...careerMasterData,
      achievements: [
        { id: 's1', user_id: '1', company: 'Sênior Táxi Aéreo', role_title: 'Coordenador de Finanças', start_date: '2004-09-01', end_date: '2008-10-01', bullet: 'Fechamento financeiro mensal.', metric: null, positioning: ['TPM'] },
        { id: 's2', user_id: '1', company: 'Sênior Táxi Aéreo', role_title: 'Finance Coordinator', start_date: '2004-09-01', end_date: '2009-10-01', bullet: 'Secured financing for 7 aircraft.', metric: '7', positioning: ['TPM'] },
      ],
    }

    const result = assembleGeneratedCv(disagreeing, modelSelecting({ achievementId: 's1', bullet: 'Fechamento financeiro mensal.' }), 'pt')

    const entries = [...result.selectedAchievements, ...result.earlierExperience]
    expect(entries).toHaveLength(1)
    expect(entries[0].endDate).toBe('2009-10-01')
  })

  it('quotes a bullet carrying a number when the group has one', () => {
    const result = assembleGeneratedCv(careerMasterData, modelSelecting(
      { achievementId: 'c1', bullet: 'Entreguei 13 consultas de BI em tempo real.' },
      { achievementId: 'c4', bullet: 'Fundei uma empresa de táxi aéreo.' },
      { achievementId: 'c5', bullet: 'Dirigi a operação com 3 aeronaves.' },
    ), 'pt')

    const heliprol = result.earlierExperience.find((e) => e.company.startsWith('Heliprol'))
    expect(heliprol!.summary).toBe('Dirigi a operação com 3 aeronaves.')
  })

  it('instructs the model to cover every real employer and to treat personal projects separately', () => {
    const prompt = buildGenerationPrompt(careerMasterData, 'Vaga qualquer', 'pt')
    expect(prompt).toContain('HISTORICO COMPLETO')
    expect(prompt).toContain('Projeto Pessoal')
    // The period is given to the model as context for recency/same-job
    // reasoning; the rendered dates still come from the master data row.
    expect(prompt).toContain('2014-10-01')
  })
})

describe('generateTailoredCv', () => {
  it('retries once when the first response fails validation, then returns the valid result', async () => {
    const goodJson = JSON.stringify({
      sufficientMatch: true,
      matchWarning: null,
      headline: 'Technical Program Manager',
      summary: 'Summary',
      coverLetter: 'Cover letter text',
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
      coverLetter: 'Cover letter text',
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
