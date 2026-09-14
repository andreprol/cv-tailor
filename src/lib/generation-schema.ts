import { z } from 'zod'
import { stripMarkdownFence } from './strip-markdown-fence'

// This is what Claude actually returns. It must cite the REAL achievement it
// used by id (never invent one) — the id is what proves the underlying fact
// is real. It may translate/rephrase the bullet text into the requested
// language, which is why bullet text can no longer be the provenance check
// (a faithful translation will never match the original verbatim).
export const modelCvResponseSchema = z.object({
  sufficientMatch: z.boolean(),
  matchWarning: z.string().nullable(),
  headline: z.string().min(1),
  summary: z.string().min(1),
  selectedAchievements: z.array(z.object({
    achievementId: z.string().min(1),
    bullet: z.string().min(1),
  })),
  keywords: z.array(z.string().min(1)),
  interviewQuestions: z.array(z.object({
    question: z.string().min(1),
    rationale: z.string().min(1),
  })),
})

export type ModelCvResponse = z.infer<typeof modelCvResponseSchema>

export function parseModelCvResponse(raw: string): ModelCvResponse {
  const json = JSON.parse(stripMarkdownFence(raw))
  return modelCvResponseSchema.parse(json)
}

// The final, fully-assembled shape everything downstream (docx-template,
// orchestrator, storage) consumes. company/roleTitle here are ALWAYS sourced
// from the real master data record (see assembleGeneratedCv in
// claude-generation.ts) — never trusted from the model's own JSON — so a
// mismatched or hallucinated company name can never reach a rendered CV.
export const generatedCvSchema = z.object({
  sufficientMatch: z.boolean(),
  matchWarning: z.string().nullable(),
  headline: z.string().min(1),
  summary: z.string().min(1),
  selectedAchievements: z.array(z.object({
    company: z.string().min(1),
    roleTitle: z.string().min(1),
    bullet: z.string().min(1),
  })),
  keywords: z.array(z.string().min(1)),
  interviewQuestions: z.array(z.object({
    question: z.string().min(1),
    rationale: z.string().min(1),
  })),
})

export type GeneratedCv = z.infer<typeof generatedCvSchema>
