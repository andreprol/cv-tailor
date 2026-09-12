'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { createApplicationAction, type CreateApplicationState } from '@/app/actions/create-application'

const initialState: CreateApplicationState = { error: null, company: '', roleTitle: '', sourceUrl: '', jobDescriptionRaw: '' }

export default function NewApplicationPage() {
  const [state, formAction, pending] = useActionState(createApplicationAction, initialState)

  return (
    <main className="container">
      <Link href="/" className="back-link">← Candidaturas</Link>
      <h1>Nova candidatura</h1>

      {state.error && (
        <div className="alert alert-error" role="alert">{state.error}</div>
      )}

      <form action={formAction} className="card">
        <div className="field">
          <label htmlFor="company">Empresa</label>
          <input id="company" name="company" required defaultValue={state.company} placeholder="Ex.: Acme Global Tech" />
        </div>

        <div className="field">
          <label htmlFor="roleTitle">Cargo (título exato da vaga)</label>
          <input id="roleTitle" name="roleTitle" required defaultValue={state.roleTitle} placeholder="Ex.: Senior Technical Program Manager" />
        </div>

        <div className="field">
          <label htmlFor="sourceUrl">Link da vaga <span className="hint">(opcional)</span></label>
          <input id="sourceUrl" name="sourceUrl" type="url" defaultValue={state.sourceUrl} placeholder="https://..." />
        </div>

        <div className="field">
          <label htmlFor="jobDescriptionRaw">Ou cole o texto da vaga <span className="hint">(obrigatório se o link não puder ser lido)</span></label>
          <textarea id="jobDescriptionRaw" name="jobDescriptionRaw" rows={10} defaultValue={state.jobDescriptionRaw} placeholder="Cole aqui a descrição completa da vaga..." />
        </div>

        <button type="submit" disabled={pending} className="btn btn-primary btn-block">
          {pending ? 'Enviando…' : 'Continuar'}
        </button>
      </form>
    </main>
  )
}
