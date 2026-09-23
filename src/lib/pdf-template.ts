import PDFDocument from 'pdfkit'
import type { Profile } from './types'
import type { GeneratedCv } from './generation-schema'
import { SECTION_LABELS, formatEducationStatus, formatPeriod, groupRoles } from './cv-render-shared'

// Mirrors the docx-template.ts palette/hierarchy: one accent color, one
// muted gray, everything else plain black — see the comment there for why.
const ACCENT_COLOR = '#1F4D78'
const MUTED_COLOR = '#595959'
const BLACK = '#000000'

function drawDivider(doc: PDFKit.PDFDocument): void {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const y = doc.y
  doc.save().strokeColor(ACCENT_COLOR).lineWidth(1).moveTo(left, y).lineTo(right, y).stroke().restore()
  doc.moveDown(0.6)
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string): void {
  doc.moveDown(0.6)
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ACCENT_COLOR).text(text.toUpperCase())
  drawDivider(doc)
  doc.fillColor(BLACK)
}

export function sanitizeFilename(name: string): string {
  const transliterated = name.normalize('NFD').replace(/\p{M}/gu, '')
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
    .join('   |   ')

  doc.font('Helvetica-Bold').fontSize(22).fillColor(ACCENT_COLOR).text(profile.full_name)
  doc.font('Helvetica-Oblique').fontSize(13).fillColor(MUTED_COLOR).text(content.headline)
  doc.font('Helvetica').fontSize(9).fillColor(MUTED_COLOR).text(contactLine)
  doc.moveDown(0.4)
  drawDivider(doc)
  doc.fillColor(BLACK)

  sectionHeading(doc, labels.summary)
  doc.font('Helvetica').fontSize(11).fillColor(BLACK).text(content.summary, { align: 'justify' })

  sectionHeading(doc, labels.experience)
  for (const group of groupRoles(content.selectedAchievements)) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK).text(group.roleTitle, { continued: true })
    doc.font('Helvetica-Oblique').fillColor(MUTED_COLOR).text(` - ${group.company}`)
    const period = formatPeriod(group.startDate, group.endDate, content.language)
    if (period) doc.font('Helvetica').fontSize(9).fillColor(MUTED_COLOR).text(period)
    doc.fillColor(BLACK)
    for (const bullet of group.bullets) {
      doc.font('Helvetica').fontSize(11).text(`- ${bullet}`, { align: 'justify', indent: 10 })
    }
    doc.moveDown(0.2)
  }

  // Omitted entirely when empty — an empty heading with a divider under it
  // reads as a formatting bug to a recruiter.
  if (content.earlierExperience.length > 0) {
    sectionHeading(doc, labels.earlierExperience)
    for (const entry of content.earlierExperience) {
      const period = formatPeriod(entry.startDate, entry.endDate, content.language)
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK).text(entry.roleTitle, { continued: true })
      doc.font('Helvetica-Oblique').fillColor(MUTED_COLOR).text(` - ${entry.company}${period ? ` · ${period}` : ''}`)
      doc.font('Helvetica').fontSize(11).fillColor(BLACK).text(entry.summary, { align: 'justify', indent: 10 })
      doc.moveDown(0.2)
    }
  }

  if (content.personalProjects.length > 0) {
    sectionHeading(doc, labels.projects)
    for (const project of content.personalProjects) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK).text(project.name, { continued: true })
      doc.font('Helvetica').text(` — ${project.summary}`, { align: 'justify' })
    }
    doc.moveDown(0.2)
  }

  sectionHeading(doc, labels.education)
  for (const entry of content.education) {
    const status = formatEducationStatus(entry, content.language)
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK).text(entry.degree, { continued: true })
    doc.font('Helvetica').fillColor(MUTED_COLOR).text(` — ${entry.institution}${status ? ` — ${status}` : ''}`)
  }
  doc.fillColor(BLACK)

  sectionHeading(doc, labels.skills)
  doc.font('Helvetica').fontSize(11).fillColor(MUTED_COLOR).text(content.keywords.join(', '))

  doc.end()
  return done
}
