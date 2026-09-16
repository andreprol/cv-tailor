import type { SupabaseClient } from '@supabase/supabase-js'

export async function uploadCvDocx(db: SupabaseClient, applicationId: string, buffer: Buffer): Promise<string> {
  const path = `${applicationId}.docx`
  const { error } = await db.storage.from('cv-files').upload(path, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: true,
    // Every regeneration for the same application overwrites this same path.
    // supabase-js defaults cacheControl to '3600' when omitted, which writes
    // Cache-Control: max-age=3600 onto the object — the CDN in front of
    // Storage can then keep serving the PREVIOUS file's bytes for up to an
    // hour after a fresh upsert, even though the signed URL's query token
    // changed (real bug: André regenerated a CV right after this session's
    // template redesign deployed and downloaded the old, pre-redesign
    // formatting). Disable caching so every download reflects the latest
    // upload immediately.
    cacheControl: '0',
  })
  if (error) throw error
  return path
}

export async function getCvDownloadUrl(db: SupabaseClient, storagePath: string): Promise<string> {
  const { data, error } = await db.storage.from('cv-files').createSignedUrl(storagePath, 60 * 10)
  if (error) throw error
  return data.signedUrl
}
