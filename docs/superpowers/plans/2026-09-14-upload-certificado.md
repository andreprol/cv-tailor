# Upload de certificado de curso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o André subir certificados de curso (PDF, DOCX ou imagem) no Perfil e extrair automaticamente nome/emissor/data pra popular a seção Certificações já existente.

**Architecture:** `certificate-schema.ts` valida o formato extraído; `extract-certificate.ts` chama a Claude (documento ou visão, conforme o tipo de arquivo) com um prompt dedicado a certificado (não o de CV); `uploadCertificateAction` liga tudo ao `insertCertifications` já existente (dedup automático); `UploadCertificateForm` espelha o `UploadCvForm` já existente (multi-arquivo, status por arquivo).

**Tech Stack:** Next.js 15 Server Actions, `@anthropic-ai/sdk` (texto/PDF/visão, já em uso no projeto), `mammoth` (DOCX), Zod.

---

### Task 1: `certificate-schema.ts`

**Files:**
- Create: `cv-tailor/src/lib/certificate-schema.ts`

- [ ] **Step 1: Criar o schema**

```ts
import { z } from 'zod'
import { stripMarkdownFence } from './strip-markdown-fence'

export const certificateExtractionSchema = z.object({
  certifications: z.array(z.object({
    name: z.string().min(1),
    issuer: z.string().nullable(),
    issuedOn: z.string().nullable(),
  })),
})

export type CertificateExtraction = z.infer<typeof certificateExtractionSchema>

export function parseCertificateExtraction(raw: string): CertificateExtraction {
  const json = JSON.parse(stripMarkdownFence(raw))
  return certificateExtractionSchema.parse(json)
}
```

`stripMarkdownFence` já existe em `src/lib/strip-markdown-fence.ts` (usado por `import-schema.ts`).

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/lib/certificate-schema.ts
git commit -m "feat(cv-tailor): adiciona certificate-schema.ts"
```

---

### Task 2: `extract-certificate.ts`

**Files:**
- Create: `cv-tailor/src/lib/extract-certificate.ts`

- [ ] **Step 1: Implementar**

```ts
import type Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { parseCertificateExtraction, type CertificateExtraction } from './certificate-schema'

const EXTRACTION_PROMPT = `Este documento e um certificado de curso/treinamento. Extraia o(s) curso(s) certificado(s) como JSON no formato exato:
{"certifications": [{"name": "nome exato do curso", "issuer": "instituicao/plataforma que emitiu, ou null se nao identificavel", "issuedOn": "YYYY-MM-DD ou null se a data nao aparecer"}]}
Normalmente e um curso so por documento, mas liste todos se houver mais de um. Responda APENAS com o JSON.`

export type CertificateFileKind = 'pdf' | 'docx' | 'image'
export type ImageMediaType = 'image/jpeg' | 'image/png'

async function callOncePdf(anthropic: Anthropic, buffer: Buffer): Promise<CertificateExtraction> {
  const response = await anthropic.beta.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    betas: ['pdfs-2024-09-25'],
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
        { type: 'text', text: EXTRACTION_PROMPT },
      ],
    }],
  })
  const textBlock = response.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
  }
  return parseCertificateExtraction(textBlock.text)
}

async function callOnceDocx(anthropic: Anthropic, text: string): Promise<CertificateExtraction> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    messages: [{ role: 'user', content: `${EXTRACTION_PROMPT}\n\nTEXTO DO CERTIFICADO:\n${text}` }],
  })
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
  }
  return parseCertificateExtraction(textBlock.text)
}

async function callOnceImage(anthropic: Anthropic, buffer: Buffer, mediaType: ImageMediaType): Promise<CertificateExtraction> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
        { type: 'text', text: EXTRACTION_PROMPT },
      ],
    }],
  })
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
  }
  return parseCertificateExtraction(textBlock.text)
}

export async function extractCertificateData(anthropic: Anthropic, kind: CertificateFileKind, buffer: Buffer, imageMediaType?: ImageMediaType): Promise<CertificateExtraction> {
  if (kind === 'pdf') {
    try {
      return await callOncePdf(anthropic, buffer)
    } catch {
      return await callOncePdf(anthropic, buffer)
    }
  }
  if (kind === 'image') {
    if (!imageMediaType) throw new Error('imageMediaType obrigatorio para kind "image".')
    try {
      return await callOnceImage(anthropic, buffer, imageMediaType)
    } catch {
      return await callOnceImage(anthropic, buffer, imageMediaType)
    }
  }
  const { value: text } = await mammoth.extractRawText({ buffer })
  try {
    return await callOnceDocx(anthropic, text)
  } catch {
    return await callOnceDocx(anthropic, text)
  }
}
```

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/lib/extract-certificate.ts
git commit -m "feat(cv-tailor): adiciona extract-certificate.ts (pdf/docx/imagem)"
```

---

### Task 3: `uploadCertificateAction`

**Files:**
- Create: `cv-tailor/src/app/actions/upload-certificate.ts`

- [ ] **Step 1: Implementar**

```ts
'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { extractCertificateData, type CertificateFileKind, type ImageMediaType } from '@/lib/extract-certificate'
import { insertCertifications } from '@/lib/repository'

export interface UploadCertificateState {
  error: string | null
  message: string | null
}

function detectFileKind(file: File): CertificateFileKind | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx'
  if (file.type.startsWith('image/') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')) return 'image'
  return null
}

function detectImageMediaType(file: File): ImageMediaType | null {
  if (file.type === 'image/jpeg' || file.type === 'image/png') return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.png')) return 'image/png'
  return null
}

export async function uploadCertificateAction(_prevState: UploadCertificateState, formData: FormData): Promise<UploadCertificateState> {
  const file = formData.get('certificateFile')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo PDF, DOCX ou imagem (JPG/PNG).', message: null }
  }

  const kind = detectFileKind(file)
  if (!kind) {
    return { error: 'Formato nao suportado. Envie um arquivo .pdf, .docx, .jpg ou .png.', message: null }
  }

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', message: null }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let extracted
  try {
    const imageMediaType = kind === 'image' ? detectImageMediaType(file) ?? undefined : undefined
    extracted = await extractCertificateData(anthropic, kind, buffer, imageMediaType)
  } catch {
    return { error: 'Nao consegui ler esse certificado. Tenta outro arquivo.', message: null }
  }

  if (extracted.certifications.length === 0) {
    return { error: 'Nenhum certificado encontrado nesse arquivo.', message: null }
  }

  const db = createServiceClient()
  let inserted: number
  try {
    inserted = await insertCertifications(db, userId, [], extracted.certifications)
  } catch (error) {
    console.error('uploadCertificateAction: falha ao salvar certificado:', error)
    return { error: 'Erro ao salvar o certificado. Tente novamente.', message: null }
  }

  revalidatePath('/perfil')

  if (inserted === 0) {
    return { error: null, message: 'Esse certificado ja estava no seu banco (nao duplicado).' }
  }
  return { error: null, message: `Importado: ${inserted} certificado${inserted === 1 ? '' : 's'}.` }
}
```

Notas de implementação: `extracted.certifications` já tem exatamente o shape que `insertCertifications`
espera (`{ name, issuer, issuedOn }[]`) — nenhuma transformação necessária entre extração e insert.

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/app/actions/upload-certificate.ts
git commit -m "feat(cv-tailor): adiciona uploadCertificateAction"
```

---

### Task 4: `UploadCertificateForm` + wiring no Perfil

**Files:**
- Create: `cv-tailor/src/app/perfil/upload-certificate-form.tsx`
- Modify: `cv-tailor/src/app/perfil/page.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadCertificateAction, type UploadCertificateState } from '@/app/actions/upload-certificate'

const EMPTY_ACTION_STATE: UploadCertificateState = { error: null, message: null }

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024

type FileStatus = 'pending' | 'ok' | 'error'

interface FileResult {
  name: string
  status: FileStatus
  message: string | null
}

export function UploadCertificateForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<File[]>([])
  const [rejectedNames, setRejectedNames] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [results, setResults] = useState<FileResult[]>([])

  function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    const accepted: File[] = []
    const rejected: string[] = []

    for (const file of selected) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        rejected.push(file.name)
      } else {
        accepted.push(file)
      }
    }

    const dataTransfer = new DataTransfer()
    accepted.forEach((file) => dataTransfer.items.add(file))
    if (fileInputRef.current) {
      fileInputRef.current.files = dataTransfer.files
    }

    setFiles(accepted)
    setRejectedNames(rejected)
    setFormError(null)
    setResults([])
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return

    if (files.length === 0) {
      setFormError('Selecione ao menos um certificado (PDF, DOCX ou imagem).')
      return
    }

    setFormError(null)
    const batch = files
    setResults(batch.map((file) => ({ name: file.name, status: 'pending', message: null })))

    startTransition(async () => {
      for (let i = 0; i < batch.length; i++) {
        const file = batch[i]
        const formData = new FormData()
        formData.set('certificateFile', file)

        let outcome: UploadCertificateState
        try {
          outcome = await uploadCertificateAction(EMPTY_ACTION_STATE, formData)
        } catch {
          outcome = { error: 'Erro inesperado ao importar esse certificado. Tenta de novo.', message: null }
        }

        setResults((prev) => {
          const next = [...prev]
          next[i] = {
            name: file.name,
            status: outcome.error ? 'error' : 'ok',
            message: outcome.error ?? outcome.message,
          }
          return next
        })
      }

      router.refresh()
      setFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  const total = results.length
  const succeeded = results.filter((r) => r.status === 'ok').length
  const failed = results.filter((r) => r.status === 'error').length

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 'var(--space-4)' }}>
      {rejectedNames.length > 0 && (
        <div className="alert alert-error" role="alert">
          {rejectedNames.length === 1
            ? `"${rejectedNames[0]}" não entrou: arquivo muito grande (máx 4MB).`
            : `${rejectedNames.length} certificados não entraram por serem muito grandes (máx 4MB cada): ${rejectedNames.join(', ')}.`}
        </div>
      )}
      {formError && <div className="alert alert-error" role="alert">{formError}</div>}

      <div className="upload-field">
        <label htmlFor="certificateFiles">Subir certificados (PDF, DOCX ou imagem) — pode selecionar vários de uma vez</label>
        <input
          ref={fileInputRef}
          id="certificateFiles"
          name="certificateFiles"
          type="file"
          accept=".pdf,.docx,.jpg,.jpeg,.png"
          multiple
          disabled={isPending}
          onChange={handleFilesChange}
        />
      </div>

      {results.length > 0 && (
        <div className="field" style={{ marginTop: 'var(--space-4)' }}>
          <span className="hint">
            {isPending
              ? `Importando ${succeeded + failed} de ${total}… (${succeeded} ok, ${failed} erro)`
              : `Concluído: ${succeeded} de ${total} importado${succeeded === 1 ? '' : 's'}${failed > 0 ? `, ${failed} com erro` : ''}.`}
          </span>
          <ul className="upload-status-list">
            {results.map((result, index) => (
              <li key={`${index}-${result.name}`} className={`upload-status-row upload-status-row--${result.status}`}>
                <span className="upload-status-row__name">{result.name}</span>
                <span className="upload-status-row__state">
                  {result.status === 'pending' && 'aguardando…'}
                  {result.status === 'ok' && (result.message ?? 'importado')}
                  {result.status === 'error' && (result.message ?? 'erro ao importar')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || files.length === 0}
        className="btn btn-primary"
        style={{ marginTop: 'var(--space-4)' }}
      >
        {isPending ? 'Importando…' : files.length > 1 ? `Importar ${files.length} certificados` : 'Importar certificado'}
      </button>
    </form>
  )
}
```

Este componente espelha `src/app/perfil/upload-cv-form.tsx` quase linha a linha (mesmo padrão de
multi-arquivo, status sequencial, limite de 4MB) — só troca o nome do campo do FormData
(`certificateFile`/`certificateFiles`), a action chamada, e os tipos de arquivo aceitos.

- [ ] **Step 2: Inserir no Perfil**

Localizar, no topo de `src/app/perfil/page.tsx`:

```ts
import { AddProfileItemForm } from './add-profile-item-form'
import { GithubSection } from './github-section'
```

Adicionar logo abaixo:

```ts
import { UploadCertificateForm } from './upload-certificate-form'
```

Localizar:

```tsx
      <h2>Certificações</h2>
      <AddProfileItemForm table="certifications" />
      <ProfileItemList table="certifications" items={certificationItems} />
```

Trocar por:

```tsx
      <h2>Certificações</h2>
      <UploadCertificateForm />
      <AddProfileItemForm table="certifications" />
      <ProfileItemList table="certifications" items={certificationItems} />
```

- [ ] **Step 3: Rodar `tsc --noEmit` e `npm run build`**

Run: `cd cv-tailor && npx tsc --noEmit && npm run build`
Expected: sem erros, build completo

- [ ] **Step 4: Commit**

```bash
git add cv-tailor/src/app/perfil/upload-certificate-form.tsx cv-tailor/src/app/perfil/page.tsx
git commit -m "feat(cv-tailor): adiciona UploadCertificateForm na secao Certificacoes"
```

---

### Task 5: Verificação manual contra Claude/Supabase reais

**Não é subagent** — precisa de chamada real à API da Claude e sessão logada.

- [ ] **Step 1: Subir um certificado real em PDF**

Confirma que aparece em Certificações com nome/emissor/data corretos.

- [ ] **Step 2: Subir um print (imagem) de certificado**

Confirma que a extração via visão funciona igual ao PDF.

- [ ] **Step 3: Subir o mesmo certificado de novo**

Confirma que não duplica — mensagem "Esse certificado ja estava no seu banco".

- [ ] **Step 4: Subir um arquivo que não é certificado**

Confirma que não quebra feio — erro amigável ou "Nenhum certificado encontrado nesse arquivo."

- [ ] **Step 5: Subir vários certificados de uma vez**

Selecionar 2-3 arquivos no mesmo upload — confirma que a barra de status mostra progresso por
arquivo, igual ao upload de CV.

---

## Fora de escopo (confirmado na spec)

- Extrair de link direto (Coursera/Udemy) em vez de arquivo
- OCR dedicado (usa a visão da própria Claude)
- Deduplicação "quase igual" entre formatos diferentes do mesmo certificado
