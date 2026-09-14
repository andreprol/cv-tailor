import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getApplicationDetail, getProfile } from '@/lib/repository'
import { generatedCvSchema } from '@/lib/generation-schema'
import { renderCvPdf, sanitizeFilename } from '@/lib/pdf-template'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return NextResponse.json({ error: 'Sessao expirada. Faca login novamente.' }, { status: 401 })
  }

  const db = createServiceClient()

  let application
  let cvVersion
  try {
    const detail = await getApplicationDetail(db, id, userId)
    application = detail.application
    cvVersion = detail.cvVersion
  } catch (error) {
    console.error('GET /applications/[id]/pdf: candidatura nao encontrada:', error)
    return NextResponse.json({ error: 'Candidatura nao encontrada.' }, { status: 404 })
  }

  if (!cvVersion) {
    return NextResponse.json({ error: 'Nenhum CV gerado para essa candidatura ainda.' }, { status: 404 })
  }

  const content = generatedCvSchema.parse(cvVersion.generated_json)
  const profile = await getProfile(db, userId)
  const pdfBuffer = await renderCvPdf(profile, content)

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="CV-${sanitizeFilename(application.company)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
