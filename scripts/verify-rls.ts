import { createClient as createAnonClient } from '@supabase/supabase-js'
import { createServiceClient } from '../src/lib/supabase/server'

// Standalone integration check against the LIVE Supabase project — not part of
// `npm test`. It needs real network access and creates/deletes real auth
// users, and it deliberately reads data through an anon-key client (not the
// service role) because testing RLS with the service role "lies": the service
// role bypasses RLS entirely, so it would report success even if RLS were
// missing or misconfigured. This script signs in as a real user and asks
// "what can THIS user see?" — the only way to actually prove RLS is enforced.
async function main() {
  // tsx does not auto-load .env files, and this reads only from .env.local,
  // matching the convention already used by scripts/import-cv.ts.
  process.loadEnvFile('.env.local')

  const admin = createServiceClient()
  const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const emailA = `rls-test-a-${Date.now()}@example.com`
  const emailB = `rls-test-b-${Date.now()}@example.com`
  const password = 'test-password-123'

  const { data: userA, error: createAError } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true })
  if (createAError) throw createAError
  const { data: userB, error: createBError } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true })
  if (createBError) throw createBError

  try {
    const { error: insertError } = await admin.from('skills').insert({
      user_id: userB.user.id, name: 'Segredo do usuario B', category: 'teste', positioning: ['TPM'],
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

    const { data: leaked, error: readError } = await clientA.from('skills').select('*').eq('user_id', userB.user.id)
    if (readError) throw readError

    if (leaked.length > 0) {
      console.error('FALHA: usuario A conseguiu ler skill do usuario B. RLS nao esta protegendo.')
      process.exit(1)
    }
    console.log('OK: usuario A nao consegue ler dado do usuario B (RLS ativa e funcionando).')
  } finally {
    await admin.auth.admin.deleteUser(userA.user.id)
    await admin.auth.admin.deleteUser(userB.user.id)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
