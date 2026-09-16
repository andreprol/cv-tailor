import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import type { Profile } from './types'
import type { GeneratedCv } from './generation-schema'
import { SECTION_LABELS, groupByRole, educationLine } from './cv-render-shared'

export async function renderCvDocx(profile: Profile, content: GeneratedCv): Promise<Buffer> {
  const labels = SECTION_LABELS[content.language]
  const contactLine = [profile.location, profile.phone, profile.email, profile.linkedin_url, profile.github_url]
    .filter(Boolean)
    .join(' | ')

  const experienceParagraphs = groupByRole(content.selectedAchievements).flatMap((group) => [
    new Paragraph({
      children: [new TextRun({ text: `${group.roleTitle} - ${group.company}`, bold: true })],
    }),
    ...group.bullets.map((bullet) => new Paragraph({ text: `- ${bullet}`, alignment: AlignmentType.JUSTIFIED })),
  ])

  const educationParagraphs = content.education.map((entry) => new Paragraph({ text: educationLine(entry) }))

  const doc = new Document({
    styles: {
      // Bumps the default body text size for every paragraph that doesn't
      // set its own (the title/headings below all set an explicit larger
      // size, so this only affects body copy — contact line, summary,
      // experience bullets, education, skills).
      default: { document: { run: { size: 24 } } },
    },
    sections: [
      {
        children: [
          new Paragraph({ text: profile.full_name, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: content.headline }),
          new Paragraph({ text: contactLine }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: labels.summary, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: content.summary, alignment: AlignmentType.JUSTIFIED }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: labels.experience, heading: HeadingLevel.HEADING_1 }),
          ...experienceParagraphs,
          new Paragraph({ text: '' }),
          new Paragraph({ text: labels.education, heading: HeadingLevel.HEADING_1 }),
          ...educationParagraphs,
          new Paragraph({ text: '' }),
          new Paragraph({ text: labels.skills, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: content.keywords.join(', ') }),
        ],
      },
    ],
  })

  return Packer.toBuffer(doc)
}
