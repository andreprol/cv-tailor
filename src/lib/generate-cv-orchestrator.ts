import type { GeneratedCv } from './generation-schema'
import type { CvLanguage } from './claude-generation'
import type { Application, MasterDataBank, Profile } from './types'

// Marks an error as one of runCvGeneration's own deliberate, user-facing
// messages (banco mestre vazio / nenhuma conquista relevante / matchWarning
// do modelo) — safe to show to the client as-is. Anything else thrown out of
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
  if (generated.selectedAchievements.length === 0) {
    throw new CvGenerationError('Nenhuma conquista do banco mestre e relevante pra essa vaga especifica. Adicione conquistas relacionadas antes de gerar (ou confirme que essa vaga realmente nao combina com o seu perfil atual).')
  }
  // Real testing showed the model can still pick a few technically-real
  // achievements (passing the check above) for a vaga that doesn't actually
  // match — e.g. picking generic TPM bullets for a Rust/Soroban role. It
  // reliably self-reports this via sufficientMatch/matchWarning (see the
  // prompt), so trust that judgment and block before a misleading résumé
  // ever gets rendered.
  if (!generated.sufficientMatch) {
    throw new CvGenerationError(generated.matchWarning ?? 'O banco mestre nao cobre os requisitos tecnicos centrais dessa vaga.')
  }

  const profile = await deps.getProfile()
  const docxBuffer = await deps.renderCvDocx(profile, generated)
  const storagePath = await deps.uploadCvDocx(applicationId, docxBuffer)

  await deps.saveCvVersion(applicationId, storagePath, generated)
  await deps.saveInterviewQuestions(applicationId, generated.interviewQuestions)
}
