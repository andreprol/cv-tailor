import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '../src/lib/supabase/server'
import { DEFAULT_USER_ID } from '../src/lib/constants'
import { stripMarkdownFence } from '../src/lib/strip-markdown-fence'

const CV_PATHS = [
  'F:/Particular/CV/CV_Andre_Prol_TCS_AI_TPM.pdf',
]

const EXTRACTION_PROMPT = `Extraia do curriculo em anexo TODAS as conquistas reais (bullet points de work experience), skills, formacao e certificacoes, como JSON no formato:
{"achievements": [{"company": "...", "roleTitle": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD ou null", "bullet": "texto exato do bullet", "metric": "numero/percentual citado ou null", "positioning": ["TPM"]}], "skills": [{"name": "...", "category": "...", "positioning": ["TPM"]}], "education": [{"institution": "...", "degree": "...", "completedOn": "YYYY-MM-DD ou null", "inProgress": false, "positioning": ["TPM"]}], "certifications": [{"name": "...", "issuer": "...", "issuedOn": "YYYY-MM-DD ou null", "positioning": ["TPM"]}]}
Copie o texto do bullet LITERALMENTE, sem reescrever. "positioning" e um array com uma ou mais de: "TPM", "AI Product", "Web3" — classifique pelo conteudo real do item, nao pelo CV de origem. Responda APENAS com o JSON.`

// PDF document attachments are a beta feature in @anthropic-ai/sdk v0.32.x: the
// stable `anthropic.messages.create()` content union has no `document` block
// (only text/image/tool blocks). Sending a base64 PDF requires the beta
// namespace (`anthropic.beta.messages.create()`) with the `pdfs-2024-09-25`
// beta flag; the `{ type: 'document', source: { type: 'base64', media_type:
// 'application/pdf', data } }` shape itself is unchanged from the task spec.
async function importOneCv(anthropic: Anthropic, path: string) {
  const fileBuffer = readFileSync(path)
  const response = await anthropic.beta.messages.create({
    model: 'claude-sonnet-5',
    // claude-sonnet-5 uses extended thinking by default; a CV-sized extraction
    // burned ~5.1k thinking tokens before even starting the JSON answer in
    // testing (usage.output_tokens_details.thinking_tokens), so 8192 was too
    // low and truncated the response mid-thought with zero text ever emitted
    // (stop_reason: 'max_tokens', content[0].type: 'thinking', no text block
    // at all) — which importOneCv's old code silently treated as '{}' instead
    // of failing loudly. 16000 leaves real headroom above the ~9.5k tokens
    // (thinking + text) this CV actually used.
    max_tokens: 16000,
    betas: ['pdfs-2024-09-25'],
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') } },
        { type: 'text', text: EXTRACTION_PROMPT },
      ],
    }],
  })
  const textBlock = response.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
  }
  // Despite the prompt's "Responda APENAS com o JSON", the model sometimes
  // wraps the answer in a ```json ... ``` fence anyway — strip it before parsing.
  const text = stripMarkdownFence(textBlock.text)
  try {
    return JSON.parse(text)
  } catch (error) {
    console.error('Resposta do Claude nao era JSON valido:', text)
    throw error
  }
}

async function main() {
  // tsx does not auto-load .env files, and this reads only from .env.local
  // (not .env) so it matches Task 2's setup, where credentials live only there.
  // Must run before anything below reads process.env — createServiceClient()
  // and the Anthropic constructor both read their env vars lazily inside this
  // function body (not at module import time), so calling it here as the
  // first statement of main() is sufficient; it doesn't need to precede the
  // (hoisted) import statements above.
  process.loadEnvFile('.env.local')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const db = createServiceClient()

  for (const path of CV_PATHS) {
    console.log(`Importando ${path}...`)
    const extracted = await importOneCv(anthropic, path)
    console.log('Extraido:', JSON.stringify(extracted, null, 2))

    if (extracted.achievements?.length) {
      const { error } = await db.from('achievements').insert(extracted.achievements.map((a: any) => ({
        user_id: DEFAULT_USER_ID, company: a.company, role_title: a.roleTitle,
        start_date: a.startDate, end_date: a.endDate, bullet: a.bullet, metric: a.metric, positioning: a.positioning,
      })))
      if (error) throw new Error(`Falha ao inserir achievements: ${error.message}`)
    }
    if (extracted.skills?.length) {
      const { error } = await db.from('skills').insert(extracted.skills.map((s: any) => ({
        user_id: DEFAULT_USER_ID, name: s.name, category: s.category, positioning: s.positioning,
      })))
      if (error) throw new Error(`Falha ao inserir skills: ${error.message}`)
    }
    if (extracted.education?.length) {
      const { error } = await db.from('education').insert(extracted.education.map((e: any) => ({
        user_id: DEFAULT_USER_ID, institution: e.institution, degree: e.degree,
        completed_on: e.completedOn, in_progress: e.inProgress, positioning: e.positioning,
      })))
      if (error) throw new Error(`Falha ao inserir education: ${error.message}`)
    }
    if (extracted.certifications?.length) {
      const { error } = await db.from('certifications').insert(extracted.certifications.map((c: any) => ({
        user_id: DEFAULT_USER_ID, name: c.name, issuer: c.issuer, issued_on: c.issuedOn, positioning: c.positioning,
      })))
      if (error) throw new Error(`Falha ao inserir certifications: ${error.message}`)
    }
    console.log(`OK: ${extracted.achievements?.length ?? 0} achievements, ${extracted.skills?.length ?? 0} skills, ${extracted.education?.length ?? 0} education, ${extracted.certifications?.length ?? 0} certifications importados.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
