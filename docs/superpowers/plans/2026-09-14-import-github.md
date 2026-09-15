# Importar skills e projetos do GitHub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o André editar a URL do GitHub no Perfil e importar skills (linguagens) + conquistas (repositórios) automaticamente de lá, completando o banco mestre sem depender só de upload de CV.

**Architecture:** `github-import.ts` (novo, lógica pura injetando `fetch`) busca repositórios públicos não-fork e suas linguagens via API pública do GitHub. `updateProfileAction`/`importGithubAction` (novos, `src/app/actions/profile.ts`) ligam isso ao banco — reaproveitando `insertAchievements`/`insertSkills` (já com dedup automático). Um componente novo no Perfil (`GithubSection`) expõe os dois formulários (editar URL, importar).

**Tech Stack:** Next.js 15 Server Actions, `fetch` nativo (sem SDK novo), Vitest com `fetch` mockado por injeção de dependência (mesmo padrão do cliente Anthropic no projeto).

---

### Task 1: `updateProfile` no repository

**Files:**
- Modify: `cv-tailor/src/lib/repository.ts`

- [ ] **Step 1: Adicionar a função**

Logo depois de `getProfile` (perto do topo do arquivo), adicionar:

```ts
export async function updateProfile(db: SupabaseClient, userId: string, fields: Partial<Pick<Profile, 'github_url' | 'linkedin_url'>>): Promise<void> {
  const { error } = await db.from('profile').update(fields).eq('user_id', userId)
  if (error) throw error
}
```

O tipo `Partial<Pick<Profile, 'github_url' | 'linkedin_url'>>` é um allowlist explícito no próprio
tipo — impossível chamar essa função tentando mudar `full_name`/`email`/etc, mesmo por engano.
`Profile` já está importado em `repository.ts` (usado por `getProfile`).

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/lib/repository.ts
git commit -m "feat(cv-tailor): adiciona updateProfile (github_url/linkedin_url) ao repository"
```

---

### Task 2: `github-import.ts` — lógica de importação (TDD)

**Files:**
- Create: `cv-tailor/src/lib/github-import.ts`
- Test: `cv-tailor/tests/github-import.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `cv-tailor/tests/github-import.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { extractGithubUsername, fetchGithubRepos, fetchGithubLanguages, buildGithubImport } from '../src/lib/github-import'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as Response
}

describe('extractGithubUsername', () => {
  it('extracts the username from common URL shapes', () => {
    expect(extractGithubUsername('https://github.com/andreprol')).toBe('andreprol')
    expect(extractGithubUsername('github.com/andreprol/')).toBe('andreprol')
    expect(extractGithubUsername('https://github.com/andreprol?tab=repositories')).toBe('andreprol')
  })

  it('returns null for a non-GitHub URL', () => {
    expect(extractGithubUsername('https://linkedin.com/in/andreprol')).toBeNull()
  })
})

describe('fetchGithubRepos', () => {
  it('filters out forks', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([
      { name: 'real-project', description: 'A real one', fork: false, created_at: '2023-01-01T00:00:00Z' },
      { name: 'forked-project', description: null, fork: true, created_at: '2023-02-01T00:00:00Z' },
    ]))

    const repos = await fetchGithubRepos('andreprol', fetchFn)

    expect(repos).toHaveLength(1)
    expect(repos[0].name).toBe('real-project')
  })

  it('paginates when the first page comes back full', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ name: `repo-${i}`, description: null, fork: false, created_at: '2023-01-01T00:00:00Z' }))
    const page2 = [{ name: 'repo-100', description: null, fork: false, created_at: '2023-01-01T00:00:00Z' }]
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2))

    const repos = await fetchGithubRepos('andreprol', fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(repos).toHaveLength(101)
  })

  it('throws when the API returns a non-OK status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, false, 404))

    await expect(fetchGithubRepos('nao-existe', fetchFn)).rejects.toThrow('404')
  })
})

describe('fetchGithubLanguages', () => {
  it('returns an empty object instead of throwing on a non-OK status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, false, 500))

    const languages = await fetchGithubLanguages('andreprol', 'algum-repo', fetchFn)

    expect(languages).toEqual({})
  })
})

describe('buildGithubImport', () => {
  it('aggregates languages across repos and builds Projeto Pessoal achievements', async () => {
    const repos = [
      { name: 'repo-a', description: 'Repo A description', fork: false, created_at: '2023-01-15T00:00:00Z' },
      { name: 'repo-b', description: null, fork: false, created_at: '2023-06-01T00:00:00Z' },
    ]
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse(repos))
      .mockResolvedValueOnce(jsonResponse({ Python: 1000, TypeScript: 500 }))
      .mockResolvedValueOnce(jsonResponse({ Python: 300 }))

    const result = await buildGithubImport('andreprol', fetchFn)

    expect(result.achievements).toEqual([
      { company: 'Projeto Pessoal', roleTitle: 'repo-a', startDate: '2023-01-15', endDate: null, bullet: 'Repo A description', metric: null },
      { company: 'Projeto Pessoal', roleTitle: 'repo-b', startDate: '2023-06-01', endDate: null, bullet: 'Repositório no GitHub.', metric: null },
    ])
    expect(result.skills).toEqual(
      expect.arrayContaining([
        { name: 'Python', category: 'Linguagem de Programação' },
        { name: 'TypeScript', category: 'Linguagem de Programação' },
      ]),
    )
    expect(result.skills).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd cv-tailor && npx vitest run tests/github-import.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/github-import'`

- [ ] **Step 3: Implementar `github-import.ts`**

```ts
export function extractGithubUsername(url: string): string | null {
  const match = url.match(/github\.com\/([^/?#]+)/i)
  return match ? match[1] : null
}

interface GithubRepo {
  name: string
  description: string | null
  fork: boolean
  created_at: string
}

export async function fetchGithubRepos(username: string, fetchFn: typeof fetch = fetch): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = []
  let page = 1
  while (page <= 5) {
    const res = await fetchFn(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`GitHub API retornou ${res.status} ao listar repositorios de "${username}".`)
    const batch = (await res.json()) as GithubRepo[]
    repos.push(...batch)
    if (batch.length < 100) break
    page++
  }
  return repos.filter((r) => !r.fork)
}

export async function fetchGithubLanguages(username: string, repo: string, fetchFn: typeof fetch = fetch): Promise<Record<string, number>> {
  const res = await fetchFn(`https://api.github.com/repos/${username}/${repo}/languages`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) return {}
  return res.json()
}

export interface GithubImportResult {
  achievements: { company: string; roleTitle: string; startDate: string; endDate: null; bullet: string; metric: null }[]
  skills: { name: string; category: string }[]
}

export async function buildGithubImport(username: string, fetchFn: typeof fetch = fetch): Promise<GithubImportResult> {
  const repos = await fetchGithubRepos(username, fetchFn)

  const achievements = repos.map((r) => ({
    company: 'Projeto Pessoal',
    roleTitle: r.name,
    startDate: r.created_at.slice(0, 10),
    endDate: null,
    bullet: r.description?.trim() || 'Repositório no GitHub.',
    metric: null,
  }))

  const languageTotals = new Map<string, number>()
  for (const repo of repos) {
    const languages = await fetchGithubLanguages(username, repo.name, fetchFn)
    for (const [lang, bytes] of Object.entries(languages)) {
      languageTotals.set(lang, (languageTotals.get(lang) ?? 0) + bytes)
    }
  }
  const skills = Array.from(languageTotals.keys()).map((name) => ({ name, category: 'Linguagem de Programação' }))

  return { achievements, skills }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd cv-tailor && npx vitest run tests/github-import.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd cv-tailor && npx vitest run`
Expected: PASS (todos)

- [ ] **Step 6: Commit**

```bash
git add cv-tailor/src/lib/github-import.ts cv-tailor/tests/github-import.test.ts
git commit -m "feat(cv-tailor): adiciona github-import.ts (busca repos/linguagens da API publica)"
```

---

### Task 3: Server Actions `updateProfileAction` e `importGithubAction`

**Files:**
- Create: `cv-tailor/src/app/actions/profile.ts`

- [ ] **Step 1: Criar o arquivo**

```ts
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
  const profile = await getProfile(db, userId)

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
```

Notas de implementação:
- `insertAchievements`/`insertSkills` já existem em `src/lib/repository.ts` (feature de dedup
  implementada mais cedo hoje) — `upsert` com `ignoreDuplicates: true`, retornam `Promise<number>`
  (linhas realmente inseridas). Chamar de novo com repositórios já importados não duplica nada.
- `positioning` passado como `[]` (array vazio) — igual ao upload de CV, essa importação não coleta
  tags de positioning.

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/app/actions/profile.ts
git commit -m "feat(cv-tailor): adiciona updateProfileAction e importGithubAction"
```

---

### Task 4: UI — seção "GitHub" no Perfil

**Files:**
- Create: `cv-tailor/src/app/perfil/github-section.tsx`
- Modify: `cv-tailor/src/app/perfil/page.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { useActionState } from 'react'
import { updateProfileAction, importGithubAction, type UpdateProfileState, type ImportGithubState } from '@/app/actions/profile'

const initialUpdateState: UpdateProfileState = { error: null, savedAt: 0 }
const initialImportState: ImportGithubState = { error: null, message: null }

export function GithubSection({ githubUrl }: { githubUrl: string | null }) {
  const [updateState, updateFormAction, updatePending] = useActionState(updateProfileAction, initialUpdateState)
  const [importState, importFormAction, importPending] = useActionState(importGithubAction, initialImportState)

  return (
    <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
      <form action={updateFormAction} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="github_url">URL do GitHub</label>
          <input id="github_url" name="github_url" type="url" defaultValue={githubUrl ?? ''} placeholder="https://github.com/seu-usuario" />
        </div>
        <button type="submit" disabled={updatePending} className="btn btn-secondary">
          {updatePending ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
      {updateState.error && <div className="alert alert-error" role="alert" style={{ marginTop: 8 }}>{updateState.error}</div>}

      <form action={importFormAction} style={{ marginTop: 12 }}>
        <button type="submit" disabled={importPending} className="btn btn-primary">
          {importPending ? 'Importando…' : 'Importar do GitHub'}
        </button>
      </form>
      {importState.error && <div className="alert alert-error" role="alert" style={{ marginTop: 8 }}>{importState.error}</div>}
      {importState.message && <div className="alert alert-info" role="status" style={{ marginTop: 8 }}>{importState.message}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Buscar `profile` e renderizar a seção em `perfil/page.tsx`**

Localizar, no topo do arquivo:

```ts
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getMasterDataBank } from '@/lib/repository'
import { UploadCvForm } from './upload-cv-form'
import { ProfileItemList, type ProfileItem } from './profile-item-list'
import { AddProfileItemForm } from './add-profile-item-form'
```

Trocar por (adiciona `getProfile` e o import do componente novo):

```ts
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getMasterDataBank, getProfile } from '@/lib/repository'
import { UploadCvForm } from './upload-cv-form'
import { ProfileItemList, type ProfileItem } from './profile-item-list'
import { AddProfileItemForm } from './add-profile-item-form'
import { GithubSection } from './github-section'
```

Localizar:

```ts
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  const masterData = await getMasterDataBank(db, userId)
```

Trocar por:

```ts
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  const masterData = await getMasterDataBank(db, userId)
  const profile = await getProfile(db, userId)
```

Localizar:

```tsx
      <UploadCvForm />

      <h2>Conquistas</h2>
```

Trocar por:

```tsx
      <UploadCvForm />

      <h2>GitHub</h2>
      <GithubSection githubUrl={profile.github_url} />

      <h2>Conquistas</h2>
```

- [ ] **Step 3: Rodar `tsc --noEmit` e `npm run build`**

Run: `cd cv-tailor && npx tsc --noEmit && npm run build`
Expected: sem erros, build completo

- [ ] **Step 4: Commit**

```bash
git add cv-tailor/src/app/perfil/github-section.tsx cv-tailor/src/app/perfil/page.tsx
git commit -m "feat(cv-tailor): adiciona secao GitHub no Perfil (editar URL + importar)"
```

---

### Task 5: Verificação manual contra o GitHub/Supabase reais

**Não é subagent** — precisa de sessão logada e chamadas reais à API pública do GitHub.

- [ ] **Step 1: Salvar a URL do GitHub**

No Perfil, seção "GitHub", colar `https://github.com/andreprol` (ou o usuário real do André) e
clicar "Salvar" — confirmar que persiste (recarregar a página e ver o campo preenchido).

- [ ] **Step 2: Importar**

Clicar "Importar do GitHub" — confirmar que aparece a mensagem "Importado: N repositorios novos, M
linguagens novas" e que novas conquistas/skills aparecem nas listas correspondentes do Perfil.

- [ ] **Step 3: Confirmar que Python (ou a linguagem real que faltava) apareceu**

Conferir na lista de Skills que a linguagem que motivou essa feature (Python, no caso do André)
agora está lá.

- [ ] **Step 4: Clicar "Importar do GitHub" de novo**

Confirmar que não duplica nada — a mensagem deve reportar 0 repositórios novos e 0 linguagens novas
(supondo que nada mudou no GitHub entre os cliques).

- [ ] **Step 5: Testar o caso de URL vazia**

Com o campo de URL do GitHub vazio, clicar "Importar do GitHub" direto — confirmar que mostra "Salve
a URL do GitHub no perfil antes de importar." em vez de quebrar.

---

## Fora de escopo (confirmado na spec)

- LinkedIn automático (Fase 2)
- Autenticação com token do GitHub
- Filtrar repositórios além de excluir forks
- Analisar conteúdo de README
