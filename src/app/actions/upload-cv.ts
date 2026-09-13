'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { extractCvData, type CvFileKind } from '@/lib/import-cv'
import { insertAchievements, insertSkills, insertEducation, insertCertifications } from '@/lib/repository'
import type { Positioning } from '@/lib/types'
import type { ImportedCv } from '@/lib/import-schema'
import type { SupabaseClient } from '@supabase/supabase-js'

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

async function persistExtractedData(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  extracted: ImportedCv,
): Promise<{ saved: string[]; error: string | null }> {
  const saved: string[] = []
  try {
    if (extracted.achievements.length) {
      await insertAchievements(db, userId, positioning, extracted.achievements)
      saved.push(`${extracted.achievements.length} conquistas`)
    }
    if (extracted.skills.length) {
      await insertSkills(db, userId, positioning, extracted.skills)
      saved.push(`${extracted.skills.length} skills`)
    }
    if (extracted.education.length) {
      await insertEducation(db, userId, positioning, extracted.education)
      saved.push(`${extracted.education.length} formacoes`)
    }
    if (extracted.certifications.length) {
      await insertCertifications(db, userId, positioning, extracted.certifications)
      saved.push(`${extracted.certifications.length} certificacoes`)
    }
    return { saved, error: null }
  } catch (error) {
    console.error('uploadCvAction: falha ao salvar dados extraidos:', error)
    const savedSoFar = saved.length > 0 ? `Ja foi salvo antes do erro: ${saved.join(', ')}.` : 'Nada foi salvo.'
    return { saved, error: `Erro ao salvar parte dos dados extraidos. ${savedSoFar} Tenta subir o mesmo CV de novo — os itens ja salvos nao duplicam automaticamente, entao confira o perfil antes de reenviar.` }
  }
}

export async function uploadCvAction(_prevState: UploadCvState, formData: FormData): Promise<UploadCvState> {
  const file = formData.get('cvFile')
  const positioning = formData.getAll('positioning')
    .map(String)
    .filter((value): value is Positioning => (VALID_POSITIONING as string[]).includes(value))

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo PDF ou DOCX.', message: null }
  }

  const kind = detectFileKind(file)
  if (!kind) {
    return { error: 'Formato nao suportado. Envie um arquivo .pdf ou .docx.', message: null }
  }

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', message: null }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let extracted: ImportedCv
  try {
    extracted = await extractCvData(anthropic, kind, buffer)
  } catch {
    return { error: 'Nao consegui ler esse CV. Tenta outro arquivo.', message: null }
  }

  const db = createServiceClient()
  const { saved, error } = await persistExtractedData(db, userId, positioning, extracted)

  revalidatePath('/perfil')

  if (error) {
    return { error, message: null }
  }

  return {
    error: null,
    message: saved.length > 0 ? `Importado: ${saved.join(', ')}.` : 'Nenhum dado novo encontrado nesse CV.',
  }
}
