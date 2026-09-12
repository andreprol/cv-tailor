import type { GeneratedCv } from './generation-schema'
import type { Application, MasterDataBank, Profile } from './types'

export interface GenerateCvDeps {
  getApplication: (applicationId: string) => Promise<Application>
  getMasterDataBank: () => Promise<MasterDataBank>
  getProfile: () => Promise<Profile>
  generateTailoredCv: (masterData: MasterDataBank, jobDescription: string) => Promise<GeneratedCv>
  renderCvDocx: (profile: Profile, content: GeneratedCv) => Promise<Buffer>
  uploadCvDocx: (applicationId: string, buffer: Buffer) => Promise<string>
  saveCvVersion: (applicationId: string, storagePath: string, generatedJson: GeneratedCv) => Promise<void>
  saveInterviewQuestions: (applicationId: string, questions: GeneratedCv['interviewQuestions']) => Promise<void>
}

export async function runCvGeneration(deps: GenerateCvDeps, applicationId: string): Promise<void> {
  const application = await deps.getApplication(applicationId)

  const masterData = await deps.getMasterDataBank()
  if (masterData.achievements.length === 0) {
    throw new Error('Banco mestre vazio pra esse usuario — rode o importador antes de gerar um CV.')
  }

  const generated = await deps.generateTailoredCv(masterData, application.job_description_raw)
  if (generated.selectedAchievements.length === 0) {
    throw new Error('Nenhuma conquista do banco mestre e relevante pra essa vaga especifica. Adicione conquistas relacionadas antes de gerar (ou confirme que essa vaga realmente nao combina com o seu perfil atual).')
  }
  // Real testing showed the model can still pick a few technically-real
  // achievements (passing the check above) for a vaga that doesn't actually
  // match — e.g. picking generic TPM bullets for a Rust/Soroban role. It
  // reliably self-reports this via sufficientMatch/matchWarning (see the
  // prompt), so trust that judgment and block before a misleading résumé
  // ever gets rendered.
  if (!generated.sufficientMatch) {
    throw new Error(generated.matchWarning ?? 'O banco mestre nao cobre os requisitos tecnicos centrais dessa vaga.')
  }

  const profile = await deps.getProfile()
  const docxBuffer = await deps.renderCvDocx(profile, generated)
  const storagePath = await deps.uploadCvDocx(applicationId, docxBuffer)

  await deps.saveCvVersion(applicationId, storagePath, generated)
  await deps.saveInterviewQuestions(applicationId, generated.interviewQuestions)
}
