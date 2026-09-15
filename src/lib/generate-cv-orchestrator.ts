import type { GeneratedCv } from './generation-schema'
import type { CvLanguage } from './claude-generation'
import type { Application, MasterDataBank, Profile } from './types'

// Marks an error as one of runCvGeneration's own deliberate, user-facing
// messages (banco mestre vazio) — safe to show to the client as-is.
// Anything else thrown out of
// this pipeline (from the injected deps: Postgrest/Supabase, the Anthropic
// SDK, docx rendering, storage upload) is raw infra detail and must be
// genericized by the caller instead of shown verbatim. See
// src/app/actions/generate-cv.ts's catch block.
export class CvGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CvGenerationError'
  }
}

export interface GenerateCvDeps {
  getApplication: (applicationId: string) => Promise<Application>
  getMasterDataBank: () => Promise<MasterDataBank>
  getProfile: () => Promise<Profile>
  generateTailoredCv: (masterData: MasterDataBank, jobDescription: string, language: CvLanguage) => Promise<GeneratedCv>
  renderCvDocx: (profile: Profile, content: GeneratedCv) => Promise<Buffer>
  uploadCvDocx: (applicationId: string, buffer: Buffer) => Promise<string>
  saveCvVersion: (applicationId: string, storagePath: string, generatedJson: GeneratedCv) => Promise<void>
  saveInterviewQuestions: (applicationId: string, questions: GeneratedCv['interviewQuestions']) => Promise<void>
}

export async function runCvGeneration(deps: GenerateCvDeps, applicationId: string, language: CvLanguage): Promise<void> {
  const application = await deps.getApplication(applicationId)

  const masterData = await deps.getMasterDataBank()
  if (masterData.achievements.length === 0) {
    throw new CvGenerationError('Banco mestre vazio pra esse usuario — rode o importador antes de gerar um CV.')
  }

  const generated = await deps.generateTailoredCv(masterData, application.job_description_raw, language)

  // Não bloqueia mais por julgamento de match (sufficientMatch/selectedAchievements vazio) — o
  // usuário decide se quer se candidatar; a aplicação só maximiza a chance de passar no ATS e
  // chegar na parte humana. Se a IA julgou o match insuficiente (sufficientMatch: false) e também
  // não preencheu matchWarning sozinha — mesmo tendo selecionado algumas conquistas soltas —
  // garante que sempre existe um aviso pra mostrar na tela (nunca no documento em si — nem
  // docx-template.ts nem pdf-template.ts leem esse campo).
  if (!generated.sufficientMatch && !generated.matchWarning) {
    generated.matchWarning = 'Nenhuma conquista do banco combina diretamente com essa vaga — CV gerado só com resumo/skills.'
  }

  const profile = await deps.getProfile()
  const docxBuffer = await deps.renderCvDocx(profile, generated)
  const storagePath = await deps.uploadCvDocx(applicationId, docxBuffer)

  await deps.saveCvVersion(applicationId, storagePath, generated)
  await deps.saveInterviewQuestions(applicationId, generated.interviewQuestions)
}
