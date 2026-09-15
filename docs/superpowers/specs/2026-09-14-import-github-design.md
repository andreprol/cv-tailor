# Importar skills e projetos do GitHub

## Contexto

André descobriu, na prática, que o banco mestre não cobre tecnologias que ele realmente domina
(ex: Python) só porque nunca apareceram num CV importado. Ele quer usar GitHub (API pública real,
diferente do LinkedIn — ver nota abaixo) pra completar o banco automaticamente.

**LinkedIn — fora de escopo agora, ponto de atenção pra Fase 2:** LinkedIn não tem API pública pra
ler perfil de terceiro sem parceria oficial, e raspar viola os termos de uso. Solução por enquanto:
o próprio André exporta o perfil como PDF (LinkedIn → Mais → Salvar como PDF, recurso oficial) e
sobe pelo fluxo de upload de CV **já existente** — zero código novo. Quando o produto virar SaaS,
revisitar (parceria oficial da API do LinkedIn, ou aceitar que cada usuário faz o mesmo export
manual). Registrar isso como decisão consciente, não esquecimento.

## O que muda

### 1. Editar `github_url` no Perfil (não existia)

Hoje `profile.github_url` só foi setado uma vez, direto no banco, na importação inicial — não tem
UI pra editar. Precisa de:

**`src/lib/repository.ts`** — nova função, allowlist explícito (só esses 2 campos, nunca nome/email):

```ts
export async function updateProfile(db: SupabaseClient, userId: string, fields: Partial<Pick<Profile, 'github_url' | 'linkedin_url'>>): Promise<void> {
  const { error } = await db.from('profile').update(fields).eq('user_id', userId)
  if (error) throw error
}
```

**Nova Server Action** `updateProfileAction` (novo arquivo `src/app/actions/profile.ts`) — recebe
`github_url` do form, salva, `revalidatePath('/perfil')`.

**UI** no Perfil: campo de texto com o valor atual (`defaultValue={profile.github_url ?? ''}`) +
botão "Salvar", numa seção nova "GitHub" acima de "Conquistas".

### 2. Importar do GitHub

**`src/lib/github-import.ts`** (novo) — lógica pura, injeta `fetch` como parâmetro (mesmo padrão de
injeção de dependência já usado no projeto pro cliente Anthropic) pra ficar testável sem rede real:

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

Notas de implementação:
- Exclui forks (não é trabalho original do André).
- Falha em buscar linguagem de UM repo não aborta o import inteiro (`fetchFn` retorna `{}` em vez de
  lançar) — só aquele repo não contribui skills, mas ainda vira achievement.
- API pública do GitHub sem autenticação (60 requisições/hora por IP) — suficiente pra uso pessoal
  ocasional (1 import ou update de vez em quando). Se virar limitação real, adicionar um
  `GITHUB_TOKEN` (Personal Access Token) nas env vars é a evolução natural — não precisa agora.
- Cap de 5 páginas (500 repos) só como proteção contra paginação infinita, não expectativa real de
  uso.

**Nova Server Action** `importGithubAction` (mesmo arquivo `src/app/actions/profile.ts`):

```ts
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

Reaproveita `insertAchievements`/`insertSkills` (já `upsert`+`ignoreDuplicates`, feature de dedup de
hoje) — clicar em importar de novo (depois de criar repositórios novos) só adiciona o que for
genuinamente novo, sem duplicar.

**UI**: botão "Importar do GitHub" na mesma seção "GitHub" do Perfil, abaixo do campo de URL. Sem
texto diferente entre primeira vez e atualização — sempre "Importar do GitHub", já que o
comportamento (adiciona só o que for novo) é o mesmo nos dois casos.

## Fora de escopo

- LinkedIn automático (ver nota acima — Fase 2)
- Autenticação com token do GitHub (usar API pública sem auth por enquanto)
- Filtrar repositórios por relevância além de excluir forks (ex: excluir repos sem descrição, sem
  estrelas) — importa tudo que não for fork, usuário edita/apaga depois se quiser (mesma filosofia
  do upload de CV: extração generosa, curadoria manual depois)
- Analisar conteúdo de README além da `description` do repositório

## Testes

`github-import.ts` ganha teste com `fetch` mockado (mesmo padrão de `import-cv.test.ts`, que mocka o
client da Anthropic):
- `extractGithubUsername`: extrai corretamente de `https://github.com/andreprol`,
  `github.com/andreprol/`, `https://github.com/andreprol?tab=repositories` — retorna `null` pra uma
  URL que não é do GitHub.
- `fetchGithubRepos`: filtra forks; pagina corretamente quando a primeira página vem cheia (100
  itens); propaga erro quando a API retorna status não-OK.
- `fetchGithubLanguages`: retorna `{}` (não lança) quando a API retorna status não-OK.
- `buildGithubImport`: com 2 repos mockados (um com linguagem Python, outro com TypeScript+Python),
  confirma que agrega os bytes de Python dos dois repos numa skill só, e gera 2 achievements com
  `company: 'Projeto Pessoal'`.

`updateProfileAction`/`importGithubAction` não ganham teste automatizado — mesma limitação de mock
de Supabase já documentada; verificação manual.
