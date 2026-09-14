'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import * as repo from '@/lib/repository'
import { generateTailoredCv, type CvLanguage } from '@/lib/claude-generation'
import { renderCvDocx } from '@/lib/docx-template'
import { uploadCvDocx } from '@/lib/storage'
import { runCvGeneration, CvGenerationError } from '@/lib/generate-cv-orchestrator'

export interface GenerateCvState {
  error: string | null
}

export async function generateCvAction(
  applicationId: string,
  _prevState: GenerateCvState,
  formData: FormData,
): Promise<GenerateCvState> {
  const editedJobDescription = String(formData.get('jobDescriptionRaw') ?? '').trim()
  const languageRaw = String(formData.get('language') ?? 'pt')
  const language: CvLanguage = languageRaw === 'en' ? 'en' : 'pt'

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.' }
  }

  const db = createServiceClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    if (editedJobDescription.length > 0) {
      await repo.updateJobDescription(db, applicationId, userId, editedJobDescription)
    }

    await runCvGeneration(
      {
        getApplication: (id) => repo.getApplication(db, id, userId),
        getMasterDataBank: () => repo.getMasterDataBank(db, userId),
        getProfile: () => repo.getProfile(db, userId),
        generateTailoredCv: (masterData, jobDescription, lang) => generateTailoredCv(anthropic, masterData, jobDescription, lang),
        renderCvDocx: (profile, content) => renderCvDocx(profile, content),
        uploadCvDocx: (id, buffer) => uploadCvDocx(db, id, buffer),
        saveCvVersion: (id, storagePath, generatedJson) => repo.saveCvVersion(db, id, storagePath, generatedJson),
        saveInterviewQuestions: (id, questions) => repo.saveInterviewQuestions(db, id, questions),
      },
      applicationId,
      language,
    )
  } catch (error) {
    console.error('generateCvAction: falha ao gerar CV:', error)
    // CvGenerationError is runCvGeneration's own deliberate, safe,
    // user-facing message (banco mestre vazio / nenhuma conquista relevante /
    // matchWarning do modelo) — show it as-is. Anything else here is a raw
    // infra error (Postgrest/Supabase from repo.updateJobDescription above,
    // or from the deps inside runCvGeneration — storage upload, docx
    // rendering, Anthropic) that must not reach the client verbatim.
    if (error instanceof CvGenerationError) {
      return { error: error.message }
    }
    return { error: 'Erro ao gerar o CV. Tente novamente em instantes.' }
  }

  revalidatePath(`/applications/${applicationId}`)
  return { error: null }
}
