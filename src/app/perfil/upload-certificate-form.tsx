'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadCertificateAction, type UploadCertificateState } from '@/app/actions/upload-certificate'

const EMPTY_ACTION_STATE: UploadCertificateState = { error: null, message: null }

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024

type FileStatus = 'pending' | 'ok' | 'error'

interface FileResult {
  name: string
  status: FileStatus
  message: string | null
}

export function UploadCertificateForm() {
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

    const dataTransfer = new DataTransfer()
    accepted.forEach((file) => dataTransfer.items.add(file))
    if (fileInputRef.current) {
      fileInputRef.current.files = dataTransfer.files
    }

    setFiles(accepted)
    setRejectedNames(rejected)
    setFormError(null)
    setResults([])
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return

    if (files.length === 0) {
      setFormError('Selecione ao menos um certificado (PDF, DOCX ou imagem).')
      return
    }

    setFormError(null)
    const batch = files
    setResults(batch.map((file) => ({ name: file.name, status: 'pending', message: null })))

    startTransition(async () => {
      for (let i = 0; i < batch.length; i++) {
        const file = batch[i]
        const formData = new FormData()
        formData.set('certificateFile', file)

        let outcome: UploadCertificateState
        try {
          outcome = await uploadCertificateAction(EMPTY_ACTION_STATE, formData)
        } catch {
          outcome = { error: 'Erro inesperado ao importar esse certificado. Tenta de novo.', message: null }
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

      router.refresh()
      setFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  const total = results.length
  const succeeded = results.filter((r) => r.status === 'ok').length
  const failed = results.filter((r) => r.status === 'error').length

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 'var(--space-4)' }}>
      {rejectedNames.length > 0 && (
        <div className="alert alert-error" role="alert">
          {rejectedNames.length === 1
            ? `"${rejectedNames[0]}" não entrou: arquivo muito grande (máx 4MB).`
            : `${rejectedNames.length} certificados não entraram por serem muito grandes (máx 4MB cada): ${rejectedNames.join(', ')}.`}
        </div>
      )}
      {formError && <div className="alert alert-error" role="alert">{formError}</div>}

      <div className="upload-field">
        <label htmlFor="certificateFiles">Subir certificados (PDF, DOCX ou imagem) — pode selecionar vários de uma vez</label>
        <input
          ref={fileInputRef}
          id="certificateFiles"
          name="certificateFiles"
          type="file"
          accept=".pdf,.docx,.jpg,.jpeg,.png"
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
        {isPending ? 'Importando…' : files.length > 1 ? `Importar ${files.length} certificados` : 'Importar certificado'}
      </button>
    </form>
  )
}
