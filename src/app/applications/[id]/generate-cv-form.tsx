'use client'

import { useActionState } from 'react'
import { generateCvAction, type GenerateCvState } from '@/app/actions/generate-cv'

const initialState: GenerateCvState = { error: null }

export function GenerateCvForm({
  applicationId,
  initialJobDescription,
  hasCv,
}: {
  applicationId: string
  initialJobDescription: string
  hasCv: boolean
}) {
  const [state, formAction, pending] = useActionState(generateCvAction.bind(null, applicationId), initialState)

  return (
    <form action={formAction} className="card">
      {state.error && (
        <div className="alert alert-error" role="alert">{state.error}</div>
      )}
      <div className="field" style={{ marginBottom: 12 }}>
        <textarea name="jobDescriptionRaw" rows={12} defaultValue={initialJobDescription} aria-label="Texto da vaga" />
      </div>
      <div className="field">
        <label htmlFor="language">Idioma do CV</label>
        <select id="language" name="language" defaultValue="pt">
          <option value="pt">Português</option>
          <option value="en">English</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Gerando…' : hasCv ? 'Gerar de novo' : 'Gerar CV'}
      </button>
    </form>
  )
}
