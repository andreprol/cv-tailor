import type Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { parseCertificateExtraction, type CertificateExtraction } from './certificate-schema'

const EXTRACTION_PROMPT = `Este documento e um certificado de curso/treinamento. Extraia o(s) curso(s) certificado(s) como JSON no formato exato:
{"certifications": [{"name": "nome exato do curso", "issuer": "instituicao/plataforma que emitiu, ou null se nao identificavel", "issuedOn": "YYYY-MM-DD ou null se a data nao aparecer"}]}
Normalmente e um curso so por documento, mas liste todos se houver mais de um. Responda APENAS com o JSON.`

export type ImageMediaType = 'image/jpeg' | 'image/png'

export type CertificateInput =
  | { kind: 'pdf'; buffer: Buffer }
  | { kind: 'docx'; buffer: Buffer }
  | { kind: 'image'; buffer: Buffer; mediaType: ImageMediaType }

// claude-sonnet-5 uses extended thinking by default, which consumes part of
// max_tokens before the model starts writing its answer — the same root
// cause already documented in claude-generation.ts/import-cv.ts/
// extract-job-image.ts. A certificate extraction is small, but 8000 leaves
// comfortable headroom above the thinking budget regardless.
const MAX_TOKENS = 8000

async function callOncePdf(anthropic: Anthropic, buffer: Buffer): Promise<CertificateExtraction> {
  const response = await anthropic.beta.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: MAX_TOKENS,
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
    max_tokens: MAX_TOKENS,
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
    max_tokens: MAX_TOKENS,
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

export async function extractCertificateData(anthropic: Anthropic, input: CertificateInput): Promise<CertificateExtraction> {
  if (input.kind === 'pdf') {
    try {
      return await callOncePdf(anthropic, input.buffer)
    } catch {
      return await callOncePdf(anthropic, input.buffer)
    }
  }
  if (input.kind === 'image') {
    try {
      return await callOnceImage(anthropic, input.buffer, input.mediaType)
    } catch {
      return await callOnceImage(anthropic, input.buffer, input.mediaType)
    }
  }

  // Mammoth parsing is deterministic local work, not a transient failure —
  // a corrupt/unparseable buffer fails identically every time. Extract once,
  // outside the retry loop, so the retry only covers the actual Claude call
  // (matches the same reasoning already applied in import-cv.ts).
  const { value: text } = await mammoth.extractRawText({ buffer: input.buffer })
  try {
    return await callOnceDocx(anthropic, text)
  } catch {
    return await callOnceDocx(anthropic, text)
  }
}
