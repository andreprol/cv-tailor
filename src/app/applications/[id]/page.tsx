import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getApplicationDetail } from '@/lib/repository'
import { getCvDownloadUrl } from '@/lib/storage'
import { updateStatusAction } from '@/app/actions/update-status'
import { generatedCvSchema } from '@/lib/generation-schema'
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
  const matchWarning = cvVersion ? generatedCvSchema.parse(cvVersion.generated_json).matchWarning : null

  async function setStatus(formData: FormData) {
    'use server'
    await updateStatusAction(id, formData.get('status') as ApplicationStatus)
  }

  return (
    <main className="container">
      <Link href="/" className="back-link">← Candidaturas</Link>

      <div className="section-header">
        <div>
          <h1>{application.company}</h1>
          <p className="job-title">{application.role_title}</p>
        </div>
        <span className={`badge badge--${application.status}`}>{STATUS_LABELS[application.status]}</span>
      </div>

      <form action={setStatus} className="status-row">
        <label htmlFor="status" className="hint">Status da candidatura</label>
        <select id="status" name="status" defaultValue={application.status}>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{STATUS_LABELS[status]}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">Atualizar</button>
      </form>

      <h2>Texto da vaga</h2>
      <p className="hint" style={{ marginTop: -8, marginBottom: 12 }}>Confira (e edite se precisar) antes de gerar.</p>
      <GenerateCvForm applicationId={application.id} initialJobDescription={application.job_description_raw} hasCv={cvVersion !== null} />

      {cvVersion && downloadUrl && (
        <>
          <h2>CV gerado</h2>
          {matchWarning && (
            <div className="alert alert-info" role="status" style={{ marginBottom: 12 }}>
              ⚠️ {matchWarning}
            </div>
          )}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span>Currículo pronto, ATS-safe, sob medida pra essa vaga.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={downloadUrl} className="btn btn-primary">⬇ Baixar .docx</a>
              <a href={`/applications/${application.id}/pdf`} className="btn btn-secondary">⬇ Baixar PDF</a>
            </div>
          </div>

          <h2>Perguntas prováveis de entrevista</h2>
          <ul className="qa-list">
            {interviewQuestions.map((q) => (
              <li key={q.id} className="qa-item">
                <p className="qa-item__q">{q.question}</p>
                <p className="qa-item__a">{q.rationale}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
