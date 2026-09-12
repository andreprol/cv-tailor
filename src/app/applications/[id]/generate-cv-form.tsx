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
    <form action={formAction}>
      {state.error && <p role="alert" style={{ color: 'crimson' }}>{state.error}</p>}
      <textarea name="jobDescriptionRaw" rows={12} style={{ display: 'block', width: '100%' }} defaultValue={initialJobDescription} />
      <button type="submit" disabled={pending}>{pending ? 'Gerando...' : hasCv ? 'Gerar de novo' : 'Gerar CV'}</button>
    </form>
  )
}
