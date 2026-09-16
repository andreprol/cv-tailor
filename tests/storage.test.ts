import { describe, it, expect, vi } from 'vitest'
import { uploadCvDocx } from '../src/lib/storage'

describe('uploadCvDocx', () => {
  it('disables Storage/CDN caching on upload, so a regenerated CV is never served stale from a previous cache-control window', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const db = { storage: { from: vi.fn().mockReturnValue({ upload }) } } as any

    await uploadCvDocx(db, 'app-1', Buffer.from('bytes'))

    expect(db.storage.from).toHaveBeenCalledWith('cv-files')
    expect(upload).toHaveBeenCalledWith('app-1.docx', expect.any(Buffer), expect.objectContaining({ upsert: true, cacheControl: '0' }))
  })

  it('throws when the Storage upload fails', async () => {
    const upload = vi.fn().mockResolvedValue({ error: new Error('boom') })
    const db = { storage: { from: vi.fn().mockReturnValue({ upload }) } } as any

    await expect(uploadCvDocx(db, 'app-1', Buffer.from('bytes'))).rejects.toThrow('boom')
  })
})
