'use server'

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
  achievements: ['company', 'role_title', 'bullet', 'metric'],
  education: ['institution', 'degree'],
  skills: ['name', 'category'],
  certifications: ['name', 'issuer'],
}

export async function deleteProfileItemAction(table: string, id: string): Promise<void> {
  const validTable = assertValidTable(table)

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    // Sessao expirou no meio da pagina /perfil. Este action e chamado por um
    // <form action={...}> (botao de deletar), nao por uma navegacao inteira —
    // redirecionar aqui seria abrupto. No-op: o middleware cuida da sessao
    // na proxima navegacao.
    return
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

  const fields: Record<string, string> = {}
  for (const key of EDITABLE_FIELDS[validTable]) {
    const value = formData.get(key)
    if (value !== null) fields[key] = String(value)
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
