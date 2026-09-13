import { describe, it, expect, vi } from 'vitest'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import { extractCvData } from '../src/lib/import-cv'

async function buildTestDocx(text: string): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }] })
  return Packer.toBuffer(doc)
}

const emptyResult = { achievements: [], skills: [], education: [], certifications: [] }

describe('extractCvData', () => {
  it('extracts DOCX text via mammoth and sends it as a plain text prompt (stable API, no beta flag needed)', async () => {
    const buffer = await buildTestDocx('Led cloud migration reducing cost by 30%.')
    const goodJson = JSON.stringify({
      achievements: [{ company: 'Acme', roleTitle: 'PM', startDate: '2020-01-01', endDate: null, bullet: 'Led cloud migration reducing cost by 30%.', metric: '30%' }],
      skills: [], education: [], certifications: [],
    })
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: goodJson }] })
    const fakeClient = { messages: { create } } as any

    const result = await extractCvData(fakeClient, 'docx', buffer)

    expect(create).toHaveBeenCalledTimes(1)
    const promptSent = create.mock.calls[0][0].messages[0].content as string
    expect(promptSent).toContain('Led cloud migration reducing cost by 30%.')
    expect(result.achievements[0].bullet).toBe('Led cloud migration reducing cost by 30%.')
  })

  it('sends a PDF as a document block via the beta API', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(emptyResult) }] })
    const fakeClient = { beta: { messages: { create } } } as any

    const result = await extractCvData(fakeClient, 'pdf', Buffer.from('fake-pdf-bytes'))

    expect(create).toHaveBeenCalledTimes(1)
    const sentContent = create.mock.calls[0][0].messages[0].content
    expect(sentContent[0].type).toBe('document')
    expect(create.mock.calls[0][0].betas).toContain('pdfs-2024-09-25')
    expect(result.achievements).toEqual([])
  })

  it('retries once when the first PDF response is not valid JSON, then returns the valid result', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(emptyResult) }] })
    const fakeClient = { beta: { messages: { create } } } as any

    const result = await extractCvData(fakeClient, 'pdf', Buffer.from('fake-pdf-bytes'))

    expect(create).toHaveBeenCalledTimes(2)
    expect(result.achievements).toEqual([])
  })

  it('propagates the error when both attempts fail', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] })
    const fakeClient = { beta: { messages: { create } } } as any

    await expect(extractCvData(fakeClient, 'pdf', Buffer.from('fake-pdf-bytes'))).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(2)
  })
})
