# Upload de certificado de curso

## Contexto

André quer popular a seção "Certificações" do Perfil (criada hoje, feature de adicionar item
manual) subindo os certificados de curso reais que ele tem, em vez de digitar cada um à mão. Mesmo
espírito do upload de CV — extrai automaticamente, deixa curadoria manual pra depois.

**Formatos aceitos**: PDF, DOCX e imagem (JPG/PNG) — certificados de curso frequentemente são só um
print de tela, diferente do CV que é sempre um documento de texto.

## O que muda

### `src/lib/certificate-schema.ts` (novo)

Schema Zod dedicado (array, cobre o raro caso de um documento listar mais de um curso):

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

### `src/lib/extract-certificate.ts` (novo)

Extração dedicada — prompt próprio pra certificado (não reaproveita o prompt de CV, que espera
achievements/skills/formação e confundiria o modelo com um documento de shape diferente). Espelha
`import-cv.ts` (PDF/DOCX) e `extract-job-image.ts` (imagem), já existentes no projeto:

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

`max_tokens: 4000` (menor que os 16000 do CV) porque um certificado é um documento curto — mesmo
raciocínio de "thinking estendido consome parte do budget" já documentado no resto do projeto, só
que a resposta esperada aqui é muito menor.

### `src/app/actions/upload-certificate.ts` (novo)

Espelha `upload-cv.ts`, mas sem o dedup em memória (já removido de lá hoje) — direto pro
`insertCertifications` (já `upsert`+`ignoreDuplicates`):

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

### `src/app/perfil/upload-certificate-form.tsx` (novo)

Espelha `upload-cv-form.tsx` (multi-arquivo, status por arquivo, mesmo limite de 4MB por arquivo já
usado no resto do app) — não reproduzido aqui em detalhe na spec (será escrito completo no plano),
mas segue exatamente o mesmo padrão visual e de submissão sequencial.

### UI — `src/app/perfil/page.tsx`

`UploadCertificateForm` entra na seção "Certificações" já existente, acima do `AddProfileItemForm`
e da `ProfileItemList`:

```tsx
      <h2>Certificações</h2>
      <UploadCertificateForm />
      <AddProfileItemForm table="certifications" />
      <ProfileItemList table="certifications" items={certificationItems} />
```

## Fora de escopo

- Extrair certificados de outros tipos de documento além de PDF/DOCX/imagem (ex: link direto pra
  Coursera/Udemy)
- OCR dedicado — a extração de imagem usa a visão da própria Claude (já validado no projeto pro
  print de vaga), sem biblioteca de OCR separada
- Detectar duplicata "quase igual" entre imagem e PDF do mesmo certificado (ex: subir o mesmo curso
  como print E como PDF) — a constraint única já existente considera nome+emissor+data
  normalizados; se o texto extraído divergir entre os dois uploads (ex: nome do curso levemente
  diferente), pode gerar duas linhas. Aceito, mesma filosofia de "extração generosa, curadoria
  manual depois".

## Testes

`extract-certificate.ts`/`certificate-schema.ts` não ganham teste automatizado direto (chamada real
à API da Claude, mesma limitação do resto do projeto) — mas `certificate-schema.ts`'s `parse`
puro (sem chamada de rede) pode ganhar teste unitário simples se o plano decidir incluir. Verificação
principal é manual:
1. Subir um certificado real em PDF — confirma que aparece em Certificações.
2. Subir um print (imagem) de certificado — confirma que a extração via visão funciona.
3. Subir o mesmo certificado de novo — confirma que não duplica.
4. Subir um arquivo que não é certificado (ex: foto aleatória) — confirma que não quebra feio (erro
   amigável ou "nenhum certificado encontrado").
