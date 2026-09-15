'use client'

import { useActionState } from 'react'
import { updateProfileAction, importGithubAction, type UpdateProfileState, type ImportGithubState } from '@/app/actions/profile'

const initialUpdateState: UpdateProfileState = { error: null, savedAt: 0 }
const initialImportState: ImportGithubState = { error: null, message: null }

export function GithubSection({ githubUrl }: { githubUrl: string | null }) {
  const [updateState, updateFormAction, updatePending] = useActionState(updateProfileAction, initialUpdateState)
  const [importState, importFormAction, importPending] = useActionState(importGithubAction, initialImportState)

  return (
    <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
      <form action={updateFormAction} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="github_url">URL do GitHub</label>
          <input id="github_url" name="github_url" type="url" defaultValue={githubUrl ?? ''} placeholder="https://github.com/seu-usuario" />
        </div>
        <button type="submit" disabled={updatePending} className="btn btn-secondary">
          {updatePending ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
      {updateState.error && <div className="alert alert-error" role="alert" style={{ marginTop: 8 }}>{updateState.error}</div>}

      <form action={importFormAction} style={{ marginTop: 12 }}>
        <button type="submit" disabled={importPending} className="btn btn-primary">
          {importPending ? 'Importando…' : 'Importar do GitHub'}
        </button>
      </form>
      {importState.error && <div className="alert alert-error" role="alert" style={{ marginTop: 8 }}>{importState.error}</div>}
      {importState.message && <div className="alert alert-info" role="status" style={{ marginTop: 8 }}>{importState.message}</div>}
    </div>
  )
}
