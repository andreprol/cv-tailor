import { describe, it, expect, vi, afterEach } from 'vitest'
import { extractTextFromHtml, fetchJobDescription } from '../src/lib/extract-job-text'

describe('extractTextFromHtml', () => {
  it('strips tags, scripts and styles, and collapses whitespace', () => {
    const html = '<html><head><style>.a{color:red}</style></head><body><script>track()</script><h1>Senior TPM</h1><p>Remote   role.</p></body></html>'
    expect(extractTextFromHtml(html)).toBe('Senior TPM Remote role.')
  })
})

describe('fetchJobDescription', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the extracted text on a successful response with enough content', async () => {
    const longText = '<p>' + 'Senior Technical Program Manager remote role. '.repeat(10) + '</p>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(longText) }))

    const result = await fetchJobDescription('https://example.com/job/1')

    expect(result).toContain('Senior Technical Program Manager')
  })

  it('returns null when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('') }))
    expect(await fetchJobDescription('https://example.com/blocked')).toBeNull()
  })

  it('returns null when the extracted text is too short to be a real posting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<p>Login</p>') }))
    expect(await fetchJobDescription('https://example.com/login-wall')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    expect(await fetchJobDescription('https://example.com/timeout')).toBeNull()
  })
})
