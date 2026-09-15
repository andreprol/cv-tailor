'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { deleteProfileItem, updateProfileItem, type ProfileItemTable } from '@/lib/repository'

const VALID_TABLES: ProfileItemTable[] = ['achievements', 'education', 'skills', 'certifications']

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
