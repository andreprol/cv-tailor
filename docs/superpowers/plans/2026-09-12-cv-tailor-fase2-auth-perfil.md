# CV Tailor — Fase 2: Autenticação + Perfil/Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Tasks 2 and 10 are NOT subagent tasks.** They require the human (André) to act outside the codebase (paste credentials, sign up for a real account) and require an explicit pause-and-confirm before touching production data per the project's risk protocol. The controller (you, running this plan) must handle those two directly — do not dispatch a subagent for them.

**Goal:** Replace the hardcoded single-user `DEFAULT_USER_ID` with real Supabase Auth (magic link + Google OAuth + email/password) and add a self-service "Perfil" area where any user uploads a CV (PDF or DOCX), gets it extracted into their own master data bank tagged by positioning (`TPM`/`AI Product`/`Web3`), and can view/edit/delete/append to that bank over time.

**Architecture:** `@supabase/ssr` cookie-based client + Next.js middleware for session/route protection; auth actions and the CV-import pipeline (PDF via Claude's document API, DOCX via `mammoth` text extraction) run as Server Actions; every table gets a real FK to `auth.users` plus RLS policies as a second layer behind the existing per-request `user_id` filter.

**Tech Stack:** Next.js 15 App Router, `@supabase/ssr`, `@anthropic-ai/sdk` (stable + `beta` namespace), `mammoth`, `zod`, `docx`, Vitest.

---

## Spec coverage check (self-review before tasks)

Every requirement in [docs/superpowers/specs/2026-09-12-cv-tailor-fase2-auth-perfil-design.md](../specs/2026-09-12-cv-tailor-fase2-auth-perfil-design.md) maps to a task below:

- 3 login methods → Tasks 5, 7
- Route protection / session → Task 4
- Real `user_id` (FK + RLS) replacing `DEFAULT_USER_ID` → Tasks 9, 10, 11
- Upload PDF/DOCX, tag by positioning chosen at upload time → Tasks 13, 14, 15, 16, 19
- View/edit/delete/reupload (append) on the master data bank → Tasks 15, 17, 19
- Revision optional (not a gate) → Task 19 (perfil is a normal nav page, never forced)
- RLS actually verified with anon key, not service role → Task 12
- CLI importer stays usable, DRY with the new lib → Task 20
- Live E2E proof → Task 21
- Final review → Task 22

---

### Task 1: Add new dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `@supabase/ssr` and `mammoth`**

Edit `package.json` `dependencies`:

```json
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.12.7",
    "@anthropic-ai/sdk": "^0.32.0",
    "docx": "^9.0.2",
    "mammoth": "^1.12.3",
    "zod": "^3.23.8"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: installs `@supabase/ssr` and `mammoth` with no errors, `package-lock.json` updated.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(cv-tailor): add @supabase/ssr and mammoth deps for Fase 2"
```

---

### Task 2: 🧑 Manual — get Supabase anon key + set up Google OAuth (NOT a subagent task)

This is a checklist for the human controller to walk André through — no code changes. Do this before Task 3.

- [ ] **Step 1: Get the Supabase anon/public key**

Ask André to open the Supabase dashboard for the CV Tailor project → Project Settings → API → copy the **`anon` `public`** key (NOT the service role key — this one is safe to expose to the browser by design). Ask him to paste it into `.env.local` as a new line:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=<cole aqui>
```

- [ ] **Step 2: Add the same var to Vercel**

Ask André to add `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same value) to the Vercel project's Environment Variables (Production + Preview), or run it yourself if `vercel` CLI is authenticated:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
```

- [ ] **Step 3: Enable email/password + magic link providers**

In Supabase dashboard → Authentication → Providers → Email: confirm "Email" provider is enabled (it is by default) and that both "Confirm email" (for password signup) and the magic-link OTP flow are on.

- [ ] **Step 4: Set up Google OAuth**

Ask André to:
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create (or reuse) a project → "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth client ID" → type "Web application".
2. Authorized redirect URI: `<SUPABASE_PROJECT_URL>/auth/v1/callback` (Supabase shows this exact URL on its own Google provider settings page).
3. Copy the generated Client ID and Client Secret.
4. In Supabase dashboard → Authentication → Providers → Google: paste Client ID + Client Secret, enable the provider.

- [ ] **Step 5: Confirm before continuing**

Confirm with André that steps 1-4 are done (anon key pasted, Google provider enabled) before starting Task 3 — Tasks 3+ assume `NEXT_PUBLIC_SUPABASE_ANON_KEY` exists and Google is enabled.

---

### Task 3: Auth-aware Supabase server client

**Files:**
- Create: `src/lib/supabase/auth-server.ts`

- [ ] **Step 1: Write the client + current-user helper**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component (cookies are read-only there) —
            // middleware.ts refreshes the session cookie on every request instead.
          }
        },
      },
    },
  )
}

export async function getCurrentUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Nao autenticado.')
  }
  return user.id
}
```

This file is a thin wrapper around `@supabase/ssr` (cookie plumbing) — same convention as `src/lib/supabase/server.ts`, which also has no direct unit test in this codebase and is verified live instead (Task 21).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (this file isn't imported anywhere yet, but must compile standalone).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/auth-server.ts
git commit -m "feat(cv-tailor): add cookie-based Supabase auth client"
```

---

### Task 4: Middleware for session refresh + route protection

**Files:**
- Create: `src/middleware.ts`

This project uses the `src/` directory (`src/app`), so Next.js requires `middleware.ts` inside `src/`, not at the project root — a root-level `middleware.ts` alongside `src/app` is silently ignored.

- [ ] **Step 1: Write the middleware**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/auth/callback']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(cv-tailor): protect routes with Supabase auth middleware"
```

---

### Task 5: Auth Server Actions

**Files:**
- Create: `src/app/actions/auth.ts`

- [ ] **Step 1: Write the actions**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/auth-server'

export interface AuthActionState {
  error: string | null
  message: string | null
}

async function getOrigin(): Promise<string> {
  const headerList = await headers()
  return headerList.get('origin') ?? 'http://localhost:3056'
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
    return { error: error.message, message: null }
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
    return { error: error.message, message: null }
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
    return { error: error?.message ?? 'Nao foi possivel iniciar login com Google.', message: null }
  }
  redirect(data.url)
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/auth.ts
git commit -m "feat(cv-tailor): add sign-in/sign-up/magic-link/OAuth/sign-out actions"
```

---

### Task 6: Auth callback route

**Files:**
- Create: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Write the route handler**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/auth-server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat(cv-tailor): add OAuth/magic-link callback route"
```

---

### Task 7: Login page UI

**Files:**
- Create: `src/app/login/page.tsx`
- Modify: `src/app/globals.css` (append)

- [ ] **Step 1: Add CSS for the auth form**

Append to `src/app/globals.css`:

```css
/* ---------- auth ---------- */

.auth-form { max-width: 400px; margin: var(--space-7) auto 0; }

.auth-divider {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: var(--space-4) 0;
}

.link-button {
  background: none;
  border: none;
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  padding: 0;
}

.alert-info { background: var(--surface-2); color: var(--text); }
```

- [ ] **Step 2: Write the login page**

```tsx
'use client'

import { useActionState, useState } from 'react'
import {
  signInWithPasswordAction,
  signUpWithPasswordAction,
  signInWithMagicLinkAction,
  signInWithGoogleAction,
  type AuthActionState,
} from '@/app/actions/auth'

const initialState: AuthActionState = { error: null, message: null }

export default function LoginPage() {
  const [showMagicLink, setShowMagicLink] = useState(false)
  const [passwordState, passwordAction, passwordPending] = useActionState(signInWithPasswordAction, initialState)
  const [signUpState, signUpAction, signUpPending] = useActionState(signUpWithPasswordAction, initialState)
  const [magicLinkState, magicLinkAction, magicLinkPending] = useActionState(signInWithMagicLinkAction, initialState)
  const [googleState, googleAction, googlePending] = useActionState(signInWithGoogleAction, initialState)

  return (
    <main className="container">
      <div className="auth-form">
        <h1 style={{ textAlign: 'center' }}>Entrar no CV Tailor</h1>

        <form action={googleAction} className="card">
          {googleState.error && <div className="alert alert-error" role="alert">{googleState.error}</div>}
          <button type="submit" disabled={googlePending} className="btn btn-secondary btn-block">
            {googlePending ? 'Redirecionando…' : 'Continuar com Google'}
          </button>
        </form>

        <div className="auth-divider">ou</div>

        {!showMagicLink ? (
          <form className="card">
            {(passwordState.error || signUpState.error) && (
              <div className="alert alert-error" role="alert">{passwordState.error ?? signUpState.error}</div>
            )}
            {signUpState.message && <div className="alert alert-info" role="status">{signUpState.message}</div>}

            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Senha</label>
              <input id="password" name="password" type="password" required minLength={6} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" formAction={passwordAction} disabled={passwordPending} className="btn btn-primary" style={{ flex: 1 }}>
                {passwordPending ? 'Entrando…' : 'Entrar'}
              </button>
              <button type="submit" formAction={signUpAction} disabled={signUpPending} className="btn btn-secondary" style={{ flex: 1 }}>
                {signUpPending ? 'Criando…' : 'Criar conta'}
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" onClick={() => setShowMagicLink(true)} className="link-button">
                Prefiro receber um link mágico por email
              </button>
            </div>
          </form>
        ) : (
          <form action={magicLinkAction} className="card">
            {magicLinkState.error && <div className="alert alert-error" role="alert">{magicLinkState.error}</div>}
            {magicLinkState.message && <div className="alert alert-info" role="status">{magicLinkState.message}</div>}

            <div className="field">
              <label htmlFor="magic-email">Email</label>
              <input id="magic-email" name="email" type="email" required />
            </div>
            <button type="submit" disabled={magicLinkPending} className="btn btn-primary btn-block">
              {magicLinkPending ? 'Enviando…' : 'Enviar link mágico'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" onClick={() => setShowMagicLink(false)} className="link-button">
                Prefiro usar senha
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (this page isn't reachable from anywhere yet except by direct URL — that's fine, wired in Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/app/globals.css
git commit -m "feat(cv-tailor): add login page (Google + password + magic link)"
```

---

### Task 8: Wire sign-out + nav into the layout

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css` (append)

- [ ] **Step 1: Add nav CSS**

Append to `src/app/globals.css`:

```css
.app-nav { display: flex; gap: var(--space-4); align-items: center; }
```

- [ ] **Step 2: Make the layout auth-aware**

Replace the full contents of `src/app/layout.tsx`:

```tsx
import { Outfit } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { signOutAction } from '@/app/actions/auth'

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '500', '600', '700'] })

export const metadata = {
  title: { default: 'CV Tailor', template: '%s · CV Tailor' },
  description: 'Currículos sob medida por vaga, seguros contra parsing de ATS.',
}

async function isLoggedIn(): Promise<boolean> {
  try {
    await getCurrentUserId()
    return true
  } catch {
    return false
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = await isLoggedIn()

  return (
    <html lang="pt-BR" className={outfit.variable}>
      <body>
        <header className="app-header">
          <div className="app-header__inner">
            <Link href="/" className="brand">
              <span className="brand__mark">CV</span>
              CV Tailor
            </Link>
            {loggedIn && (
              <nav className="app-nav">
                <Link href="/perfil" className="hint">Perfil</Link>
                <form action={signOutAction}>
                  <button type="submit" className="btn btn-secondary">Sair</button>
                </form>
              </nav>
            )}
          </div>
        </header>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(cv-tailor): show Perfil/Sair nav when logged in"
```

---

### Task 9: 🧑 Manual checkpoint — André signs up for a real account (NOT a subagent task)

Do NOT proceed to Task 10 until this is done and confirmed. This is a human step, not a subagent step.

- [ ] **Step 1: Run the app locally (or use the Vercel preview URL from this branch)**

```bash
npm run dev
```

- [ ] **Step 2: Ask André to sign up**

Have André open `/login` and create his real account with whichever method he prefers (password is simplest to verify immediately without waiting on email).

- [ ] **Step 3: Get his real `auth.users` id**

In Supabase dashboard → Authentication → Users, find André's row and copy the `UID` column. Confirm the email matches.

- [ ] **Step 4: Confirm before continuing**

Report the real UUID back and get explicit confirmation before Task 10 — Task 10 needs this exact value to migrate the existing Fase 1 data instead of orphaning it.

---

### Task 10: ⚠️ Migration — reassign existing data, add FK + RLS (HIGH RISK, pause for confirmation)

**Files:**
- Create: `supabase/migrations/0002_auth_and_rls.sql`

This touches production data (André's real Fase 1 candidaturas) and enables RLS for the first time. Per the project's risk protocol, this is a HIGH-risk operation: present the exact SQL to André, state the consequence, and get an explicit "sim" before running it against production — do not run it silently as part of an automated task loop.

- [ ] **Step 1: Write the migration file**

Replace `<REAL_USER_UUID>` below with the UUID from Task 9 before running anything.

```sql
-- Step A: move Fase 1's hardcoded-user data onto the real authenticated user.
-- Must run BEFORE the FK constraints below, or the FK add fails (the old
-- placeholder UUID '00000000-0000-0000-0000-000000000001' does not exist in
-- auth.users). If this step is skipped, Step B fails loudly (safe) rather
-- than silently hiding André's data behind RLS (which is what would happen
-- if the FK were somehow skipped too).
update profile set user_id = '<REAL_USER_UUID>' where user_id = '00000000-0000-0000-0000-000000000001';
update achievements set user_id = '<REAL_USER_UUID>' where user_id = '00000000-0000-0000-0000-000000000001';
update education set user_id = '<REAL_USER_UUID>' where user_id = '00000000-0000-0000-0000-000000000001';
update certifications set user_id = '<REAL_USER_UUID>' where user_id = '00000000-0000-0000-0000-000000000001';
update skills set user_id = '<REAL_USER_UUID>' where user_id = '00000000-0000-0000-0000-000000000001';
update applications set user_id = '<REAL_USER_UUID>' where user_id = '00000000-0000-0000-0000-000000000001';

-- Step B: real referential integrity.
alter table profile add constraint profile_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table achievements add constraint achievements_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table education add constraint education_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table certifications add constraint certifications_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table skills add constraint skills_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table applications add constraint applications_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- Step C: row level security as a second layer behind the app's own
-- explicit user_id filter (service role bypasses RLS by design, so the
-- application-level filter stays mandatory — RLS here is a safety net).
alter table profile enable row level security;
alter table achievements enable row level security;
alter table education enable row level security;
alter table certifications enable row level security;
alter table skills enable row level security;
alter table applications enable row level security;
alter table cv_versions enable row level security;
alter table interview_questions enable row level security;

create policy profile_owner on profile for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy achievements_owner on achievements for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy education_owner on education for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy certifications_owner on certifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy skills_owner on skills for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy applications_owner on applications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cv_versions_owner on cv_versions for all using (application_id in (select id from applications where user_id = auth.uid()));
create policy interview_questions_owner on interview_questions for all using (application_id in (select id from applications where user_id = auth.uid()));
```

- [ ] **Step 2: Present the risk and get explicit confirmation**

Show André this exact block before running anything:

```
⚠️ OPERAÇÃO DE ALTO RISCO
Operação: rodar supabase/migrations/0002_auth_and_rls.sql em produção — reatribui
  o user_id de todas as candidaturas/banco mestre existentes pro seu UUID real,
  adiciona FK pra auth.users e ativa RLS em todas as tabelas.
Consequência se executar: dado antigo (hardcoded) passa a pertencer à sua conta
  real; a partir daqui, RLS bloqueia qualquer leitura/escrita sem sessão válida
  (mesmo via bug de código, a rede de segurança do banco também barra).
Alternativa reversível: nenhuma automática — se algo sair errado, restaurar via
  backup do Supabase (Database → Backups) antes de aplicar.
Confirma? (s/n)
```

Do not proceed past this step without an explicit "sim"/"s" from André.

- [ ] **Step 3: Apply the migration**

Paste the SQL (with the real UUID substituted) into the Supabase Dashboard SQL Editor and run it directly — do NOT type it via simulated browser keystrokes (Monaco's auto-closing brackets corrupt multi-line SQL typed that way; a real paste is fine).

- [ ] **Step 4: Verify**

In the SQL editor, run:

```sql
select count(*) from achievements where user_id = '00000000-0000-0000-0000-000000000001';
```

Expected: `0` (all rows moved to the real UUID).

```sql
select count(*) from achievements where user_id = '<REAL_USER_UUID>';
```

Expected: matches the count André had before (the same achievements, just re-owned).

- [ ] **Step 5: Commit the migration file (already applied manually, this just documents it)**

```bash
git add supabase/migrations/0002_auth_and_rls.sql
git commit -m "docs(cv-tailor): document 0002 migration (FK to auth.users + RLS)"
```

---

### Task 11: Remove `DEFAULT_USER_ID`, wire real auth through the app

**Files:**
- Delete: `src/lib/constants.ts`
- Modify: `src/lib/repository.ts:54-58,60-63,90-93,95-112`
- Modify: `src/app/page.tsx`
- Modify: `src/app/actions/create-application.ts`
- Modify: `src/app/actions/generate-cv.ts`
- Modify: `src/app/applications/[id]/page.tsx`

- [ ] **Step 1: Delete the constant**

```bash
rm src/lib/constants.ts
```

- [ ] **Step 2: Add `userId` filtering to the repository functions that were missing it**

In `src/lib/repository.ts`, replace `getApplication`, `updateJobDescription`, `updateApplicationStatus`, and `getApplicationDetail` (previously unfiltered — they trusted the caller to only ever pass IDs belonging to `DEFAULT_USER_ID`, which real multi-user auth can no longer assume) with:

```typescript
export async function getApplication(db: SupabaseClient, applicationId: string, userId: string): Promise<Application> {
  const { data, error } = await db.from('applications').select('*').eq('id', applicationId).eq('user_id', userId).single()
  if (error) throw error
  return data
}

export async function updateJobDescription(db: SupabaseClient, applicationId: string, userId: string, jobDescriptionRaw: string): Promise<void> {
  const { error } = await db.from('applications').update({ job_description_raw: jobDescriptionRaw }).eq('id', applicationId).eq('user_id', userId)
  if (error) throw error
}
```

```typescript
export async function updateApplicationStatus(db: SupabaseClient, applicationId: string, userId: string, status: ApplicationStatus): Promise<void> {
  const { error } = await db.from('applications').update({ status }).eq('id', applicationId).eq('user_id', userId)
  if (error) throw error
}

export async function getApplicationDetail(
  db: SupabaseClient,
  applicationId: string,
  userId: string,
): Promise<{ application: Application; cvVersion: CvVersion | null; interviewQuestions: InterviewQuestion[] }> {
  const { data: application, error: appError } = await db.from('applications').select('*').eq('id', applicationId).eq('user_id', userId).single()
  if (appError) throw appError

  const [
    { data: cvVersion, error: cvError },
    { data: interviewQuestions, error: iqError },
  ] = await Promise.all([
    db.from('cv_versions').select('*').eq('application_id', applicationId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('interview_questions').select('*').eq('application_id', applicationId),
  ])
  if (cvError) throw cvError
  if (iqError) throw iqError
  return { application, cvVersion: cvVersion ?? null, interviewQuestions: interviewQuestions ?? [] }
}
```

(`cv_versions`/`interview_questions` stay filtered only by `application_id` — ownership is already confirmed by the `applications` lookup above using both `id` and `user_id`.)

- [ ] **Step 3: Wire `src/app/page.tsx`**

```tsx
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { listApplications } from '@/lib/repository'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  const applications = await listApplications(db, userId, params.q)
```

(Only the import block and the first three lines of the function body change — the rest of the JSX stays exactly as-is.)

- [ ] **Step 4: Wire `src/app/actions/create-application.ts`**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { createApplication } from '@/lib/repository'
import { fetchJobDescription } from '@/lib/extract-job-text'

export interface CreateApplicationState {
  error: string | null
  company: string
  roleTitle: string
  sourceUrl: string
  jobDescriptionRaw: string
}

export async function createApplicationAction(
  _prevState: CreateApplicationState,
  formData: FormData,
): Promise<CreateApplicationState> {
  const company = String(formData.get('company') ?? '')
  const roleTitle = String(formData.get('roleTitle') ?? '')
  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim()
  const pastedText = String(formData.get('jobDescriptionRaw') ?? '').trim()

  const jobDescriptionRaw = sourceUrl ? (await fetchJobDescription(sourceUrl)) ?? pastedText : pastedText

  if (!jobDescriptionRaw) {
    return {
      error: 'Nao foi possivel extrair o texto da vaga do link, e nenhum texto foi colado. Cole o texto da vaga manualmente.',
      company,
      roleTitle,
      sourceUrl,
      jobDescriptionRaw: pastedText,
    }
  }

  const userId = await getCurrentUserId()
  const db = createServiceClient()
  const application = await createApplication(db, userId, { company, roleTitle, sourceUrl: sourceUrl || null, jobDescriptionRaw })

  redirect(`/applications/${application.id}`)
}
```

- [ ] **Step 5: Wire `src/app/actions/generate-cv.ts`**

```typescript
'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import * as repo from '@/lib/repository'
import { generateTailoredCv } from '@/lib/claude-generation'
import { renderCvDocx } from '@/lib/docx-template'
import { uploadCvDocx } from '@/lib/storage'
import { runCvGeneration } from '@/lib/generate-cv-orchestrator'

export interface GenerateCvState {
  error: string | null
}

export async function generateCvAction(
  applicationId: string,
  _prevState: GenerateCvState,
  formData: FormData,
): Promise<GenerateCvState> {
  const editedJobDescription = String(formData.get('jobDescriptionRaw') ?? '').trim()
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    if (editedJobDescription.length > 0) {
      await repo.updateJobDescription(db, applicationId, userId, editedJobDescription)
    }

    await runCvGeneration(
      {
        getApplication: (id) => repo.getApplication(db, id, userId),
        getMasterDataBank: () => repo.getMasterDataBank(db, userId),
        getProfile: () => repo.getProfile(db, userId),
        generateTailoredCv: (masterData, jobDescription) => generateTailoredCv(anthropic, masterData, jobDescription),
        renderCvDocx: (profile, content) => renderCvDocx(profile, content),
        uploadCvDocx: (id, buffer) => uploadCvDocx(db, id, buffer),
        saveCvVersion: (id, storagePath, generatedJson) => repo.saveCvVersion(db, id, storagePath, generatedJson),
        saveInterviewQuestions: (id, questions) => repo.saveInterviewQuestions(db, id, questions),
      },
      applicationId,
    )
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Erro desconhecido ao gerar o CV.' }
  }

  revalidatePath(`/applications/${applicationId}`)
  return { error: null }
}
```

- [ ] **Step 6: Wire `src/app/actions/update-status.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { updateApplicationStatus } from '@/lib/repository'
import type { ApplicationStatus } from '@/lib/types'

export async function updateStatusAction(applicationId: string, status: ApplicationStatus): Promise<void> {
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  await updateApplicationStatus(db, applicationId, userId, status)
  revalidatePath(`/applications/${applicationId}`)
  revalidatePath('/')
}
```

- [ ] **Step 7: Wire `src/app/applications/[id]/page.tsx`**

Change only the import and the first data-fetching lines — the JSX below stays the same:

```tsx
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getApplicationDetail } from '@/lib/repository'
import { getCvDownloadUrl } from '@/lib/storage'
import { updateStatusAction } from '@/app/actions/update-status'
import { GenerateCvForm } from './generate-cv-form'
import type { ApplicationStatus } from '@/lib/types'

const STATUS_OPTIONS: ApplicationStatus[] = ['sem_resposta', 'rejeitado', 'entrevista', 'oferta']
const STATUS_LABELS: Record<ApplicationStatus, string> = {
  sem_resposta: 'Sem resposta',
  rejeitado: 'Rejeitado',
  entrevista: 'Entrevista',
  oferta: 'Oferta',
}

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  const { application, cvVersion, interviewQuestions } = await getApplicationDetail(db, id, userId)
  const downloadUrl = cvVersion ? await getCvDownloadUrl(db, cvVersion.storage_path) : null
```

- [ ] **Step 8: Update existing tests that call the now-changed signatures**

`tests/generate-cv-orchestrator.test.ts` calls the orchestrator with injected deps closures, not `repository.ts` functions directly — check it still passes unmodified:

Run: `npm test -- generate-cv-orchestrator`
Expected: PASS (that test never imports `repository.ts` directly, so the signature change doesn't affect it).

- [ ] **Step 9: Full test suite + typecheck + build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(cv-tailor): replace DEFAULT_USER_ID with real Supabase Auth session"
```

---

### Task 12: RLS verification script

**Files:**
- Create: `scripts/verify-rls.ts`
- Modify: `package.json` (add script)

This is a standalone integration check against the live Supabase project (not part of `npm test`, since it needs real network access and creates/deletes real auth users) — matches the project's documented lesson that testing RLS with the service role "lies" about the real protection.

- [ ] **Step 1: Write the script**

```typescript
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { createServiceClient } from '../src/lib/supabase/server'

async function main() {
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
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`:

```json
    "verify-rls": "tsx scripts/verify-rls.ts"
```

- [ ] **Step 3: Run it against production (after Task 10 is applied)**

Run: `npm run verify-rls`
Expected: `OK: usuario A nao consegue ler dado do usuario B (RLS ativa e funcionando).` and exit code 0. If it prints the FALHA line, stop and re-check the policies from Task 10 before continuing to any other task.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-rls.ts package.json
git commit -m "test(cv-tailor): add live RLS verification script (anon key, not service role)"
```

---

### Task 13: Import schema (Zod)

**Files:**
- Create: `src/lib/import-schema.ts`
- Test: `tests/import-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { parseImportedCv } from '../src/lib/import-schema'

describe('parseImportedCv', () => {
  it('parses valid JSON matching the schema', () => {
    const json = JSON.stringify({
      achievements: [{ company: 'Acme', roleTitle: 'PM', startDate: '2020-01-01', endDate: null, bullet: 'Did X', metric: null }],
      skills: [{ name: 'SQL', category: 'Data' }],
      education: [{ institution: 'MIT', degree: 'BSc', completedOn: '2015-06-01', inProgress: false }],
      certifications: [{ name: 'AWS SAA', issuer: 'AWS', issuedOn: null }],
    })
    const result = parseImportedCv(json)
    expect(result.achievements[0].company).toBe('Acme')
    expect(result.skills[0].name).toBe('SQL')
  })

  it('strips a markdown fence before parsing', () => {
    const json = '```json\n' + JSON.stringify({ achievements: [], skills: [], education: [], certifications: [] }) + '\n```'
    expect(() => parseImportedCv(json)).not.toThrow()
  })

  it('throws when a required field is missing', () => {
    const json = JSON.stringify({ achievements: [{ company: 'Acme' }], skills: [], education: [], certifications: [] })
    expect(() => parseImportedCv(json)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- import-schema`
Expected: FAIL with "Cannot find module '../src/lib/import-schema'"

- [ ] **Step 3: Write the schema**

```typescript
import { z } from 'zod'
import { stripMarkdownFence } from './strip-markdown-fence'

export const importedCvSchema = z.object({
  achievements: z.array(z.object({
    company: z.string().min(1),
    roleTitle: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().nullable(),
    bullet: z.string().min(1),
    metric: z.string().nullable(),
  })),
  skills: z.array(z.object({
    name: z.string().min(1),
    category: z.string().min(1),
  })),
  education: z.array(z.object({
    institution: z.string().min(1),
    degree: z.string().min(1),
    completedOn: z.string().nullable(),
    inProgress: z.boolean(),
  })),
  certifications: z.array(z.object({
    name: z.string().min(1),
    issuer: z.string().nullable(),
    issuedOn: z.string().nullable(),
  })),
})

export type ImportedCv = z.infer<typeof importedCvSchema>

export function parseImportedCv(raw: string): ImportedCv {
  const json = JSON.parse(stripMarkdownFence(raw))
  return importedCvSchema.parse(json)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- import-schema`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/import-schema.test.ts src/lib/import-schema.ts
git commit -m "feat(cv-tailor): add Zod schema for CV import extraction"
```

---

### Task 14: CV extraction (PDF via document block, DOCX via mammoth)

**Files:**
- Create: `src/lib/import-cv.ts`
- Test: `tests/import-cv.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- import-cv`
Expected: FAIL with "Cannot find module '../src/lib/import-cv'"

- [ ] **Step 3: Write the implementation**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { parseImportedCv, type ImportedCv } from './import-schema'

const EXTRACTION_PROMPT = `Extraia do curriculo TODAS as conquistas reais (bullet points de work experience), skills, formacao e certificacoes, como JSON no formato exato:
{"achievements": [{"company": "...", "roleTitle": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD ou null", "bullet": "texto exato do bullet", "metric": "numero/percentual citado ou null"}], "skills": [{"name": "...", "category": "..."}], "education": [{"institution": "...", "degree": "...", "completedOn": "YYYY-MM-DD ou null", "inProgress": false}], "certifications": [{"name": "...", "issuer": "...", "issuedOn": "YYYY-MM-DD ou null"}]}
Copie o texto do bullet LITERALMENTE, sem reescrever. Responda APENAS com o JSON.`

export type CvFileKind = 'pdf' | 'docx'

async function callOncePdf(anthropic: Anthropic, buffer: Buffer): Promise<ImportedCv> {
  const response = await anthropic.beta.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 16000,
    betas: ['pdfs-2024-09-25'],
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
        { type: 'text', text: EXTRACTION_PROMPT },
      ],
    }],
  })
  const textBlock = response.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
  }
  return parseImportedCv(textBlock.text)
}

async function callOnceDocx(anthropic: Anthropic, buffer: Buffer): Promise<ImportedCv> {
  const { value: text } = await mammoth.extractRawText({ buffer })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 16000,
    messages: [{ role: 'user', content: `${EXTRACTION_PROMPT}\n\nTEXTO DO CURRICULO:\n${text}` }],
  })
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
  }
  return parseImportedCv(textBlock.text)
}

export async function extractCvData(anthropic: Anthropic, kind: CvFileKind, buffer: Buffer): Promise<ImportedCv> {
  const callOnce = kind === 'pdf' ? callOncePdf : callOnceDocx
  try {
    return await callOnce(anthropic, buffer)
  } catch {
    return await callOnce(anthropic, buffer)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- import-cv`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/import-cv.test.ts src/lib/import-cv.ts
git commit -m "feat(cv-tailor): extract CV data from PDF (document block) or DOCX (mammoth)"
```

---

### Task 15: Repository additions for the master data bank (insert + generic edit/delete)

**Files:**
- Modify: `src/lib/repository.ts` (append)

- [ ] **Step 1: Add the bulk-insert functions**

Append to `src/lib/repository.ts` (add `Positioning` to the existing type import at the top of the file first: `import type { Application, ApplicationStatus, CvVersion, InterviewQuestion, MasterDataBank, Positioning, Profile } from './types'`):

```typescript
export async function insertAchievements(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { company: string; roleTitle: string; startDate: string; endDate: string | null; bullet: string; metric: string | null }[],
): Promise<void> {
  const rows = items.map((a) => ({
    user_id: userId, company: a.company, role_title: a.roleTitle,
    start_date: a.startDate, end_date: a.endDate, bullet: a.bullet, metric: a.metric, positioning,
  }))
  const { error } = await db.from('achievements').insert(rows)
  if (error) throw error
}

export async function insertSkills(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { name: string; category: string }[],
): Promise<void> {
  const rows = items.map((s) => ({ user_id: userId, name: s.name, category: s.category, positioning }))
  const { error } = await db.from('skills').insert(rows)
  if (error) throw error
}

export async function insertEducation(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { institution: string; degree: string; completedOn: string | null; inProgress: boolean }[],
): Promise<void> {
  const rows = items.map((e) => ({
    user_id: userId, institution: e.institution, degree: e.degree, completed_on: e.completedOn, in_progress: e.inProgress, positioning,
  }))
  const { error } = await db.from('education').insert(rows)
  if (error) throw error
}

export async function insertCertifications(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { name: string; issuer: string | null; issuedOn: string | null }[],
): Promise<void> {
  const rows = items.map((c) => ({ user_id: userId, name: c.name, issuer: c.issuer, issued_on: c.issuedOn, positioning }))
  const { error } = await db.from('certifications').insert(rows)
  if (error) throw error
}

export type ProfileItemTable = 'achievements' | 'education' | 'skills' | 'certifications'

export async function deleteProfileItem(db: SupabaseClient, table: ProfileItemTable, id: string, userId: string): Promise<void> {
  const { error } = await db.from(table).delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}

export async function updateProfileItem(db: SupabaseClient, table: ProfileItemTable, id: string, userId: string, fields: Record<string, string>): Promise<void> {
  const { error } = await db.from(table).update(fields).eq('id', id).eq('user_id', userId)
  if (error) throw error
}
```

No new unit test file for this task — matches the existing convention in this codebase, where `repository.ts` has no direct test file and is instead exercised through the orchestrator's injected-deps tests and live E2E (Task 21).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/repository.ts
git commit -m "feat(cv-tailor): add insert/update/delete for the master data bank"
```

---

### Task 16: Upload CV Server Action

**Files:**
- Create: `src/app/actions/upload-cv.ts`

- [ ] **Step 1: Write the action**

```typescript
'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { extractCvData, type CvFileKind } from '@/lib/import-cv'
import { insertAchievements, insertSkills, insertEducation, insertCertifications } from '@/lib/repository'
import type { Positioning } from '@/lib/types'

const VALID_POSITIONING: Positioning[] = ['TPM', 'AI Product', 'Web3']

export interface UploadCvState {
  error: string | null
  message: string | null
}

function detectFileKind(file: File): CvFileKind | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx'
  return null
}

export async function uploadCvAction(_prevState: UploadCvState, formData: FormData): Promise<UploadCvState> {
  const file = formData.get('cvFile')
  const positioning = formData.getAll('positioning')
    .map(String)
    .filter((value): value is Positioning => (VALID_POSITIONING as string[]).includes(value))

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo PDF ou DOCX.', message: null }
  }
  if (positioning.length === 0) {
    return { error: 'Marque pelo menos um posicionamento (TPM, AI Product ou Web3).', message: null }
  }

  const kind = detectFileKind(file)
  if (!kind) {
    return { error: 'Formato nao suportado. Envie um arquivo .pdf ou .docx.', message: null }
  }

  const userId = await getCurrentUserId()
  const buffer = Buffer.from(await file.arrayBuffer())
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let extracted
  try {
    extracted = await extractCvData(anthropic, kind, buffer)
  } catch {
    return { error: 'Nao consegui ler esse CV. Tenta outro arquivo.', message: null }
  }

  const db = createServiceClient()
  if (extracted.achievements.length) await insertAchievements(db, userId, positioning, extracted.achievements)
  if (extracted.skills.length) await insertSkills(db, userId, positioning, extracted.skills)
  if (extracted.education.length) await insertEducation(db, userId, positioning, extracted.education)
  if (extracted.certifications.length) await insertCertifications(db, userId, positioning, extracted.certifications)

  revalidatePath('/perfil')
  return {
    error: null,
    message: `Importado: ${extracted.achievements.length} conquistas, ${extracted.skills.length} skills, ${extracted.education.length} formacoes, ${extracted.certifications.length} certificacoes.`,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/upload-cv.ts
git commit -m "feat(cv-tailor): add upload-and-extract Server Action for /perfil"
```

---

### Task 17: Profile item edit/delete Server Actions

**Files:**
- Create: `src/app/actions/profile-items.ts`

- [ ] **Step 1: Write the actions**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { deleteProfileItem, updateProfileItem, type ProfileItemTable } from '@/lib/repository'

const VALID_TABLES: ProfileItemTable[] = ['achievements', 'education', 'skills', 'certifications']

function assertValidTable(table: string): ProfileItemTable {
  if (!(VALID_TABLES as string[]).includes(table)) {
    throw new Error(`Tabela invalida: ${table}`)
  }
  return table as ProfileItemTable
}

const EDITABLE_FIELDS: Record<ProfileItemTable, string[]> = {
  achievements: ['company', 'role_title', 'bullet', 'metric'],
  education: ['institution', 'degree'],
  skills: ['name', 'category'],
  certifications: ['name', 'issuer'],
}

export async function deleteProfileItemAction(table: string, id: string): Promise<void> {
  const validTable = assertValidTable(table)
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  await deleteProfileItem(db, validTable, id, userId)
  revalidatePath('/perfil')
}

export interface UpdateProfileItemState {
  error: string | null
}

export async function updateProfileItemAction(
  table: string,
  id: string,
  _prevState: UpdateProfileItemState,
  formData: FormData,
): Promise<UpdateProfileItemState> {
  const validTable = assertValidTable(table)
  const userId = await getCurrentUserId()
  const db = createServiceClient()

  const fields: Record<string, string> = {}
  for (const key of EDITABLE_FIELDS[validTable]) {
    const value = formData.get(key)
    if (value !== null) fields[key] = String(value)
  }

  try {
    await updateProfileItem(db, validTable, id, userId, fields)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Erro ao salvar.' }
  }

  revalidatePath('/perfil')
  return { error: null }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/profile-items.ts
git commit -m "feat(cv-tailor): add edit/delete actions for master data bank items"
```

---

### Task 18: CSS for the Perfil page

**Files:**
- Modify: `src/app/globals.css` (append)

- [ ] **Step 1: Append the styles**

```css
/* ---------- perfil / upload ---------- */

.upload-field {
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  text-align: center;
  color: var(--text-muted);
}

.upload-field input[type="file"] { margin-top: var(--space-2); }

.checkbox-row { display: flex; gap: var(--space-4); flex-wrap: wrap; margin-top: var(--space-2); }
.checkbox-row label { display: flex; align-items: center; gap: 6px; font-weight: 400; color: var(--text); width: auto; }
.checkbox-row input[type="checkbox"] { width: auto; }

.profile-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.profile-item__title { font-weight: 600; }
.profile-item__subtitle { color: var(--text-muted); font-size: 0.875rem; }
.profile-item__tags { margin-top: var(--space-1); display: flex; gap: var(--space-1); }
.profile-item__actions { display: flex; gap: var(--space-2); flex-shrink: 0; }

.tag {
  display: inline-flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px var(--space-2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  color: var(--accent);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(cv-tailor): add CSS for perfil/upload/profile-item components"
```

---

### Task 19: Perfil page + upload form + profile item list

**Files:**
- Create: `src/app/perfil/page.tsx`
- Create: `src/app/perfil/upload-cv-form.tsx`
- Create: `src/app/perfil/profile-item-list.tsx`

- [ ] **Step 1: Write the upload form (Client Component)**

```tsx
'use client'

import { useActionState } from 'react'
import { uploadCvAction, type UploadCvState } from '@/app/actions/upload-cv'

const initialState: UploadCvState = { error: null, message: null }

const POSITIONING_OPTIONS = ['TPM', 'AI Product', 'Web3'] as const

export function UploadCvForm() {
  const [state, formAction, pending] = useActionState(uploadCvAction, initialState)

  return (
    <form action={formAction} className="card" style={{ marginBottom: 'var(--space-6)' }}>
      {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
      {state.message && <div className="alert alert-info" role="status">{state.message}</div>}

      <div className="upload-field">
        <label htmlFor="cvFile">Subir CV novo (PDF ou DOCX) — complementa o que já existe, não substitui</label>
        <input id="cvFile" name="cvFile" type="file" accept=".pdf,.docx" required />
      </div>

      <div className="field" style={{ marginTop: 'var(--space-4)' }}>
        <span className="hint">Esse CV é pra qual posicionamento? (marque 1 ou mais)</span>
        <div className="checkbox-row">
          {POSITIONING_OPTIONS.map((option) => (
            <label key={option}>
              <input type="checkbox" name="positioning" value={option} />
              {option}
            </label>
          ))}
        </div>
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
        {pending ? 'Importando…' : 'Importar CV'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Write the profile item list (Client Component)**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { deleteProfileItemAction, updateProfileItemAction, type UpdateProfileItemState } from '@/app/actions/profile-items'
import type { Positioning } from '@/lib/types'

export interface ItemField {
  name: string
  label: string
  value: string
  multiline?: boolean
}

export interface ProfileItem {
  id: string
  positioning: Positioning[]
  primary: string
  secondary: string
  fields: ItemField[]
}

const initialEditState: UpdateProfileItemState = { error: null }

function ProfileItemRow({ table, item }: { table: string; item: ProfileItem }) {
  const [editing, setEditing] = useState(false)
  const [state, formAction, pending] = useActionState(updateProfileItemAction.bind(null, table, item.id), initialEditState)

  if (editing) {
    return (
      <form action={formAction} className="card" style={{ marginBottom: 'var(--space-2)' }}>
        {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
        {item.fields.map((field) => (
          <div className="field" key={field.name}>
            <label htmlFor={`${item.id}-${field.name}`}>{field.label}</label>
            {field.multiline ? (
              <textarea id={`${item.id}-${field.name}`} name={field.name} defaultValue={field.value} rows={3} />
            ) : (
              <input id={`${item.id}-${field.name}`} name={field.name} defaultValue={field.value} />
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={pending} className="btn btn-primary">{pending ? 'Salvando…' : 'Salvar'}</button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary">Cancelar</button>
        </div>
      </form>
    )
  }

  return (
    <div className="profile-item">
      <div>
        <div className="profile-item__title">{item.primary}</div>
        {item.secondary && <div className="profile-item__subtitle">{item.secondary}</div>}
        <div className="profile-item__tags">
          {item.positioning.map((tag) => <span key={tag} className="tag">{tag}</span>)}
        </div>
      </div>
      <div className="profile-item__actions">
        <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary">Editar</button>
        <form action={deleteProfileItemAction.bind(null, table, item.id)}>
          <button type="submit" className="btn btn-secondary">Apagar</button>
        </form>
      </div>
    </div>
  )
}

export function ProfileItemList({ table, items }: { table: string; items: ProfileItem[] }) {
  if (items.length === 0) {
    return <p className="hint">Nenhum item ainda.</p>
  }
  return (
    <div>
      {items.map((item) => <ProfileItemRow key={item.id} table={table} item={item} />)}
    </div>
  )
}
```

- [ ] **Step 3: Write the page (Server Component)**

```tsx
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getMasterDataBank } from '@/lib/repository'
import { UploadCvForm } from './upload-cv-form'
import { ProfileItemList, type ProfileItem } from './profile-item-list'

export default async function PerfilPage() {
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  const masterData = await getMasterDataBank(db, userId)

  const achievementItems: ProfileItem[] = masterData.achievements.map((a) => ({
    id: a.id,
    positioning: a.positioning,
    primary: `${a.role_title} @ ${a.company}`,
    secondary: a.bullet,
    fields: [
      { name: 'company', label: 'Empresa', value: a.company },
      { name: 'role_title', label: 'Cargo', value: a.role_title },
      { name: 'bullet', label: 'Conquista', value: a.bullet, multiline: true },
      { name: 'metric', label: 'Métrica', value: a.metric ?? '' },
    ],
  }))

  const educationItems: ProfileItem[] = masterData.education.map((e) => ({
    id: e.id,
    positioning: e.positioning,
    primary: e.institution,
    secondary: e.degree,
    fields: [
      { name: 'institution', label: 'Instituição', value: e.institution },
      { name: 'degree', label: 'Curso', value: e.degree },
    ],
  }))

  const skillItems: ProfileItem[] = masterData.skills.map((s) => ({
    id: s.id,
    positioning: s.positioning,
    primary: s.name,
    secondary: s.category,
    fields: [
      { name: 'name', label: 'Skill', value: s.name },
      { name: 'category', label: 'Categoria', value: s.category },
    ],
  }))

  const certificationItems: ProfileItem[] = masterData.certifications.map((c) => ({
    id: c.id,
    positioning: c.positioning,
    primary: c.name,
    secondary: c.issuer ?? '',
    fields: [
      { name: 'name', label: 'Certificação', value: c.name },
      { name: 'issuer', label: 'Emissor', value: c.issuer ?? '' },
    ],
  }))

  return (
    <main className="container">
      <h1>Perfil</h1>
      <p className="hint">Suba um CV (PDF ou DOCX) pra alimentar seu banco de dados. Edite ou apague qualquer item quando quiser — a revisão nunca é obrigatória.</p>

      <UploadCvForm />

      <h2>Conquistas</h2>
      <ProfileItemList table="achievements" items={achievementItems} />

      <h2>Formação</h2>
      <ProfileItemList table="education" items={educationItems} />

      <h2>Skills</h2>
      <ProfileItemList table="skills" items={skillItems} />

      <h2>Certificações</h2>
      <ProfileItemList table="certifications" items={certificationItems} />
    </main>
  )
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/perfil
git commit -m "feat(cv-tailor): add /perfil page with upload, edit, and delete"
```

---

### Task 20: Refactor the CLI importer to reuse the shared extraction lib

**Files:**
- Modify: `scripts/import-cv.ts` (full rewrite)

The CLI importer stays useful for bulk-reseeding a known user's data during development, but must no longer duplicate the extraction logic now that `src/lib/import-cv.ts` exists, and can no longer reference the deleted `DEFAULT_USER_ID`.

- [ ] **Step 1: Rewrite the script**

```typescript
import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '../src/lib/supabase/server'
import { extractCvData, type CvFileKind } from '../src/lib/import-cv'
import { insertAchievements, insertSkills, insertEducation, insertCertifications } from '../src/lib/repository'
import type { Positioning } from '../src/lib/types'

interface ImportJob {
  path: string
  kind: CvFileKind
  positioning: Positioning[]
}

// Usage: npm run import-cv -- <userId>
// Edit JOBS below to point at real CV files before running.
const JOBS: ImportJob[] = [
  { path: 'F:/Particular/CV/CV_Andre_Prol_TCS_AI_TPM.pdf', kind: 'pdf', positioning: ['TPM', 'AI Product'] },
]

async function main() {
  process.loadEnvFile('.env.local')

  const userId = process.argv[2]
  if (!userId) {
    throw new Error('Uso: npm run import-cv -- <userId real do Supabase Auth>')
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const db = createServiceClient()

  for (const job of JOBS) {
    console.log(`Importando ${job.path} (${job.kind}, positioning: ${job.positioning.join(', ')})...`)
    const buffer = readFileSync(job.path)
    const extracted = await extractCvData(anthropic, job.kind, buffer)

    if (extracted.achievements.length) await insertAchievements(db, userId, job.positioning, extracted.achievements)
    if (extracted.skills.length) await insertSkills(db, userId, job.positioning, extracted.skills)
    if (extracted.education.length) await insertEducation(db, userId, job.positioning, extracted.education)
    if (extracted.certifications.length) await insertCertifications(db, userId, job.positioning, extracted.certifications)

    console.log(`OK: ${extracted.achievements.length} achievements, ${extracted.skills.length} skills, ${extracted.education.length} education, ${extracted.certifications.length} certifications importados.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 2: Update the npm script to accept an argument**

Confirm `package.json` still has `"import-cv": "tsx scripts/import-cv.ts"` (unchanged — the userId is now passed at invocation: `npm run import-cv -- <uuid>`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-cv.ts
git commit -m "refactor(cv-tailor): reuse shared extraction lib in the CLI importer"
```

---

### Task 21: Live E2E verification

**Files:** none (manual verification, mirrors Fase 1's Task 14 discipline of testing against real services, not just mocks)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test all 3 login methods**

Using the Browser pane: open `/login`, sign in with the password account created in Task 9; sign out; sign in again via magic link (check the email actually arrives and the link logs in); sign in via Google (if a second test Google account is available — otherwise confirm the button redirects to Google's real consent screen without erroring, which confirms the provider config from Task 2 is wired correctly).

- [ ] **Step 3: Test upload — PDF**

Go to `/perfil`, upload a real PDF CV, check 1+ positioning boxes, submit. Confirm the success message shows non-zero counts and the new items appear in the lists below.

- [ ] **Step 4: Test upload — DOCX**

Save any CV as `.docx` (e.g. export from Google Docs) and repeat Step 3 with it. Confirm it also extracts correctly (this is the path that never touched real data before — mammoth extraction was only unit-tested with a synthetic fixture in Task 14).

- [ ] **Step 5: Test edit and delete**

Click "Editar" on one achievement, change the bullet text, save, confirm it persists after a page reload. Click "Apagar" on a different item, confirm it disappears and does not reappear on reload.

- [ ] **Step 6: Test that Fase 1 still works end-to-end under real auth**

Create a new candidatura, generate a CV, download the `.docx`. Confirm the generated résumé draws from achievements across both the original Fase 1 import and the new Task 21 uploads (proving `getMasterDataBank` is reading the real session's `user_id` correctly).

- [ ] **Step 7: Take a screenshot as proof**

Use the Browser pane screenshot tool on the `/perfil` page showing real imported data, and send it to André.

---

### Task 22: Final code review

**Files:** none (review task)

- [ ] **Step 1: Gather the full diff for this feature branch**

Run: `git log --oneline` to confirm the commit range, then `git diff <first-commit-of-this-plan>~1..HEAD`

- [ ] **Step 2: Dispatch the project's code reviewer**

Per `F:\RichClub\CLAUDE.md`, use the local `code-reviewer` agent (not `cavecrew-reviewer`) with:

```
Revisar o diff abaixo como revisor sênior independente.
Contexto: CV Tailor — Fase 2 (Supabase Auth com 3 métodos + upload/perfil self-service com tags de posicionamento)
--- DIFF ---
<diff da sessão>
```

- [ ] **Step 3: Apply all 🔴 CRÍTICO and 🟠 ALTO findings**

Fix them directly, re-run `npm test && npx tsc --noEmit && npm run build` after each fix.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix(cv-tailor): address Fase 2 code review findings"
```
