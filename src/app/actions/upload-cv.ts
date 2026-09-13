'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { extractCvData, type CvFileKind } from '@/lib/import-cv'
import { insertAchievements, insertSkills, insertEducation, insertCertifications } from '@/lib/repository'
import type { Positioning } from '@/lib/types'

const VALID_POSITIONING: Positioning[] = ['TPM', 'AI Product', 'Web3']

export interface UploadCvState {
  error: string | null
  message: string | null
}

function detectFileKind(file: File): CvFileKind | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx'
  return null
}

export async function uploadCvAction(_prevState: UploadCvState, formData: FormData): Promise<UploadCvState> {
  const file = formData.get('cvFile')
  const positioning = formData.getAll('positioning')
    .map(String)
    .filter((value): value is Positioning => (VALID_POSITIONING as string[]).includes(value))

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo PDF ou DOCX.', message: null }
  }
  if (positioning.length === 0) {
    return { error: 'Marque pelo menos um posicionamento (TPM, AI Product ou Web3).', message: null }
  }

  const kind = detectFileKind(file)
  if (!kind) {
    return { error: 'Formato nao suportado. Envie um arquivo .pdf ou .docx.', message: null }
  }

  const userId = await getCurrentUserId()
  const buffer = Buffer.from(await file.arrayBuffer())
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let extracted
  try {
    extracted = await extractCvData(anthropic, kind, buffer)
  } catch {
    return { error: 'Nao consegui ler esse CV. Tenta outro arquivo.', message: null }
  }

  const db = createServiceClient()
  if (extracted.achievements.length) await insertAchievements(db, userId, positioning, extracted.achievements)
  if (extracted.skills.length) await insertSkills(db, userId, positioning, extracted.skills)
  if (extracted.education.length) await insertEducation(db, userId, positioning, extracted.education)
  if (extracted.certifications.length) await insertCertifications(db, userId, positioning, extracted.certifications)

  revalidatePath('/perfil')
  return {
    error: null,
    message: `Importado: ${extracted.achievements.length} conquistas, ${extracted.skills.length} skills, ${extracted.education.length} formacoes, ${extracted.certifications.length} certificacoes.`,
  }
}
