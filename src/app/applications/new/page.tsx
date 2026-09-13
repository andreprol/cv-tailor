'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { createApplicationAction, type CreateApplicationState } from '@/app/actions/create-application'

const initialState: CreateApplicationState = { error: null, company: '', roleTitle: '', sourceUrl: '', jobDescriptionRaw: '' }

export default function NewApplicationPage() {
  const [state, formAction, pending] = useActionState(createApplicationAction, initialState)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Revoke on unmount too, not just on replacement — otherwise navigating
  // away from this page mid-preview leaks the blob URL for the tab's life.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function setImageFile(file: File | null) {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    if (!file) return
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    if (fileInputRef.current) {
      fileInputRef.current.files = dataTransfer.files
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith('image/'))
    if (!item) return
    const file = item.getAsFile()
    if (!file) return
    event.preventDefault()
    setImageFile(file)
  }

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
          <label htmlFor="jobImage">Ou cole/suba um print da vaga <span className="hint">(imagem — opcional)</span></label>
          <div className="upload-field" onPaste={handlePaste} tabIndex={0}>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Print da vaga colado" style={{ maxHeight: 160, borderRadius: 'var(--radius-md)' }} />
            ) : (
              <span>Clique aqui e cole (Ctrl+V) um print, ou escolha um arquivo abaixo</span>
            )}
            <input
              ref={fileInputRef}
              id="jobImage"
              name="jobImage"
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="jobDescriptionRaw">Ou cole o texto da vaga <span className="hint">(obrigatório se nada acima funcionar)</span></label>
          <textarea id="jobDescriptionRaw" name="jobDescriptionRaw" rows={10} defaultValue={state.jobDescriptionRaw} placeholder="Cole aqui a descrição completa da vaga..." />
        </div>

        <button type="submit" disabled={pending} className="btn btn-primary btn-block">
          {pending ? 'Enviando…' : 'Continuar'}
        </button>
      </form>
    </main>
  )
}
