'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import * as repo from '@/lib/repository'
import { generateTailoredCv } from '@/lib/claude-generation'
import { renderCvDocx } from '@/lib/docx-template'
import { uploadCvDocx } from '@/lib/storage'
import { runCvGeneration } from '@/lib/generate-cv-orchestrator'
import { DEFAULT_USER_ID } from '@/lib/constants'

export interface GenerateCvState {
  error: string | null
}

export async function generateCvAction(
  applicationId: string,
  _prevState: GenerateCvState,
  formData: FormData,
): Promise<GenerateCvState> {
  const editedJobDescription = String(formData.get('jobDescriptionRaw') ?? '').trim()
  const db = createServiceClient()

  if (editedJobDescription.length > 0) {
    await repo.updateJobDescription(db, applicationId, editedJobDescription)
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    await runCvGeneration(
      {
        getApplication: (id) => repo.getApplication(db, id),
        getMasterDataBank: () => repo.getMasterDataBank(db, DEFAULT_USER_ID),
        getProfile: () => repo.getProfile(db, DEFAULT_USER_ID),
        generateTailoredCv: (masterData, jobDescription) => generateTailoredCv(anthropic, masterData, jobDescription),
        renderCvDocx: (profile, content) => renderCvDocx(profile, content),
        uploadCvDocx: (id, buffer) => uploadCvDocx(db, id, buffer),
        saveCvVersion: (id, storagePath, generatedJson) => repo.saveCvVersion(db, id, storagePath, generatedJson),
        saveInterviewQuestions: (id, questions) => repo.saveInterviewQuestions(db, id, questions),
      },
      applicationId,
    )
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Erro desconhecido ao gerar o CV.' }
  }

  revalidatePath(`/applications/${applicationId}`)
  return { error: null }
}
