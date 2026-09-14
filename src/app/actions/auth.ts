'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/auth-server'

export interface AuthActionState {
  error: string | null
  message: string | null
}

export async function getOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  const headerList = await headers()
  const origin = headerList.get('origin')
  if (origin) {
    return origin
  }
  // Server Actions don't reliably send an `origin` header (e.g. a <form>
  // submitted without JS), and a stray dev machine's localhost here would
  // silently redirect real users' OAuth/magic-link logins to that machine.
  // NEXT_PUBLIC_SITE_URL must be set in any deployed environment; only a
  // bare local dev run (no env, no header) falls through to this default.
  return 'http://localhost:3000'
}

export async function signInWithPasswordAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: 'Email ou senha invalidos.', message: null }
  }
  redirect('/')
}

export async function signUpWithPasswordAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const supabase = await createClient()
  const origin = await getOrigin()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })
  if (error) {
    console.error('signUpWithPasswordAction: falha no signup Supabase:', error)
    return { error: 'Nao foi possivel criar a conta. Tente novamente.', message: null }
  }
  return { error: null, message: 'Conta criada. Confira seu email pra confirmar antes de entrar.' }
}

export async function signInWithMagicLinkAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const supabase = await createClient()
  const origin = await getOrigin()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })
  if (error) {
    console.error('signInWithMagicLinkAction: falha ao enviar magic link Supabase:', error)
    return { error: 'Nao foi possivel enviar o link. Tente novamente.', message: null }
  }
  return { error: null, message: 'Link enviado. Confira seu email.' }
}

export async function signInWithGoogleAction(_prevState: AuthActionState, _formData: FormData): Promise<AuthActionState> {
  const supabase = await createClient()
  const origin = await getOrigin()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  })
  if (error || !data.url) {
    console.error('signInWithGoogleAction: falha ao iniciar login com Google Supabase:', error)
    return { error: 'Nao foi possivel iniciar login com Google.', message: null }
  }
  redirect(data.url)
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('signOutAction: falha ao encerrar sessao Supabase:', error)
  }
  redirect('/login')
}
