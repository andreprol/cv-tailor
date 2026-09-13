import type Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { parseImportedCv, type ImportedCv } from './import-schema'

const EXTRACTION_PROMPT = `Extraia do curriculo TODAS as conquistas reais (bullet points de work experience), skills, formacao e certificacoes, como JSON no formato exato:
{"achievements": [{"company": "...", "roleTitle": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD ou null", "bullet": "texto exato do bullet", "metric": "numero/percentual citado ou null"}], "skills": [{"name": "...", "category": "..."}], "education": [{"institution": "...", "degree": "...", "completedOn": "YYYY-MM-DD ou null", "inProgress": false}], "certifications": [{"name": "...", "issuer": "...", "issuedOn": "YYYY-MM-DD ou null"}]}
Copie o texto do bullet LITERALMENTE, sem reescrever. Responda APENAS com o JSON.`

export type CvFileKind = 'pdf' | 'docx'

async function callOncePdf(anthropic: Anthropic, buffer: Buffer): Promise<ImportedCv> {
  const response = await anthropic.beta.messages.create({
    model: 'claude-sonnet-5',
    // claude-sonnet-5 uses extended thinking by default, which consumes part
    // of max_tokens before the model starts writing its answer. A lower
    // value here previously caused silent truncation elsewhere in this
    // codebase (a thinking-only response with no text block ever produced —
    // see the identical comment in claude-generation.ts and the old
    // scripts/import-cv.ts). 16000 leaves real headroom above what a
    // CV-sized extraction actually uses.
    max_tokens: 16000,
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
  return parseImportedCv(textBlock.text)
}

async function callOnceDocx(anthropic: Anthropic, text: string): Promise<ImportedCv> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    // Same rationale as callOncePdf above — extended thinking needs headroom.
    max_tokens: 16000,
    messages: [{ role: 'user', content: `${EXTRACTION_PROMPT}\n\nTEXTO DO CURRICULO:\n${text}` }],
  })
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
  }
  return parseImportedCv(textBlock.text)
}

export async function extractCvData(anthropic: Anthropic, kind: CvFileKind, buffer: Buffer): Promise<ImportedCv> {
  if (kind === 'pdf') {
    try {
      return await callOncePdf(anthropic, buffer)
    } catch {
      return await callOncePdf(anthropic, buffer)
    }
  }

  // Mammoth parsing is deterministic local work, not a transient failure —
  // a corrupt/unparseable buffer fails identically every time. Extract once,
  // outside the retry loop, so the retry only covers the actual Claude call
  // (and a genuinely broken upload fails fast with its real error, instead
  // of being masked by a blind retry-then-give-up).
  const { value: text } = await mammoth.extractRawText({ buffer })
  try {
    return await callOnceDocx(anthropic, text)
  } catch {
    return await callOnceDocx(anthropic, text)
  }
}
