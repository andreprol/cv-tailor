'use client'

import { useActionState, useRef, useState } from 'react'
import { uploadCvAction, type UploadCvState } from '@/app/actions/upload-cv'

const initialState: UploadCvState = { error: null, message: null }

const POSITIONING_OPTIONS = ['TPM', 'AI Product', 'Web3'] as const

// Keep in sync with next.config.mjs's serverActions.bodySizeLimit (4mb),
// which itself is capped by Vercel's hard 4.5MB platform limit for
// Serverless Functions. Checking here gives an immediate, friendly error
// instead of a slow upload attempt that fails with an opaque 413.
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024

export function UploadCvForm() {
  const [state, formAction, pending] = useActionState(uploadCvAction, initialState)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (file && file.size > MAX_FILE_SIZE_BYTES) {
      setSizeError('Arquivo muito grande (máx 4MB). Tenta um PDF/DOCX menor ou comprimido.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setSizeError(null)
  }

  return (
    <form action={formAction} className="card" style={{ marginBottom: 'var(--space-6)' }}>
      {sizeError && <div className="alert alert-error" role="alert">{sizeError}</div>}
      {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
      {state.message && <div className="alert alert-info" role="status">{state.message}</div>}

      <div className="upload-field">
        <label htmlFor="cvFile">Subir CV novo (PDF ou DOCX) — complementa o que já existe, não substitui</label>
        <input
          ref={fileInputRef}
          id="cvFile"
          name="cvFile"
          type="file"
          accept=".pdf,.docx"
          required
          onChange={handleFileChange}
        />
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

      <button type="submit" disabled={pending || !!sizeError} className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
        {pending ? 'Importando…' : 'Importar CV'}
      </button>
    </form>
  )
}
