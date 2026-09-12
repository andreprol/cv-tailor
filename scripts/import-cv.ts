import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '../src/lib/supabase/server'
import { DEFAULT_USER_ID } from '../src/lib/constants'

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
    max_tokens: 8192,
    betas: ['pdfs-2024-09-25'],
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') } },
        { type: 'text', text: EXTRACTION_PROMPT },
      ],
    }],
  })
  const block = response.content[0]
  const text = block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}

async function main() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const db = createServiceClient()

  for (const path of CV_PATHS) {
    console.log(`Importando ${path}...`)
    const extracted = await importOneCv(anthropic, path)

    if (extracted.achievements?.length) {
      await db.from('achievements').insert(extracted.achievements.map((a: any) => ({
        user_id: DEFAULT_USER_ID, company: a.company, role_title: a.roleTitle,
        start_date: a.startDate, end_date: a.endDate, bullet: a.bullet, metric: a.metric, positioning: a.positioning,
      })))
    }
    if (extracted.skills?.length) {
      await db.from('skills').insert(extracted.skills.map((s: any) => ({
        user_id: DEFAULT_USER_ID, name: s.name, category: s.category, positioning: s.positioning,
      })))
    }
    if (extracted.education?.length) {
      await db.from('education').insert(extracted.education.map((e: any) => ({
        user_id: DEFAULT_USER_ID, institution: e.institution, degree: e.degree,
        completed_on: e.completedOn, in_progress: e.inProgress, positioning: e.positioning,
      })))
    }
    if (extracted.certifications?.length) {
      await db.from('certifications').insert(extracted.certifications.map((c: any) => ({
        user_id: DEFAULT_USER_ID, name: c.name, issuer: c.issuer, issued_on: c.issuedOn, positioning: c.positioning,
      })))
    }
    console.log(`OK: ${extracted.achievements?.length ?? 0} achievements, ${extracted.skills?.length ?? 0} skills importados.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
