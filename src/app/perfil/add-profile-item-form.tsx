'use client'

import { useActionState, useEffect, useState } from 'react'
import { addProfileItemAction, type AddProfileItemState } from '@/app/actions/profile-items'
import type { ProfileItemTable } from '@/lib/repository'

const POSITIONING_OPTIONS = ['TPM', 'AI Product', 'Web3'] as const

const initialAddState: AddProfileItemState = { error: null, addedAt: 0 }

export function AddProfileItemForm({ table }: { table: ProfileItemTable }) {
  const [adding, setAdding] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [state, formAction, pending] = useActionState(addProfileItemAction.bind(null, table), initialAddState)

  useEffect(() => {
    if (state.addedAt > 0) {
      setAdding(false)
      setFormKey((k) => k + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.addedAt])

  if (!adding) {
    return (
      <button type="button" onClick={() => setAdding(true)} className="btn btn-secondary" style={{ marginBottom: 'var(--space-3)' }}>
        + Adicionar
      </button>
    )
  }

  return (
    <form key={formKey} action={formAction} className="card" style={{ marginBottom: 'var(--space-3)' }}>
      {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}

      {table === 'achievements' && (
        <>
          <div className="field">
            <label htmlFor="add-company">Empresa</label>
            <input id="add-company" name="company" required />
          </div>
          <div className="field">
            <label htmlFor="add-role_title">Cargo</label>
            <input id="add-role_title" name="role_title" required />
          </div>
          <div className="field">
            <label htmlFor="add-bullet">Conquista</label>
            <textarea id="add-bullet" name="bullet" rows={3} required />
          </div>
          <div className="field">
            <label htmlFor="add-metric">Métrica (opcional)</label>
            <input id="add-metric" name="metric" />
          </div>
          <div className="field">
            <label htmlFor="add-start_date">Data de início</label>
            <input id="add-start_date" name="start_date" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="add-end_date">Data de fim (opcional)</label>
            <input id="add-end_date" name="end_date" type="date" />
          </div>
        </>
      )}

      {table === 'skills' && (
        <>
          <div className="field">
            <label htmlFor="add-name">Skill</label>
            <input id="add-name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="add-category">Categoria</label>
            <input id="add-category" name="category" required />
          </div>
        </>
      )}

      {table === 'education' && (
        <>
          <div className="field">
            <label htmlFor="add-institution">Instituição</label>
            <input id="add-institution" name="institution" required />
          </div>
          <div className="field">
            <label htmlFor="add-degree">Curso</label>
            <input id="add-degree" name="degree" required />
          </div>
          <div className="field">
            <label htmlFor="add-completed_on">Data de conclusão (opcional)</label>
            <input id="add-completed_on" name="completed_on" type="date" />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input name="in_progress" type="checkbox" value="on" /> Em andamento
            </label>
          </div>
        </>
      )}

      {table === 'certifications' && (
        <>
          <div className="field">
            <label htmlFor="add-name">Certificação</label>
            <input id="add-name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="add-issuer">Emissor (opcional)</label>
            <input id="add-issuer" name="issuer" />
          </div>
          <div className="field">
            <label htmlFor="add-issued_on">Data de emissão (opcional)</label>
            <input id="add-issued_on" name="issued_on" type="date" />
          </div>
        </>
      )}

      <div className="field">
        <span className="hint">Tags de posicionamento (opcional)</span>
        <div style={{ display: 'flex', gap: 12 }}>
          {POSITIONING_OPTIONS.map((tag) => (
            <label key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" name="positioning" value={tag} /> {tag}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? 'Salvando…' : 'Adicionar'}</button>
        <button type="button" onClick={() => setAdding(false)} className="btn btn-secondary">Cancelar</button>
      </div>
    </form>
  )
}
