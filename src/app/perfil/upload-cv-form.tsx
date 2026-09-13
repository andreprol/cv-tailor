'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadCvAction, type UploadCvState } from '@/app/actions/upload-cv'

// uploadCvAction only reads formData — this stub prev-state is never
// inspected by the action itself, it just satisfies the function's
// signature (it was written for useActionState, but Next.js server actions
// are plain async functions and can be called directly like this too).
const EMPTY_ACTION_STATE: UploadCvState = { error: null, message: null }

// Keep in sync with next.config.mjs's serverActions.bodySizeLimit (4mb),
// which itself is capped by Vercel's hard 4.5MB platform limit for
// Serverless Functions. Checking here gives an immediate, friendly error
// instead of a slow upload attempt that fails with an opaque 413.
//
// Applied PER FILE: even though the user can select many CVs at once, each
// one is still sent to uploadCvAction in its own single-file request (see
// handleSubmit below), so each request individually respects this cap —
// bundling multiple files into one FormData is deliberately avoided here.
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024

type FileStatus = 'pending' | 'ok' | 'error'

interface FileResult {
  name: string
  status: FileStatus
  message: string | null
}

export function UploadCvForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<File[]>([])
  const [rejectedNames, setRejectedNames] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [results, setResults] = useState<FileResult[]>([])

  function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    const accepted: File[] = []
    const rejected: string[] = []

    for (const file of selected) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        rejected.push(file.name)
      } else {
        accepted.push(file)
      }
    }

    // Reflect only the accepted files back into the native input so the
    // browser's own "N files selected" label matches what will actually be
    // uploaded — same DataTransfer trick applications/new/page.tsx uses to
    // keep a rejected file out of the input it's still sitting in.
    const dataTransfer = new DataTransfer()
    accepted.forEach((file) => dataTransfer.items.add(file))
    if (fileInputRef.current) {
      fileInputRef.current.files = dataTransfer.files
    }

    setFiles(accepted)
    setRejectedNames(rejected)
    setFormError(null)
    // A fresh selection starts a fresh batch — clear any previous batch's
    // per-file results instead of leaving them to linger (or, worse,
    // appending the next batch's rows onto them).
    setResults([])
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return

    if (files.length === 0) {
      setFormError('Selecione ao menos um CV (PDF ou DOCX).')
      return
    }

    setFormError(null)
    const batch = files
    setResults(batch.map((file) => ({ name: file.name, status: 'pending', message: null })))

    startTransition(async () => {
      // Sequential on purpose (not Promise.all): keeps memory and Claude API
      // concurrency bounded, and lets the status list update file-by-file
      // instead of jumping from all-pending to all-done at once.
      for (let i = 0; i < batch.length; i++) {
        const file = batch[i]
        const formData = new FormData()
        formData.set('cvFile', file)

        let outcome: UploadCvState
        try {
          outcome = await uploadCvAction(EMPTY_ACTION_STATE, formData)
        } catch {
          outcome = { error: 'Erro inesperado ao importar esse CV. Tenta de novo.', message: null }
        }

        setResults((prev) => {
          const next = [...prev]
          next[i] = {
            name: file.name,
            status: outcome.error ? 'error' : 'ok',
            message: outcome.error ?? outcome.message,
          }
          return next
        })
      }

      // uploadCvAction already calls revalidatePath('/perfil') internally,
      // but that's scoped to the Server Action's own request — it does not
      // reliably re-render this already-mounted page for a chain of calls
      // kicked off from client code instead of a <form action={...}>
      // submit. router.refresh() is the explicit, reliable trigger for
      // that, so PerfilPage's getMasterDataBank re-fetch actually happens.
      router.refresh()

      setFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  const total = results.length
  const succeeded = results.filter((r) => r.status === 'ok').length
  const failed = results.filter((r) => r.status === 'error').length

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 'var(--space-6)' }}>
      {rejectedNames.length > 0 && (
        <div className="alert alert-error" role="alert">
          {rejectedNames.length === 1
            ? `"${rejectedNames[0]}" não entrou na importação: arquivo muito grande (máx 4MB). Tenta um PDF/DOCX menor ou comprimido.`
            : `${rejectedNames.length} CVs não entraram na importação por serem muito grandes (máx 4MB cada): ${rejectedNames.join(', ')}. Tenta versões menores ou comprimidas.`}
        </div>
      )}
      {formError && <div className="alert alert-error" role="alert">{formError}</div>}

      <div className="upload-field">
        <label htmlFor="cvFiles">Subir CVs (PDF ou DOCX) — pode selecionar vários de uma vez; complementam o que já existe, não substituem</label>
        <input
          ref={fileInputRef}
          id="cvFiles"
          name="cvFiles"
          type="file"
          accept=".pdf,.docx"
          multiple
          disabled={isPending}
          onChange={handleFilesChange}
        />
      </div>

      {results.length > 0 && (
        <div className="field" style={{ marginTop: 'var(--space-4)' }}>
          <span className="hint">
            {isPending
              ? `Importando ${succeeded + failed} de ${total}… (${succeeded} ok, ${failed} erro)`
              : `Concluído: ${succeeded} de ${total} importado${succeeded === 1 ? '' : 's'}${failed > 0 ? `, ${failed} com erro` : ''}.`}
          </span>
          <ul className="upload-status-list">
            {results.map((result, index) => (
              <li key={`${index}-${result.name}`} className={`upload-status-row upload-status-row--${result.status}`}>
                <span className="upload-status-row__name">{result.name}</span>
                <span className="upload-status-row__state">
                  {result.status === 'pending' && 'aguardando…'}
                  {result.status === 'ok' && (result.message ?? 'importado')}
                  {result.status === 'error' && (result.message ?? 'erro ao importar')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || files.length === 0}
        className="btn btn-primary"
        style={{ marginTop: 'var(--space-4)' }}
      >
        {isPending ? 'Importando…' : files.length > 1 ? `Importar ${files.length} CVs` : 'Importar CV'}
      </button>
    </form>
  )
}
