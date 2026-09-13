import { randomUUID } from 'node:crypto'
import { createClient as createAnonClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '../src/lib/supabase/server'

// Standalone integration check against the LIVE Supabase project — not part of
// `npm test`. It needs real network access and creates/deletes real auth
// users, and it deliberately reads data through an anon-key client (not the
// service role) because testing RLS with the service role "lies": the service
// role bypasses RLS entirely, so it would report success even if RLS were
// missing or misconfigured. This script signs in as a real user and asks
// "what can THIS user see?" — the only way to actually prove RLS is enforced.

async function createTestUser(admin: SupabaseClient, email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user
}

async function main() {
  // tsx does not auto-load .env files, and this reads only from .env.local,
  // matching the convention already used by scripts/import-cv.ts.
  process.loadEnvFile('.env.local')

  const admin = createServiceClient()
  const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const emailA = `rls-test-a-${Date.now()}@example.com`
  const emailB = `rls-test-b-${Date.now()}@example.com`
  // Random per run, not a fixed literal: this script's source is committed to
  // the repo, so a hardcoded password would be a real (if normally
  // short-lived) Supabase auth credential visible to anyone with repo access.
  const password = randomUUID()

  // userA is created before the try so a failure here has nothing to clean up
  // yet. Everything from here on (creating userB, inserting, signing in,
  // reading) runs inside try/finally so any failure still cleans up whatever
  // test users were actually created.
  const userA = await createTestUser(admin, emailA, password)
  const cleanupIds = [userA.id]
  let rlsFailed = false

  try {
    const userB = await createTestUser(admin, emailB, password)
    cleanupIds.push(userB.id)

    const { error: insertError } = await admin.from('skills').insert({
      user_id: userB.id, name: 'Segredo do usuario B', category: 'teste', positioning: ['TPM'],
    })
    if (insertError) throw insertError

    // A fresh, plain in-memory client — not src/lib/supabase/auth-server.ts's
    // cookie-based createClient(), which needs an HTTP request/response cycle
    // to read/write cookies. This script runs outside any request, so it just
    // needs an authenticated client for the duration of the process; a plain
    // anon-key client signed in via signInWithPassword simulates exactly what
    // a real browser session would see under RLS.
    const clientA = createAnonClient(anonUrl, anonKey)
    const { error: signInError } = await clientA.auth.signInWithPassword({ email: emailA, password })
    if (signInError) throw signInError

    const { data: leaked, error: readError } = await clientA.from('skills').select('*').eq('user_id', userB.id)
    if (readError) throw readError

    if (leaked.length > 0) {
      // Not process.exit() here: that would terminate the process immediately
      // and skip the finally block below, leaking both test users (plus
      // userB's "secret" row) into the real Supabase project on every failed
      // run — exactly the run this script exists to catch. Defer the exit
      // until after cleanup has had a chance to run.
      console.error('FALHA: usuario A conseguiu ler skill do usuario B. RLS nao esta protegendo.')
      rlsFailed = true
    } else {
      console.log('OK: usuario A nao consegue ler dado do usuario B (RLS ativa e funcionando).')
    }
  } finally {
    // Promise.allSettled, not sequential awaits: one failed delete must not
    // block the other, and logging (rather than throwing) here keeps a
    // cleanup failure from silently replacing whatever error the try block
    // was already propagating.
    const results = await Promise.allSettled(cleanupIds.map((id) => admin.auth.admin.deleteUser(id)))
    results.forEach((result, i) => {
      // supabase-js's deleteUser() resolves with { error } instead of
      // rejecting for almost every realistic failure (wrong key, already
      // deleted, rate limit, network error) — checking only `status ===
      // 'rejected'` would silently miss those and leave the account live
      // with no output. Check both shapes.
      if (result.status === 'rejected') {
        console.error(`Falha ao deletar usuario de teste ${cleanupIds[i]}:`, result.reason)
      } else if (result.value.error) {
        console.error(`Falha ao deletar usuario de teste ${cleanupIds[i]}:`, result.value.error)
      }
    })
  }

  if (rlsFailed) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
