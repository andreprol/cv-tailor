'use client'

import { useActionState } from 'react'
import { uploadCvAction, type UploadCvState } from '@/app/actions/upload-cv'

const initialState: UploadCvState = { error: null, message: null }

const POSITIONING_OPTIONS = ['TPM', 'AI Product', 'Web3'] as const

export function UploadCvForm() {
  const [state, formAction, pending] = useActionState(uploadCvAction, initialState)

  return (
    <form action={formAction} className="card" style={{ marginBottom: 'var(--space-6)' }}>
      {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
      {state.message && <div className="alert alert-info" role="status">{state.message}</div>}

      <div className="upload-field">
        <label htmlFor="cvFile">Subir CV novo (PDF ou DOCX) — complementa o que já existe, não substitui</label>
        <input id="cvFile" name="cvFile" type="file" accept=".pdf,.docx" required />
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

      <button type="submit" disabled={pending} className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
        {pending ? 'Importando…' : 'Importar CV'}
      </button>
    </form>
  )
}
