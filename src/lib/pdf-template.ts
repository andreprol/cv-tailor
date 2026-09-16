import PDFDocument from 'pdfkit'
import type { Profile } from './types'
import type { GeneratedCv } from './generation-schema'
import { SECTION_LABELS, groupByRole, educationLine } from './cv-render-shared'

export function sanitizeFilename(name: string): string {
  const transliterated = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const cleaned = transliterated.replace(/[^a-zA-Z0-9-_ ]/g, '').trim()
  return cleaned.length > 0 ? cleaned : 'curriculo'
}

export async function renderCvPdf(profile: Profile, content: GeneratedCv): Promise<Buffer> {
  const labels = SECTION_LABELS[content.language]
  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const contactLine = [profile.location, profile.phone, profile.email, profile.linkedin_url, profile.github_url]
    .filter(Boolean)
    .join(' | ')

  doc.font('Helvetica-Bold').fontSize(20).text(profile.full_name)
  doc.font('Helvetica').fontSize(12).text(content.headline)
  doc.fontSize(11).text(contactLine)
  doc.moveDown()

  doc.font('Helvetica-Bold').fontSize(13).text(labels.summary)
  doc.font('Helvetica').fontSize(11).text(content.summary, { align: 'justify' })
  doc.moveDown()

  doc.font('Helvetica-Bold').fontSize(13).text(labels.experience)
  for (const group of groupByRole(content.selectedAchievements)) {
    doc.font('Helvetica-Bold').fontSize(11).text(`${group.roleTitle} - ${group.company}`)
    for (const bullet of group.bullets) {
      doc.font('Helvetica').fontSize(11).text(`- ${bullet}`, { align: 'justify' })
    }
  }
  doc.moveDown()

  doc.font('Helvetica-Bold').fontSize(13).text(labels.education)
  for (const entry of content.education) {
    doc.font('Helvetica').fontSize(11).text(educationLine(entry))
  }
  doc.moveDown()

  doc.font('Helvetica-Bold').fontSize(13).text(labels.skills)
  doc.font('Helvetica').fontSize(11).text(content.keywords.join(', '))

  doc.end()
  return done
}
