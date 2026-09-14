import { Outfit } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { getCurrentUser } from '@/lib/supabase/auth-server'
import { signOutAction } from '@/app/actions/auth'
import type { User } from '@supabase/supabase-js'

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '500', '600', '700'] })

export const metadata = {
  title: { default: 'CV Tailor', template: '%s · CV Tailor' },
  description: 'Currículos sob medida por vaga, seguros contra parsing de ATS.',
}

async function getSessionUser(): Promise<User | null> {
  try {
    return await getCurrentUser()
  } catch (error) {
    // getCurrentUser() throws 'Usuario nao autenticado...' as its designed
    // signal for "no session" — that's the expected, high-frequency case for
    // every logged-out visit and would flood logs if reported as a warning.
    // Anything else (env vars missing, Supabase unreachable) is a real
    // infra failure worth surfacing.
    if (!(error instanceof Error) || !error.message.startsWith('Usuario nao autenticado')) {
      console.error('RootLayout: falha inesperada ao verificar sessao:', error)
    }
    return null
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  const avatarUrl = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? ''

  return (
    <html lang="pt-BR" className={outfit.variable}>
      <body>
        <header className="app-header">
          <div className="app-header__inner">
            <Link href="/" className="brand">
              <span className="brand__mark">CV</span>
              CV Tailor
            </Link>
            {user && (
              <nav className="app-nav">
                {avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external Google avatar URL, not a local/optimizable asset
                  <img src={avatarUrl} alt={displayName} title={displayName} className="user-avatar" referrerPolicy="no-referrer" />
                )}
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
