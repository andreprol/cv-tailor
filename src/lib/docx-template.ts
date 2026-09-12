import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import type { Profile } from './types'
import type { GeneratedCv } from './generation-schema'

export async function renderCvDocx(profile: Profile, content: GeneratedCv): Promise<Buffer> {
  const contactLine = [profile.location, profile.phone, profile.email, profile.linkedin_url, profile.github_url]
    .filter(Boolean)
    .join(' | ')

  const experienceParagraphs = content.selectedAchievements.flatMap((achievement) => [
    new Paragraph({
      children: [new TextRun({ text: `${achievement.roleTitle} - ${achievement.company}`, bold: true })],
    }),
    new Paragraph({ text: `- ${achievement.bullet}` }),
  ])

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: profile.full_name, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: content.headline }),
          new Paragraph({ text: contactLine }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Professional Summary', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: content.summary }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Work Experience', heading: HeadingLevel.HEADING_1 }),
          ...experienceParagraphs,
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'Skills', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: content.keywords.join(', ') }),
        ],
      },
    ],
  })

  return Packer.toBuffer(doc)
}
