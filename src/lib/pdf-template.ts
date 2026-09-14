import PDFDocument from 'pdfkit'
import type { Profile } from './types'
import type { GeneratedCv } from './generation-schema'

export function sanitizeFilename(name: string): string {
  const transliterated = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const cleaned = transliterated.replace(/[^a-zA-Z0-9-_ ]/g, '').trim()
  return cleaned.length > 0 ? cleaned : 'curriculo'
}

export async function renderCvPdf(profile: Profile, content: GeneratedCv): Promise<Buffer> {
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
  doc.fontSize(10).text(contactLine)
  doc.moveDown()

  doc.font('Helvetica-Bold').fontSize(13).text('Professional Summary')
  doc.font('Helvetica').fontSize(10).text(content.summary)
  doc.moveDown()

  doc.font('Helvetica-Bold').fontSize(13).text('Work Experience')
  for (const achievement of content.selectedAchievements) {
    doc.font('Helvetica-Bold').fontSize(10).text(`${achievement.roleTitle} - ${achievement.company}`)
    doc.font('Helvetica').fontSize(10).text(`- ${achievement.bullet}`)
  }
  doc.moveDown()

  doc.font('Helvetica-Bold').fontSize(13).text('Skills')
  doc.font('Helvetica').fontSize(10).text(content.keywords.join(', '))

  doc.end()
  return done
}
