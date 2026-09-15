'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getProfile, updateProfile, insertAchievements, insertSkills } from '@/lib/repository'
import { extractGithubUsername, buildGithubImport } from '@/lib/github-import'

export interface UpdateProfileState {
  error: string | null
  savedAt: number
}

export async function updateProfileAction(_prevState: UpdateProfileState, formData: FormData): Promise<UpdateProfileState> {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', savedAt: _prevState.savedAt }
  }

  const githubUrl = String(formData.get('github_url') ?? '').trim() || null

  const db = createServiceClient()
  try {
    await updateProfile(db, userId, { github_url: githubUrl })
  } catch (error) {
    console.error('updateProfileAction: falha ao salvar perfil:', error)
    return { error: 'Erro ao salvar. Tente novamente.', savedAt: _prevState.savedAt }
  }

  revalidatePath('/perfil')
  return { error: null, savedAt: Date.now() }
}

export interface ImportGithubState {
  error: string | null
  message: string | null
}

export async function importGithubAction(_prevState: ImportGithubState, _formData: FormData): Promise<ImportGithubState> {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', message: null }
  }

  const db = createServiceClient()

  let profile
  try {
    profile = await getProfile(db, userId)
  } catch (error) {
    console.error('importGithubAction: falha ao carregar perfil:', error)
    return { error: 'Erro ao carregar perfil. Tente novamente.', message: null }
  }

  if (!profile.github_url) {
    return { error: 'Salve a URL do GitHub no perfil antes de importar.', message: null }
  }
  const username = extractGithubUsername(profile.github_url)
  if (!username) {
    return { error: 'URL do GitHub invalida — use o formato https://github.com/seu-usuario.', message: null }
  }

  try {
    const { achievements, skills } = await buildGithubImport(username)
    const insertedAchievements = achievements.length ? await insertAchievements(db, userId, [], achievements) : 0
    const insertedSkills = skills.length ? await insertSkills(db, userId, [], skills) : 0
    revalidatePath('/perfil')
    return {
      error: null,
      message: `Importado: ${insertedAchievements} repositorios novos, ${insertedSkills} linguagens novas. (Repositorios/linguagens ja importados antes foram ignorados automaticamente.)`,
    }
  } catch (error) {
    console.error('importGithubAction: falha ao importar do GitHub:', error)
    return { error: 'Erro ao importar do GitHub. Tente novamente em instantes.', message: null }
  }
}
