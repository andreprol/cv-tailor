'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { extractCertificateData, type CertificateInput, type ImageMediaType } from '@/lib/extract-certificate'
import { insertCertifications } from '@/lib/repository'

export interface UploadCertificateState {
  error: string | null
  message: string | null
}

type CertificateFileKind = 'pdf' | 'docx' | 'image'

function detectFileKind(file: File): CertificateFileKind | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx'
  if (file.type.startsWith('image/') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')) return 'image'
  return null
}

function detectImageMediaType(file: File): ImageMediaType | null {
  if (file.type === 'image/jpeg' || file.type === 'image/png') return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.png')) return 'image/png'
  return null
}

export async function uploadCertificateAction(_prevState: UploadCertificateState, formData: FormData): Promise<UploadCertificateState> {
  const file = formData.get('certificateFile')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo PDF, DOCX ou imagem (JPG/PNG).', message: null }
  }

  const kind = detectFileKind(file)
  if (!kind) {
    return { error: 'Formato nao suportado. Envie um arquivo .pdf, .docx, .jpg ou .png.', message: null }
  }

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', message: null }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let input: CertificateInput
  if (kind === 'image') {
    const mediaType = detectImageMediaType(file)
    if (!mediaType) {
      return { error: 'Formato de imagem nao suportado. Envie um .jpg ou .png.', message: null }
    }
    input = { kind: 'image', buffer, mediaType }
  } else {
    input = { kind, buffer }
  }

  let extracted
  try {
    extracted = await extractCertificateData(anthropic, input)
  } catch {
    return { error: 'Nao consegui ler esse certificado. Tenta outro arquivo.', message: null }
  }

  if (extracted.certifications.length === 0) {
    return { error: 'Nenhum certificado encontrado nesse arquivo.', message: null }
  }

  const db = createServiceClient()
  let inserted: number
  try {
    inserted = await insertCertifications(db, userId, [], extracted.certifications)
  } catch (error) {
    console.error('uploadCertificateAction: falha ao salvar certificado:', error)
    return { error: 'Erro ao salvar o certificado. Tente novamente.', message: null }
  }

  revalidatePath('/perfil')

  if (inserted === 0) {
    return { error: null, message: 'Esse certificado ja estava no seu banco (nao duplicado).' }
  }
  return { error: null, message: `Importado: ${inserted} certificado${inserted === 1 ? '' : 's'}.` }
}
