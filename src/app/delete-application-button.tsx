'use client'

import { useState } from 'react'
import { deleteApplicationAction } from '@/app/actions/delete-application'

export function DeleteApplicationButton({ applicationId }: { applicationId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <form
          action={async () => {
            setPending(true)
            await deleteApplicationAction(applicationId)
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
    )
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className="btn btn-secondary">
      Apagar
    </button>
  )
}
