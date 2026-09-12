import { Outfit } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '500', '600', '700'] })

export const metadata = {
  title: { default: 'CV Tailor', template: '%s · CV Tailor' },
  description: 'Currículos sob medida por vaga, seguros contra parsing de ATS.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={outfit.variable}>
      <body>
        <header className="app-header">
          <div className="app-header__inner">
            <Link href="/" className="brand">
              <span className="brand__mark">CV</span>
              CV Tailor
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  )
}
