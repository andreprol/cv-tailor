import type { SupabaseClient } from '@supabase/supabase-js'

export async function uploadCvDocx(db: SupabaseClient, applicationId: string, buffer: Buffer): Promise<string> {
  const path = `${applicationId}.docx`
  const { error } = await db.storage.from('cv-files').upload(path, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: true,
  })
  if (error) throw error
  return path
}

export async function getCvDownloadUrl(db: SupabaseClient, storagePath: string): Promise<string> {
  const { data, error } = await db.storage.from('cv-files').createSignedUrl(storagePath, 60 * 10)
  if (error) throw error
  return data.signedUrl
}
