'use client'

import { useState } from 'react'
import { deleteApplicationAction } from '@/app/actions/delete-application'

export function DeleteApplicationButton({ applicationId }: { applicationId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (confirming) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <form
            action={async () => {
              setPending(true)
              setError(null)
              try {
                await deleteApplicationAction(applicationId)
              } catch {
                setPending(false)
                setError('Erro ao apagar. Tente novamente.')
              }
            }}
          >
            <button type="submit" disabled={pending} className="btn btn-secondary" style={{ color: 'var(--danger)' }}>
              {pending ? 'Apagando…' : 'Confirmar'}
            </button>
          </form>
          <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="btn btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className="btn btn-secondary">
      Apagar
    </button>
  )
}
