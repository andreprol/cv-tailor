'use client'

import { useState } from 'react'
import { deleteApplicationAction } from '@/app/actions/delete-application'

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}

export function DeleteApplicationButton({ applicationId }: { applicationId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cancel() {
    setConfirming(false)
    setError(null)
  }

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
              } catch (e) {
                if (isNextRedirectError(e)) throw e
                setPending(false)
                setError('Erro ao apagar. Tente novamente.')
              }
            }}
          >
            <button type="submit" disabled={pending} className="btn btn-secondary" style={{ color: 'var(--danger)' }}>
              {pending ? 'Apagando…' : 'Confirmar'}
            </button>
          </form>
          <button type="button" onClick={cancel} disabled={pending} className="btn btn-secondary">
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
