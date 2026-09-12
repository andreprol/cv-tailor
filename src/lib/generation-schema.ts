import { z } from 'zod'

export const generatedCvSchema = z.object({
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
  const json = JSON.parse(raw)
  return generatedCvSchema.parse(json)
}
