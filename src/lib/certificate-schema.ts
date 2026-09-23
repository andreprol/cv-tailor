import { z } from 'zod'
import { parseModelJson } from './strip-markdown-fence'

export const certificateExtractionSchema = z.object({
  certifications: z.array(z.object({
    name: z.string().min(1),
    issuer: z.string().nullable(),
    issuedOn: z.string().nullable(),
  })),
})

export type CertificateExtraction = z.infer<typeof certificateExtractionSchema>

export function parseCertificateExtraction(raw: string): CertificateExtraction {
  const json = parseModelJson(raw)
  return certificateExtractionSchema.parse(json)
}
