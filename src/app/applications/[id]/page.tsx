import { createServiceClient } from '@/lib/supabase/server'
import { getApplicationDetail } from '@/lib/repository'
import { getCvDownloadUrl } from '@/lib/storage'
import { updateStatusAction } from '@/app/actions/update-status'
import { GenerateCvForm } from './generate-cv-form'
import type { ApplicationStatus } from '@/lib/types'

const STATUS_OPTIONS: ApplicationStatus[] = ['sem_resposta', 'rejeitado', 'entrevista', 'oferta']

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServiceClient()
  const { application, cvVersion, interviewQuestions } = await getApplicationDetail(db, id)
  const downloadUrl = cvVersion ? await getCvDownloadUrl(db, cvVersion.storage_path) : null

  async function setStatus(formData: FormData) {
    'use server'
    await updateStatusAction(id, formData.get('status') as ApplicationStatus)
  }

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>{application.role_title} — {application.company}</h1>

      <form action={setStatus}>
        <select name="status" defaultValue={application.status}>
          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <button type="submit">Atualizar status</button>
      </form>

      <h2>Texto da vaga (confira antes de gerar)</h2>
      <GenerateCvForm applicationId={application.id} initialJobDescription={application.job_description_raw} hasCv={cvVersion !== null} />

      {cvVersion && downloadUrl && (
        <>
          <h2>CV gerado</h2>
          <a href={downloadUrl}>Baixar CV (.docx)</a>

          <h2>Perguntas provaveis de entrevista</h2>
          <ul>
            {interviewQuestions.map((q) => (
              <li key={q.id}><strong>{q.question}</strong> — {q.rationale}</li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
