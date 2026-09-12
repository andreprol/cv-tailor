'use client'

import { useActionState } from 'react'
import { createApplicationAction, type CreateApplicationState } from '@/app/actions/create-application'

const initialState: CreateApplicationState = { error: null, company: '', roleTitle: '', sourceUrl: '', jobDescriptionRaw: '' }

export default function NewApplicationPage() {
  const [state, formAction, pending] = useActionState(createApplicationAction, initialState)

  return (
    <main style={{ padding: 24, maxWidth: 640 }}>
      <h1>Nova candidatura</h1>
      {state.error && <p role="alert" style={{ color: 'crimson' }}>{state.error}</p>}
      <form action={formAction}>
        <label>
          Empresa
          <input name="company" required defaultValue={state.company} style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Cargo (titulo exato da vaga)
          <input name="roleTitle" required defaultValue={state.roleTitle} style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Link da vaga (opcional)
          <input name="sourceUrl" type="url" defaultValue={state.sourceUrl} style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Ou cole o texto da vaga aqui (obrigatorio se o link nao puder ser lido)
          <textarea name="jobDescriptionRaw" rows={10} defaultValue={state.jobDescriptionRaw} style={{ display: 'block', width: '100%' }} />
        </label>
        <button type="submit" disabled={pending}>{pending ? 'Enviando...' : 'Continuar'}</button>
      </form>
    </main>
  )
}
