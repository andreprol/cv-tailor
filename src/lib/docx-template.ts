import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun } from 'docx'
import type { Profile } from './types'
import type { GeneratedCv } from './generation-schema'
import { SECTION_LABELS, groupByRole } from './cv-render-shared'

// Deliberately restrained to a single accent color plus one muted gray — the
// point is visual hierarchy (what a human recruiter scans first), not a
// designed brand. Everything below is still built from plain Paragraph/
// TextRun only (docx-template.test.ts asserts no <w:tbl>/w:txbxContent ever
// appears) — color, borders and spacing are all paragraph/run-level
// properties, not a different rendering mechanism.
const ACCENT_COLOR = '1F4D78'
const MUTED_COLOR = '595959'

const DIVIDER_BORDER = { style: BorderStyle.SINGLE, size: 4, color: ACCENT_COLOR, space: 4 } as const

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: { bottom: DIVIDER_BORDER },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: ACCENT_COLOR, size: 22, characterSpacing: 10 })],
  })
}

function educationParagraph(entry: GeneratedCv['education'][number]): Paragraph {
  const status = entry.inProgress ? 'Em andamento' : entry.completedOn
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: entry.degree, bold: true }),
      new TextRun({ text: ` — ${entry.institution}${status ? ` — ${status}` : ''}`, color: MUTED_COLOR }),
    ],
  })
}

export async function renderCvDocx(profile: Profile, content: GeneratedCv): Promise<Buffer> {
  const labels = SECTION_LABELS[content.language]
  const contactLine = [profile.location, profile.phone, profile.email, profile.linkedin_url, profile.github_url]
    .filter(Boolean)
    .join('   |   ')

  const experienceParagraphs = groupByRole(content.selectedAchievements).flatMap((group) => [
    new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [
        new TextRun({ text: group.roleTitle, bold: true }),
        new TextRun({ text: ` - ${group.company}`, italics: true, color: MUTED_COLOR }),
      ],
    }),
    ...group.bullets.map((bullet) => new Paragraph({
      text: `- ${bullet}`,
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 200 },
      spacing: { after: 60 },
    })),
  ])

  const doc = new Document({
    styles: {
      // Bumps the default body text size for every paragraph that doesn't
      // set its own (the section headings/title above all set an explicit
      // size, so this only affects body copy — contact line, summary,
      // experience bullets, education, skills).
      default: { document: { run: { size: 24 } } },
    },
    sections: [
      {
        children: [
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: profile.full_name, bold: true, color: ACCENT_COLOR, size: 36 })],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: content.headline, italics: true, color: MUTED_COLOR, size: 24 })],
          }),
          new Paragraph({
            border: { bottom: DIVIDER_BORDER },
            spacing: { after: 160 },
            children: [new TextRun({ text: contactLine, color: MUTED_COLOR, size: 18 })],
          }),
          sectionHeading(labels.summary),
          new Paragraph({ text: content.summary, alignment: AlignmentType.JUSTIFIED }),
          sectionHeading(labels.experience),
          ...experienceParagraphs,
          sectionHeading(labels.education),
          ...content.education.map(educationParagraph),
          sectionHeading(labels.skills),
          new Paragraph({ text: content.keywords.join(', '), spacing: { after: 0 } }),
        ],
      },
    ],
  })

  return Packer.toBuffer(doc)
}
