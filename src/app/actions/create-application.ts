'use server'

import Anthropic from '@anthropic-ai/sdk'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { createApplication } from '@/lib/repository'
import { fetchJobDescription } from '@/lib/extract-job-text'
import { extractJobDescriptionFromImage, type ImageMediaType } from '@/lib/extract-job-image'

export interface CreateApplicationState {
  error: string | null
  company: string
  roleTitle: string
  sourceUrl: string
  jobDescriptionRaw: string
}

const VALID_IMAGE_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const EXTENSION_TO_MEDIA_TYPE: Record<string, ImageMediaType> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
}

// Mirrors detectFileKind's convention in upload-cv.ts: trust file.type first
// (a pasted-from-clipboard image always has one), fall back to the filename
// extension for the plain <input type="file"> case, where some OS/browser
// combinations leave file.type empty.
function detectImageMediaType(file: File): ImageMediaType | null {
  if ((VALID_IMAGE_TYPES as string[]).includes(file.type)) {
    return file.type as ImageMediaType
  }
  const name = file.name.toLowerCase()
  const extension = Object.keys(EXTENSION_TO_MEDIA_TYPE).find((ext) => name.endsWith(ext))
  return extension ? EXTENSION_TO_MEDIA_TYPE[extension] : null
}

export async function createApplicationAction(
  _prevState: CreateApplicationState,
  formData: FormData,
): Promise<CreateApplicationState> {
  const company = String(formData.get('company') ?? '')
  const roleTitle = String(formData.get('roleTitle') ?? '')
  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim()
  const pastedText = String(formData.get('jobDescriptionRaw') ?? '').trim()
  const jobImage = formData.get('jobImage')

  let jobDescriptionRaw: string | null = null

  if (sourceUrl) {
    jobDescriptionRaw = await fetchJobDescription(sourceUrl)
  }

  if (!jobDescriptionRaw && jobImage instanceof File && jobImage.size > 0) {
    const mediaType = detectImageMediaType(jobImage)
    if (mediaType) {
      try {
        const buffer = Buffer.from(await jobImage.arrayBuffer())
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        jobDescriptionRaw = await extractJobDescriptionFromImage(anthropic, buffer, mediaType)
      } catch (error) {
        console.error('createApplicationAction: falha ao extrair texto da imagem da vaga:', error)
      }
    }
  }

  if (!jobDescriptionRaw) {
    jobDescriptionRaw = pastedText || null
  }

  if (!jobDescriptionRaw) {
    return {
      error: 'Nao foi possivel extrair o texto da vaga (link ou imagem), e nenhum texto foi colado. Cole o texto da vaga manualmente.',
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
