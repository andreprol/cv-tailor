import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '../src/lib/supabase/server'
import { extractCvData, type CvFileKind } from '../src/lib/import-cv'
import { insertAchievements, insertSkills, insertEducation, insertCertifications } from '../src/lib/repository'
import type { Positioning } from '../src/lib/types'

interface ImportJob {
  path: string
  kind: CvFileKind
  positioning: Positioning[]
}

// Usage: npm run import-cv -- <userId>
// Edit JOBS below to point at real CV files before running.
const JOBS: ImportJob[] = [
  { path: 'F:/Particular/CV/CV_Andre_Prol_TCS_AI_TPM.pdf', kind: 'pdf', positioning: ['TPM', 'AI Product'] },
]

async function main() {
  process.loadEnvFile('.env.local')

  const userId = process.argv[2]
  if (!userId) {
    throw new Error('Uso: npm run import-cv -- <userId real do Supabase Auth>')
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const db = createServiceClient()

  for (const job of JOBS) {
    console.log(`Importando ${job.path} (${job.kind}, positioning: ${job.positioning.join(', ')})...`)
    const buffer = readFileSync(job.path)
    const extracted = await extractCvData(anthropic, job.kind, buffer)

    if (extracted.achievements.length) await insertAchievements(db, userId, job.positioning, extracted.achievements)
    if (extracted.skills.length) await insertSkills(db, userId, job.positioning, extracted.skills)
    if (extracted.education.length) await insertEducation(db, userId, job.positioning, extracted.education)
    if (extracted.certifications.length) await insertCertifications(db, userId, job.positioning, extracted.certifications)

    console.log(`OK: ${extracted.achievements.length} achievements, ${extracted.skills.length} skills, ${extracted.education.length} education, ${extracted.certifications.length} certifications importados.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
