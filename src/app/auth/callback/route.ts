import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/auth-server'
import { getOrigin } from '@/app/actions/auth'

function sanitizeNext(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith('/') || rawNext.startsWith('//')) {
    return '/'
  }
  return rawNext
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitizeNext(searchParams.get('next'))
  const origin = await getOrigin()

  if (code) {
    const supabase = await createClient()
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`)
      }
      console.error('GET /auth/callback: falha ao trocar code por sessao Supabase:', error)
    } catch (error) {
      console.error('GET /auth/callback: excecao ao trocar code por sessao Supabase:', error)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
