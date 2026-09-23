import { z } from 'zod'
import { parseModelJson } from './strip-markdown-fence'

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
  // Prompted for 200-350 words (~2500 chars); cap at 3000 as a backstop
  // against a degenerate/looping model response reaching storage and being
  // rendered whole in the UI's <pre> block.
  coverLetter: z.string().min(1).max(3000),
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
  const json = parseModelJson(raw)
  return modelCvResponseSchema.parse(json)
}

// The final, fully-assembled shape everything downstream (docx-template,
// orchestrator, storage) consumes. company/roleTitle here are ALWAYS sourced
// from the real master data record (see assembleGeneratedCv in
// claude-generation.ts) — never trusted from the model's own JSON — so a
// mismatched or hallucinated company name can never reach a rendered CV.
// `language` and `education` are likewise never produced by the model: they
// are attached by assembleGeneratedCv straight from the real request/master
// data, and persisted here so the standalone PDF route (which only has the
// saved generated_json, not the original request) can render them identically
// to the docx generated at the same time.
// Both default rather than being required: CVs generated before this field
// existed already have rows in `cv_versions` without them, and the /pdf route
// re-parses that stored JSON on every download — a hard requirement here
// would turn "download the PDF for an old application" into a 500 for every
// CV generated before this change shipped.
export const generatedCvSchema = z.object({
  sufficientMatch: z.boolean(),
  matchWarning: z.string().nullable(),
  language: z.enum(['pt', 'en']).default('pt'),
  headline: z.string().min(1),
  summary: z.string().min(1),
  // Same provenance story as summary/headline: not achievementId-verified
  // prose, but built from a prompt constrained to the same real master data.
  // Defaults to '' so a cv_versions row saved before this field existed
  // parses without throwing (the applications detail page hides the cover
  // letter section entirely when it's empty rather than showing a blank box).
  coverLetter: z.string().max(3000).default(''),
  // startDate/endDate are copied straight from the real master data row the
  // model cited by id — the model never supplies a date, exactly as it never
  // supplies company/roleTitle. They are nullable-with-default because rows
  // in `cv_versions` written before dates existed have none: those keep
  // rendering without a period line instead of turning every old download
  // into a 500.
  selectedAchievements: z.array(z.object({
    company: z.string().min(1),
    roleTitle: z.string().min(1),
    startDate: z.string().nullable().default(null),
    endDate: z.string().nullable().default(null),
    bullet: z.string().min(1),
  })),
  // Every job that isn't the current one, condensed to a single line. Built
  // deterministically in assembleGeneratedCv from the real master data — the
  // model influences which bullet is quoted (and its wording/language), never
  // whether an employer appears at all. A CV that silently drops the earlier
  // half of a career reads as if the person had only ever held one job.
  earlierExperience: z.array(z.object({
    company: z.string().min(1),
    roleTitle: z.string().min(1),
    startDate: z.string().nullable().default(null),
    endDate: z.string().nullable().default(null),
    summary: z.string().min(1),
  })).default([]),
  // GitHub-imported repositories (company === PERSONAL_PROJECT_COMPANY), kept
  // out of Work Experience and rendered as their own short section.
  personalProjects: z.array(z.object({
    name: z.string().min(1),
    summary: z.string().min(1),
  })).default([]),
  // Education is never selected/rewritten by the model — it's the user's
  // full academic history, copied verbatim from the master data bank in
  // assembleGeneratedCv. Sorted (in-progress first, then most recent
  // completedOn) before being stored here. Defaults to empty for a CV
  // generated before this field existed (honest: we have no snapshot of the
  // user's education at that point in time, not an actual empty history).
  education: z.array(z.object({
    institution: z.string().min(1),
    degree: z.string().min(1),
    completedOn: z.string().nullable(),
    inProgress: z.boolean(),
  })).default([]),
  keywords: z.array(z.string().min(1)),
  // Spoken-language fluency, copied verbatim from the master data's own
  // category — never selected or rewritten by the model, for the same reason
  // as education. Defaults to empty so a cv_versions row saved before this
  // field existed still parses (the section is omitted when empty).
  languages: z.array(z.string().min(1)).default([]),
  interviewQuestions: z.array(z.object({
    question: z.string().min(1),
    rationale: z.string().min(1),
  })),
})

export type GeneratedCv = z.infer<typeof generatedCvSchema>
