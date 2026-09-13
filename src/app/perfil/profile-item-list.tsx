'use client'

import { useActionState, useState } from 'react'
import { deleteProfileItemAction, updateProfileItemAction, type UpdateProfileItemState } from '@/app/actions/profile-items'
import type { Positioning } from '@/lib/types'

export interface ItemField {
  name: string
  label: string
  value: string
  multiline?: boolean
}

export interface ProfileItem {
  id: string
  positioning: Positioning[]
  primary: string
  secondary: string
  fields: ItemField[]
}

const initialEditState: UpdateProfileItemState = { error: null }

function ProfileItemRow({ table, item }: { table: string; item: ProfileItem }) {
  const [editing, setEditing] = useState(false)
  const [state, formAction, pending] = useActionState(updateProfileItemAction.bind(null, table, item.id), initialEditState)

  if (editing) {
    return (
      <form action={formAction} className="card" style={{ marginBottom: 'var(--space-2)' }}>
        {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
        {item.fields.map((field) => (
          <div className="field" key={field.name}>
            <label htmlFor={`${item.id}-${field.name}`}>{field.label}</label>
            {field.multiline ? (
              <textarea id={`${item.id}-${field.name}`} name={field.name} defaultValue={field.value} rows={3} />
            ) : (
              <input id={`${item.id}-${field.name}`} name={field.name} defaultValue={field.value} />
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
        <form action={deleteProfileItemAction.bind(null, table, item.id)}>
          <button type="submit" className="btn btn-secondary">Apagar</button>
        </form>
      </div>
    </div>
  )
}

export function ProfileItemList({ table, items }: { table: string; items: ProfileItem[] }) {
  if (items.length === 0) {
    return <p className="hint">Nenhum item ainda.</p>
  }
  return (
    <div>
      {items.map((item) => <ProfileItemRow key={item.id} table={table} item={item} />)}
    </div>
  )
}
