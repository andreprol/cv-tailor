import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { listApplications } from '@/lib/repository'
import { DEFAULT_USER_ID } from '@/lib/constants'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const db = createServiceClient()
  const applications = await listApplications(db, DEFAULT_USER_ID, params.q)

  return (
    <main className="container">
      <div className="section-header">
        <h1>Candidaturas</h1>
        <Link href="/applications/new" className="btn btn-primary">
          + Nova candidatura
        </Link>
      </div>

      <form className="search-form">
        <span className="search-form__icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <input name="q" defaultValue={params.q ?? ''} placeholder="Buscar por vaga, empresa..." aria-label="Buscar candidaturas" />
        <button type="submit" className="btn btn-secondary">Buscar</button>
      </form>

      {applications.length === 0 ? (
        <div className="empty-state">
          <h3>{params.q ? 'Nada encontrado' : 'Nenhuma candidatura ainda'}</h3>
          <p>
            {params.q
              ? `Nenhuma vaga ou empresa combina com "${params.q}".`
              : 'Cole uma vaga e gere seu primeiro currículo sob medida.'}
          </p>
          {!params.q && (
            <Link href="/applications/new" className="btn btn-primary">
              Criar a primeira candidatura
            </Link>
          )}
        </div>
      ) : (
        <table className="app-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Cargo</th>
              <th>Status</th>
              <th>Candidatado em</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((app) => (
              <tr key={app.id}>
                <td><Link href={`/applications/${app.id}`}>{app.company}</Link></td>
                <td>{app.role_title}</td>
                <td><span className={`badge badge--${app.status}`}>{app.status.replace('_', ' ')}</span></td>
                <td className="muted">{app.applied_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
