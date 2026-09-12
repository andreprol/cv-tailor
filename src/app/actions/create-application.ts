'use server'

import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { createApplication } from '@/lib/repository'
import { fetchJobDescription } from '@/lib/extract-job-text'
import { DEFAULT_USER_ID } from '@/lib/constants'

export async function createApplicationAction(formData: FormData): Promise<void> {
  const company = String(formData.get('company') ?? '')
  const roleTitle = String(formData.get('roleTitle') ?? '')
  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim() || null
  const pastedText = String(formData.get('jobDescriptionRaw') ?? '').trim()

  const jobDescriptionRaw = sourceUrl ? (await fetchJobDescription(sourceUrl)) ?? pastedText : pastedText

  if (!jobDescriptionRaw) {
    throw new Error('Nao foi possivel extrair o texto da vaga do link, e nenhum texto foi colado. Cole o texto da vaga manualmente.')
  }

  const db = createServiceClient()
  const application = await createApplication(db, DEFAULT_USER_ID, { company, roleTitle, sourceUrl, jobDescriptionRaw })

  redirect(`/applications/${application.id}`)
}
