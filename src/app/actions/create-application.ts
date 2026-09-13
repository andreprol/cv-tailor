'use server'

import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { createApplication } from '@/lib/repository'
import { fetchJobDescription } from '@/lib/extract-job-text'

export interface CreateApplicationState {
  error: string | null
  company: string
  roleTitle: string
  sourceUrl: string
  jobDescriptionRaw: string
}

export async function createApplicationAction(
  _prevState: CreateApplicationState,
  formData: FormData,
): Promise<CreateApplicationState> {
  const company = String(formData.get('company') ?? '')
  const roleTitle = String(formData.get('roleTitle') ?? '')
  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim()
  const pastedText = String(formData.get('jobDescriptionRaw') ?? '').trim()

  const jobDescriptionRaw = sourceUrl ? (await fetchJobDescription(sourceUrl)) ?? pastedText : pastedText

  if (!jobDescriptionRaw) {
    return {
      error: 'Nao foi possivel extrair o texto da vaga do link, e nenhum texto foi colado. Cole o texto da vaga manualmente.',
      company,
      roleTitle,
      sourceUrl,
      jobDescriptionRaw: pastedText,
    }
  }

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return {
      error: 'Sua sessao expirou. Faca login novamente.',
      company,
      roleTitle,
      sourceUrl,
      jobDescriptionRaw: pastedText,
    }
  }
  const db = createServiceClient()
  const application = await createApplication(db, userId, { company, roleTitle, sourceUrl: sourceUrl || null, jobDescriptionRaw })

  redirect(`/applications/${application.id}`)
}
