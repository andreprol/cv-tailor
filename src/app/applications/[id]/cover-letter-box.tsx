'use client'

import { useState } from 'react'

type CopyState = 'idle' | 'copied' | 'error'

export function CoverLetterBox({ coverLetter, fullName }: { coverLetter: string; fullName: string }) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const fullText = `${coverLetter}\n\n${fullName}`

  async function handleCopy() {
    // navigator.clipboard can be undefined (non-secure context, older
    // browser) or its promise can reject (permission denied) — without this,
    // the button silently does nothing and looks like it copied when it
    // didn't.
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API indisponivel')
      await navigator.clipboard.writeText(fullText)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
    setTimeout(() => setCopyState('idle'), 2000)
  }

  const buttonLabel = copyState === 'copied' ? '✓ Copiado!' : copyState === 'error' ? '✕ Falhou, selecione e copie manualmente' : '📋 Copiar'

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="hint">Cole direto em campos de candidatura simplificada (LinkedIn e outros).</span>
        <button type="button" onClick={handleCopy} className="btn btn-secondary">
          {buttonLabel}
        </button>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{fullText}</pre>
    </div>
  )
}
