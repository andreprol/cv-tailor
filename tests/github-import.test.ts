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
