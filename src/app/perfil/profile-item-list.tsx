'use client'

import { useActionState, useEffect, useState } from 'react'
import { deleteProfileItemAction, updateProfileItemAction, type UpdateProfileItemState } from '@/app/actions/profile-items'
import type { Positioning } from '@/lib/types'
import type { ProfileItemTable } from '@/lib/repository'

export interface ItemField {
  name: string
  label: string
  /** For inputType: 'checkbox', must be exactly the string 'true' or 'false' (checked iff === 'true'). */
  value: string
  multiline?: boolean
  inputType?: 'text' | 'date' | 'checkbox'
}

export interface ProfileItem {
  id: string
  positioning: Positioning[]
  primary: string
  secondary: string
  fields: ItemField[]
}

const initialEditState: UpdateProfileItemState = { error: null, savedAt: 0 }

function ProfileItemRow({ table, item }: { table: ProfileItemTable; item: ProfileItem }) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [state, formAction, pending] = useActionState(updateProfileItemAction.bind(null, table, item.id), initialEditState)

  useEffect(() => {
    if (state.savedAt > 0) {
      setEditing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt])

  if (editing) {
    return (
      <form action={formAction} className="card" style={{ marginBottom: 'var(--space-2)' }}>
        {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
        {item.fields.map((field) => (
          <div className="field" key={field.name}>
            {field.inputType === 'checkbox' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input id={`${item.id}-${field.name}`} name={field.name} type="checkbox" value="on" defaultChecked={field.value === 'true'} />
                {field.label}
              </label>
            ) : (
              <>
                <label htmlFor={`${item.id}-${field.name}`}>{field.label}</label>
                {field.multiline ? (
                  <textarea id={`${item.id}-${field.name}`} name={field.name} defaultValue={field.value} rows={3} />
                ) : (
                  <input
                    id={`${item.id}-${field.name}`}
                    name={field.name}
                    type={field.inputType === 'date' ? 'date' : 'text'}
                    defaultValue={field.value}
                  />
                )}
              </>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={pending} className="btn btn-primary">{pending ? 'Salvando…' : 'Salvar'}</button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary">Cancelar</button>
        </div>
      </form>
    )
  }

  return (
    <div className="profile-item">
      <div>
        <div className="profile-item__title">{item.primary}</div>
        {item.secondary && <div className="profile-item__subtitle">{item.secondary}</div>}
        <div className="profile-item__tags">
          {item.positioning.map((tag) => <span key={tag} className="tag">{tag}</span>)}
        </div>
      </div>
      <div className="profile-item__actions">
        <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary">Editar</button>
        {confirmingDelete ? (
          <>
            <form action={deleteProfileItemAction.bind(null, table, item.id)}>
              <button type="submit" className="btn btn-secondary" style={{ color: 'var(--danger)' }}>Confirmar</button>
            </form>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="btn btn-secondary">Cancelar</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmingDelete(true)} className="btn btn-secondary">Apagar</button>
        )}
      </div>
    </div>
  )
}

export function ProfileItemList({ table, items }: { table: ProfileItemTable; items: ProfileItem[] }) {
  if (items.length === 0) {
    return <p className="hint">Nenhum item ainda.</p>
  }
  return (
    <div>
      {items.map((item) => <ProfileItemRow key={item.id} table={table} item={item} />)}
    </div>
  )
}
