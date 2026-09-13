import type Anthropic from '@anthropic-ai/sdk'

const EXTRACTION_PROMPT = `Extraia o texto completo da vaga de emprego mostrada nesta imagem (print de tela, ex: LinkedIn). Reconstitua o texto de forma legivel e completa, exatamente como aparece na imagem: titulo do cargo, empresa, requisitos, descricao e qualquer outro detalhe relevante. Responda APENAS com o texto da vaga, sem comentario adicional, sem markdown.`

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

async function callOnce(anthropic: Anthropic, buffer: Buffer, mediaType: ImageMediaType): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    // claude-sonnet-5 uses extended thinking by default, which consumes part
    // of max_tokens before the model starts writing its answer — the same
    // root cause already documented in claude-generation.ts/import-cv.ts.
    // A job-posting screenshot's text is much shorter than a full CV, but
    // 8000 leaves comfortable headroom above the thinking budget regardless.
    max_tokens: 8000,
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
  const text = textBlock.text.trim()
  if (!text) {
    throw new Error('Claude retornou texto vazio pra essa imagem.')
  }
  return text
}

export async function extractJobDescriptionFromImage(anthropic: Anthropic, buffer: Buffer, mediaType: ImageMediaType): Promise<string> {
  try {
    return await callOnce(anthropic, buffer, mediaType)
  } catch {
    return await callOnce(anthropic, buffer, mediaType)
  }
}
