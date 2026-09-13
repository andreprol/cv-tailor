'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { extractCvData, type CvFileKind } from '@/lib/import-cv'
import { getMasterDataBank, insertAchievements, insertSkills, insertEducation, insertCertifications } from '@/lib/repository'
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

// Normalizes a string for duplicate comparison: trims, lowercases, and
// collapses internal whitespace. Extraction can vary in capitalization or
// spacing across different source files for the same underlying fact, so
// dedup keys are built from this instead of exact string matches.
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function achievementKey(company: string, roleTitle: string, bullet: string): string {
  return `${normalize(company)}|${normalize(roleTitle)}|${normalize(bullet)}`
}

function skillKey(name: string): string {
  return normalize(name)
}

function educationKey(institution: string, degree: string): string {
  return `${normalize(institution)}|${normalize(degree)}`
}

function certificationKey(name: string, issuer: string | null): string {
  return `${normalize(name)}|${normalize(issuer ?? '')}`
}

async function persistExtractedData(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  extracted: ImportedCv,
): Promise<{ saved: string[]; skippedCount: number; error: string | null }> {
  const saved: string[] = []
  try {
    // Fetch the current master data bank fresh on every call. When multiple
    // files are uploaded sequentially in the same batch, each server action
    // call commits its inserts before the next file's call begins, so this
    // fresh read also catches duplicates against items inserted earlier in
    // the same batch — no extra cross-call coordination needed.
    const existing = await getMasterDataBank(db, userId)

    const existingAchievementKeys = new Set(
      existing.achievements.map((a) => achievementKey(a.company, a.role_title, a.bullet)),
    )
    const existingSkillKeys = new Set(existing.skills.map((s) => skillKey(s.name)))
    const existingEducationKeys = new Set(existing.education.map((e) => educationKey(e.institution, e.degree)))
    const existingCertificationKeys = new Set(
      existing.certifications.map((c) => certificationKey(c.name, c.issuer)),
    )

    const newAchievements = extracted.achievements.filter(
      (a) => !existingAchievementKeys.has(achievementKey(a.company, a.roleTitle, a.bullet)),
    )
    const newSkills = extracted.skills.filter((s) => !existingSkillKeys.has(skillKey(s.name)))
    const newEducation = extracted.education.filter((e) => !existingEducationKeys.has(educationKey(e.institution, e.degree)))
    const newCertifications = extracted.certifications.filter(
      (c) => !existingCertificationKeys.has(certificationKey(c.name, c.issuer)),
    )

    const totalSkipped =
      (extracted.achievements.length - newAchievements.length) +
      (extracted.skills.length - newSkills.length) +
      (extracted.education.length - newEducation.length) +
      (extracted.certifications.length - newCertifications.length)

    if (newAchievements.length) {
      await insertAchievements(db, userId, positioning, newAchievements)
      saved.push(`${newAchievements.length} conquistas`)
    }
    if (newSkills.length) {
      await insertSkills(db, userId, positioning, newSkills)
      saved.push(`${newSkills.length} skills`)
    }
    if (newEducation.length) {
      await insertEducation(db, userId, positioning, newEducation)
      saved.push(`${newEducation.length} formacoes`)
    }
    if (newCertifications.length) {
      await insertCertifications(db, userId, positioning, newCertifications)
      saved.push(`${newCertifications.length} certificacoes`)
    }
    return { saved, skippedCount: totalSkipped, error: null }
  } catch (error) {
    console.error('uploadCvAction: falha ao salvar dados extraidos:', error)
    const savedSoFar = saved.length > 0 ? `Ja foi salvo antes do erro: ${saved.join(', ')}.` : 'Nada foi salvo.'
    return { saved, skippedCount: 0, error: `Erro ao salvar parte dos dados extraidos. ${savedSoFar} Pode tentar subir o mesmo CV de novo — os itens ja salvos nao serao duplicados.` }
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
  const { saved, skippedCount, error } = await persistExtractedData(db, userId, positioning, extracted)

  revalidatePath('/perfil')

  if (error) {
    return { error, message: null }
  }

  const skippedNote = skippedCount > 0 ? ` (${skippedCount} ja existia${skippedCount === 1 ? '' : 'm'}, nao duplicado${skippedCount === 1 ? '' : 's'})` : ''

  return {
    error: null,
    message: saved.length > 0
      ? `Importado: ${saved.join(', ')}.${skippedNote}`
      : skippedCount > 0
        ? `Nenhum dado novo — tudo o que esse CV tem ja estava no seu banco (${skippedCount} item${skippedCount === 1 ? '' : 's'}).`
        : 'Nenhum dado novo encontrado nesse CV.',
  }
}
