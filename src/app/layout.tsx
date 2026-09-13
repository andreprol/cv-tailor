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
