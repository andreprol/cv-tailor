import { z } from 'zod'
import { stripMarkdownFence } from './strip-markdown-fence'

export const generatedCvSchema = z.object({
  // Explicit, structured signal for "this vaga doesn't genuinely match the
  // master data bank" — added after real testing showed the model, lacking
  // this field, would instead write its honest "this isn't a good fit"
  // assessment straight into the `summary` field of the actual résumé
  // document. The orchestrator checks this before ever rendering/uploading
  // a file, so the warning reaches the user as an error, not as embarrassing
  // text in a document that might get sent to a real recruiter.
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

export function parseGeneratedCv(raw: string): GeneratedCv {
  const json = JSON.parse(stripMarkdownFence(raw))
  return generatedCvSchema.parse(json)
}
