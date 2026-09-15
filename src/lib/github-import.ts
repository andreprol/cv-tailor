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
  const res = await fetchFn(`https://api.github.com/repos/${username}/${encodeURIComponent(repo)}/languages`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (res.status === 403 || res.status === 429) {
    throw new Error(`GitHub API retornou ${res.status} (provavel rate limit) ao buscar linguagens de "${username}/${repo}".`)
  }
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
