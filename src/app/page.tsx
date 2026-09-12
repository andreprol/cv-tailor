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
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>CV Tailor</h1>
      <Link href="/applications/new">Nova candidatura</Link>

      <form>
        <input name="q" defaultValue={params.q ?? ''} placeholder="Buscar por vaga, empresa..." />
        <button type="submit">Buscar</button>
      </form>

      <table>
        <thead>
          <tr><th>Empresa</th><th>Cargo</th><th>Status</th><th>Candidatado em</th></tr>
        </thead>
        <tbody>
          {applications.map((app) => (
            <tr key={app.id}>
              <td><Link href={`/applications/${app.id}`}>{app.company}</Link></td>
              <td>{app.role_title}</td>
              <td>{app.status}</td>
              <td>{app.applied_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
