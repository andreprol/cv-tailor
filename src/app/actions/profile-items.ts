'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import {
  deleteProfileItem,
  updateProfileItem,
  insertAchievements,
  insertSkills,
  insertEducation,
  insertCertifications,
  type ProfileItemTable,
} from '@/lib/repository'
import type { Positioning } from '@/lib/types'

const VALID_TABLES: ProfileItemTable[] = ['achievements', 'education', 'skills', 'certifications']
const VALID_POSITIONING: Positioning[] = ['TPM', 'AI Product', 'Web3']

function assertValidTable(table: string): ProfileItemTable {
  if (!(VALID_TABLES as string[]).includes(table)) {
    throw new Error(`Tabela invalida: ${table}`)
  }
  return table as ProfileItemTable
}

const EDITABLE_FIELDS: Record<ProfileItemTable, string[]> = {
  achievements: ['company', 'role_title', 'bullet', 'metric', 'start_date'],
  education: ['institution', 'degree'],
  skills: ['name', 'category'],
  certifications: ['name', 'issuer'],
}

// Campo de data opcional: string vazia vira null (nunca '' — coluna date
// do Postgres rejeita string vazia com erro, precisa ser NULL de verdade).
function optionalDate(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? '').trim() || null
}

export async function deleteProfileItemAction(table: string, id: string): Promise<void> {
  const validTable = assertValidTable(table)

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    redirect('/login')
  }

  const db = createServiceClient()
  await deleteProfileItem(db, validTable, id, userId)
  revalidatePath('/perfil')
}

export interface UpdateProfileItemState {
  error: string | null
  savedAt: number
}

export async function updateProfileItemAction(
  table: string,
  id: string,
  _prevState: UpdateProfileItemState,
  formData: FormData,
): Promise<UpdateProfileItemState> {
  const validTable = assertValidTable(table)

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', savedAt: _prevState.savedAt }
  }

  const db = createServiceClient()

  const fields: Record<string, string | boolean | null> = {}
  for (const key of EDITABLE_FIELDS[validTable]) {
    const value = formData.get(key)
    if (value !== null) fields[key] = String(value)
  }

  if (validTable === 'achievements' && formData.has('end_date')) {
    fields.end_date = optionalDate(formData, 'end_date')
  }
  if (validTable === 'education') {
    if (formData.has('completed_on')) fields.completed_on = optionalDate(formData, 'completed_on')
    fields.in_progress = formData.get('in_progress') === 'on'
  }
  if (validTable === 'certifications' && formData.has('issued_on')) {
    fields.issued_on = optionalDate(formData, 'issued_on')
  }

  try {
    await updateProfileItem(db, validTable, id, userId, fields)
  } catch (error) {
    console.error('updateProfileItemAction: falha ao salvar item do perfil:', error)
    return { error: 'Erro ao salvar. Tente novamente.', savedAt: _prevState.savedAt }
  }

  revalidatePath('/perfil')
  return { error: null, savedAt: Date.now() }
}

export interface AddProfileItemState {
  error: string | null
  addedAt: number
}

export async function addProfileItemAction(
  table: string,
  _prevState: AddProfileItemState,
  formData: FormData,
): Promise<AddProfileItemState> {
  const validTable = assertValidTable(table)

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', addedAt: _prevState.addedAt }
  }

  const positioning = formData.getAll('positioning')
    .map(String)
    .filter((value): value is Positioning => (VALID_POSITIONING as string[]).includes(value))

  const db = createServiceClient()

  try {
    let inserted: number

    if (validTable === 'achievements') {
      const company = String(formData.get('company') ?? '').trim()
      const roleTitle = String(formData.get('role_title') ?? '').trim()
      const bullet = String(formData.get('bullet') ?? '').trim()
      const metric = String(formData.get('metric') ?? '').trim() || null
      const startDate = String(formData.get('start_date') ?? '').trim()
      const endDate = String(formData.get('end_date') ?? '').trim() || null
      if (!company || !roleTitle || !bullet || !startDate) {
        return { error: 'Empresa, cargo, conquista e data de início são obrigatórios.', addedAt: _prevState.addedAt }
      }
      inserted = await insertAchievements(db, userId, positioning, [{ company, roleTitle, startDate, endDate, bullet, metric }])
    } else if (validTable === 'skills') {
      const name = String(formData.get('name') ?? '').trim()
      const category = String(formData.get('category') ?? '').trim()
      if (!name || !category) {
        return { error: 'Nome e categoria são obrigatórios.', addedAt: _prevState.addedAt }
      }
      inserted = await insertSkills(db, userId, positioning, [{ name, category }])
    } else if (validTable === 'education') {
      const institution = String(formData.get('institution') ?? '').trim()
      const degree = String(formData.get('degree') ?? '').trim()
      const inProgress = formData.get('in_progress') === 'on'
      const completedOn = inProgress ? null : (String(formData.get('completed_on') ?? '').trim() || null)
      if (!institution || !degree) {
        return { error: 'Instituição e curso são obrigatórios.', addedAt: _prevState.addedAt }
      }
      inserted = await insertEducation(db, userId, positioning, [{ institution, degree, completedOn, inProgress }])
    } else {
      const name = String(formData.get('name') ?? '').trim()
      const issuer = String(formData.get('issuer') ?? '').trim() || null
      const issuedOn = String(formData.get('issued_on') ?? '').trim() || null
      if (!name) {
        return { error: 'Nome da certificação é obrigatório.', addedAt: _prevState.addedAt }
      }
      inserted = await insertCertifications(db, userId, positioning, [{ name, issuer, issuedOn }])
    }

    if (inserted === 0) {
      return { error: 'Esse item já existe no seu banco (dados idênticos a um já cadastrado).', addedAt: _prevState.addedAt }
    }
  } catch (error) {
    console.error('addProfileItemAction: falha ao adicionar item:', error)
    return { error: 'Erro ao adicionar. Tente novamente.', addedAt: _prevState.addedAt }
  }

  revalidatePath('/perfil')
  return { error: null, addedAt: Date.now() }
}
