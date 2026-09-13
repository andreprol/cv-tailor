import { describe, it, expect, vi } from 'vitest'
import { extractJobDescriptionFromImage } from '../src/lib/extract-job-image'

// A minimal valid 1x1 black PNG, used as a real (not fake) image buffer.
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('extractJobDescriptionFromImage', () => {
  it('sends the image as a base64 image content block and returns the extracted text', async () => {
    const buffer = Buffer.from(TINY_PNG_BASE64, 'base64')
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Vaga de Senior TPM na Acme Corp...' }] })
    const fakeClient = { messages: { create } } as any

    const result = await extractJobDescriptionFromImage(fakeClient, buffer, 'image/png')

    expect(create).toHaveBeenCalledTimes(1)
    const sentContent = create.mock.calls[0][0].messages[0].content
    expect(sentContent[0].type).toBe('image')
    expect(sentContent[0].source.media_type).toBe('image/png')
    expect(sentContent[0].source.data).toBe(TINY_PNG_BASE64)
    expect(result).toBe('Vaga de Senior TPM na Acme Corp...')
  })

  it('finds the text block by type instead of assuming index 0', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: 'Texto da vaga extraido' }],
      stop_reason: 'end_turn',
    })
    const fakeClient = { messages: { create } } as any

    const result = await extractJobDescriptionFromImage(fakeClient, Buffer.from('x'), 'image/jpeg')

    expect(result).toBe('Texto da vaga extraido')
  })

  it('retries once when the first response has no text block, then returns the retry result', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'max_tokens' })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Texto recuperado na segunda tentativa' }] })
    const fakeClient = { messages: { create } } as any

    const result = await extractJobDescriptionFromImage(fakeClient, Buffer.from('x'), 'image/png')

    expect(create).toHaveBeenCalledTimes(2)
    expect(result).toBe('Texto recuperado na segunda tentativa')
  })

  it('throws a clear error when both attempts produce no text block', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'max_tokens' })
    const fakeClient = { messages: { create } } as any

    await expect(extractJobDescriptionFromImage(fakeClient, Buffer.from('x'), 'image/png')).rejects.toThrow(/nao retornou nenhum bloco de texto/)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('throws when the extracted text is empty after trimming', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '   ' }] })
    const fakeClient = { messages: { create } } as any

    await expect(extractJobDescriptionFromImage(fakeClient, Buffer.from('x'), 'image/png')).rejects.toThrow()
  })
})
