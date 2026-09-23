import { z } from 'zod'
import { parseModelJson } from './strip-markdown-fence'

// Deliberately no per-item `positioning` field here — unlike the old,
// now-superseded importer script, positioning tags are chosen once at
// upload time for the whole batch and applied uniformly. That logic lives
// in the caller of parseImportedCv, not in this extraction schema.
export const importedCvSchema = z.object({
  achievements: z.array(z.object({
    company: z.string().min(1),
    roleTitle: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().nullable(),
    bullet: z.string().min(1),
    metric: z.string().nullable(),
  })),
  skills: z.array(z.object({
    name: z.string().min(1),
    category: z.string().min(1),
  })),
  education: z.array(z.object({
    institution: z.string().min(1),
    degree: z.string().min(1),
    completedOn: z.string().nullable(),
    inProgress: z.boolean(),
  })),
  certifications: z.array(z.object({
    name: z.string().min(1),
    issuer: z.string().nullable(),
    issuedOn: z.string().nullable(),
  })),
})

export type ImportedCv = z.infer<typeof importedCvSchema>

export function parseImportedCv(raw: string): ImportedCv {
  const json = parseModelJson(raw)
  return importedCvSchema.parse(json)
}
