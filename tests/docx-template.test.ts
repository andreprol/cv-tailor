import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { renderCvDocx } from '../src/lib/docx-template'
import type { Profile } from '../src/lib/types'
import type { GeneratedCv } from '../src/lib/generation-schema'

const profile: Profile = {
  id: '1', user_id: '1', full_name: 'André Dias Moreira Prol', email: 'andreprol@andreprol.com.br',
  phone: '+55 (21) 97558-9767', location: 'Rio de Janeiro, Brazil', linkedin_url: 'linkedin.com/in/andre-dias-moreira-prol', github_url: 'github.com/andreprol',
}

const content: GeneratedCv = {
  sufficientMatch: true,
  matchWarning: null,
  language: 'en',
  headline: 'Technical Program Manager',
  summary: 'Summary text for this role.',
  coverLetter: 'Cover letter text for this role.',
  selectedAchievements: [
    { company: 'Delirio Tropical', roleTitle: 'IT Manager', startDate: '2014-10-01', endDate: null, bullet: 'Reduced Cost of Goods Sold by 5%, generating ~R$5MM/year in savings.' },
  ],
  earlierExperience: [],
  personalProjects: [],
  education: [
    { institution: 'UFRJ', degree: 'Engenharia', completedOn: '2010-12-01', inProgress: false },
  ],
  keywords: ['Agile', 'SAP Business One', 'Stakeholder Management'],
  languages: ['English — Fluent (C1)', 'Portuguese — Native'],
  interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
}

async function documentXmlOf(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  return zip.file('word/document.xml')!.async('string')
}

// The visual redesign styles a heading's "Role - Company" as two separate
// runs (bold role, muted-italic company) instead of one plain run, so the
// combined text is no longer contiguous in the raw XML (there's
// </w:t></w:r><w:r>... markup between them). Extract the paragraph's visible
// text the way a human/ATS reading the document would, concatenating run
// text within each paragraph, so substring checks across a run boundary
// still work.
function plainTextOf(xml: string): string {
  const paragraphs = xml.match(/<w:p[ >].*?<\/w:p>/gs) ?? []
  return paragraphs
    .map((p) => (p.match(/<w:t[^>]*>(.*?)<\/w:t>/gs) ?? []).map((r) => r.replace(/<[^>]+>/g, '')).join(''))
    .join('\n')
}

describe('renderCvDocx', () => {
  it('produces a non-empty docx buffer', async () => {
    const buffer = await renderCvDocx(profile, content)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('never emits a table or a text box', async () => {
    const xml = await documentXmlOf(await renderCvDocx(profile, content))
    expect(xml).not.toContain('<w:tbl')
    expect(xml).not.toContain('w:txbxContent')
  })

  it('includes the achievement bullet as plain text', async () => {
    const xml = await documentXmlOf(await renderCvDocx(profile, content))
    expect(xml).toContain('Reduced Cost of Goods Sold by 5')
  })

  it('mirrors the job-matched headline and contact info as plain paragraphs', async () => {
    const xml = await documentXmlOf(await renderCvDocx(profile, content))
    expect(xml).toContain('Technical Program Manager')
    expect(xml).toContain('andreprol@andreprol.com.br')
  })

  it('properly escapes special characters in bullet text', async () => {
    const testContent: GeneratedCv = {
      ...content,
      selectedAchievements: [
        { company: 'Test Co.', roleTitle: 'Role & Title', startDate: null, endDate: null, bullet: 'Reduced cost by <5%> & saved time.' },
      ],
    }
    const xml = await documentXmlOf(await renderCvDocx(profile, testContent))
    // Raw special characters must never appear unescaped in the XML text nodes.
    expect(xml).not.toContain('<5%>')
    // docx escapes via its XML builder, not string concatenation — verify the exact encoded form.
    expect(xml).toContain('Role &amp; Title')
    expect(xml).toContain('- Reduced cost by &lt;5%&gt; &amp; saved time.')
  })

  it('uses Portuguese section headers (uppercase, per the redesign) when language is pt, and English when language is en', async () => {
    const ptXml = await documentXmlOf(await renderCvDocx(profile, { ...content, language: 'pt' }))
    expect(ptXml).toContain('RESUMO PROFISSIONAL')
    expect(ptXml).toContain('EXPERIÊNCIA PROFISSIONAL')
    expect(ptXml).toContain('FORMAÇÃO ACADÊMICA')
    expect(ptXml).toContain('COMPETÊNCIAS')
    expect(ptXml).not.toContain('PROFESSIONAL SUMMARY')

    const enXml = await documentXmlOf(await renderCvDocx(profile, { ...content, language: 'en' }))
    expect(enXml).toContain('PROFESSIONAL SUMMARY')
    expect(enXml).toContain('WORK EXPERIENCE')
    expect(enXml).toContain('EDUCATION')
    expect(enXml).toContain('SKILLS')
  })

  it('groups multiple achievements from the same real job under one heading, instead of repeating the role title per bullet', async () => {
    const testContent: GeneratedCv = {
      ...content,
      selectedAchievements: [
        { company: 'Delirio Tropical', roleTitle: 'IT Manager', startDate: '2014-10-01', endDate: null, bullet: 'Bullet one.' },
        { company: 'Delirio Tropical', roleTitle: 'IT Manager', startDate: '2014-10-01', endDate: null, bullet: 'Bullet two.' },
        { company: 'Acme Corp', roleTitle: 'TPM', startDate: '2020-01-01', endDate: null, bullet: 'Bullet three.' },
      ],
    }
    const xml = await documentXmlOf(await renderCvDocx(profile, testContent))
    const text = plainTextOf(xml)
    const headingOccurrences = text.split('IT Manager - Delirio Tropical').length - 1
    expect(headingOccurrences).toBe(1)
    expect(text).toContain('Bullet one.')
    expect(text).toContain('Bullet two.')
    expect(text).toContain('TPM - Acme Corp')
  })

  it('renders the full education list, including in-progress entries', async () => {
    const testContent: GeneratedCv = {
      ...content,
      education: [
        { institution: 'FGV', degree: 'MBA em Gestão', completedOn: null, inProgress: true },
        { institution: 'UFRJ', degree: 'Engenharia de Produção', completedOn: '2010-12-01', inProgress: false },
      ],
    }
    const xml = await documentXmlOf(await renderCvDocx(profile, testContent))
    expect(xml).toContain('MBA em Gest')
    expect(xml).toContain('FGV')
    // The fixture is an English CV, so the in-progress label is English too —
    // it used to be hardcoded Portuguese regardless of the CV's language.
    expect(xml).toContain('In progress')
    expect(xml).toContain('Engenharia de Produ')
    expect(xml).toContain('UFRJ')
    // Year only: the stored day/month come from CV parsing and are a
    // placeholder, so printing them reads as fake precision.
    expect(plainTextOf(xml)).toContain('2010')
    expect(plainTextOf(xml)).not.toContain('2010-12-01')
  })

  it('renders the period under every role, in the requested language, sourced from the achievement dates', async () => {
    const ptText = plainTextOf(await documentXmlOf(await renderCvDocx(profile, { ...content, language: 'pt' })))
    expect(ptText).toContain('out/2014 — atual')

    const enText = plainTextOf(await documentXmlOf(await renderCvDocx(profile, { ...content, language: 'en' })))
    expect(enText).toContain('Oct 2014 — Present')
  })

  it('omits the period line for a CV generated before dates existed, instead of printing a stray dash', async () => {
    const dateless: GeneratedCv = {
      ...content,
      selectedAchievements: [{ company: 'Acme', roleTitle: 'TPM', startDate: null, endDate: null, bullet: 'Bullet.' }],
    }
    const text = plainTextOf(await documentXmlOf(await renderCvDocx(profile, dateless)))
    expect(text).toContain('TPM - Acme')
    // No period line at all — not an open-ended one implying a current job.
    expect(text).not.toContain('Present')
    expect(text).not.toContain('atual')
  })

  it('renders earlier experience as a condensed section with its own period', async () => {
    const withEarlier: GeneratedCv = {
      ...content,
      language: 'pt',
      earlierExperience: [
        { company: 'Heliprol Táxi Aéreo', roleTitle: 'Co-founder e CEO', startDate: '2010-02-01', endDate: '2012-11-01', summary: 'Fundei uma empresa de táxi aéreo.' },
      ],
    }
    const text = plainTextOf(await documentXmlOf(await renderCvDocx(profile, withEarlier)))
    expect(text).toContain('EXPERIÊNCIAS ANTERIORES')
    expect(text).toContain('Co-founder e CEO - Heliprol Táxi Aéreo · fev/2010 — nov/2012')
    expect(text).toContain('Fundei uma empresa de táxi aéreo.')
  })

  it('renders personal projects in their own section, never inside work experience', async () => {
    const withProjects: GeneratedCv = {
      ...content,
      language: 'pt',
      personalProjects: [{ name: 'cv-tailor', summary: 'Gerador de currículo ATS-safe.' }],
    }
    const text = plainTextOf(await documentXmlOf(await renderCvDocx(profile, withProjects)))
    expect(text).toContain('PROJETOS PESSOAIS')
    expect(text).toContain('cv-tailor — Gerador de currículo ATS-safe.')
  })

  it('omits the earlier-experience and personal-project headings entirely when there is nothing to put under them', async () => {
    const text = plainTextOf(await documentXmlOf(await renderCvDocx(profile, { ...content, language: 'pt' })))
    expect(text).not.toContain('EXPERIÊNCIAS ANTERIORES')
    expect(text).not.toContain('PROJETOS PESSOAIS')
  })

  it('stays table-free and text-box-free with the new sections present', async () => {
    const full: GeneratedCv = {
      ...content,
      earlierExperience: [
        { company: 'Heliprol', roleTitle: 'CEO', startDate: '2010-02-01', endDate: '2012-11-01', summary: 'Summary.' },
      ],
      personalProjects: [{ name: 'cv-tailor', summary: 'Summary.' }],
    }
    const xml = await documentXmlOf(await renderCvDocx(profile, full))
    expect(xml).not.toContain('<w:tbl')
    expect(xml).not.toContain('w:txbxContent')
  })

  it('justifies summary and bullet paragraphs', async () => {
    const xml = await documentXmlOf(await renderCvDocx(profile, content))
    expect(xml).toContain('<w:jc w:val="both"/>')
  })

  it('justifies the education and skills blocks too, not only the summary and bullets', async () => {
    const xml = await documentXmlOf(await renderCvDocx(profile, content))
    const paragraphs = xml.match(/<w:p[ >].*?<\/w:p>/gs) ?? []
    const paragraphWith = (text: string) => paragraphs.find((p) => p.includes(text))

    expect(paragraphWith('Engenharia')).toContain('<w:jc w:val="both"/>')
    expect(paragraphWith('SAP Business One')).toContain('<w:jc w:val="both"/>')
  })

  it('renders spoken-language fluency as its own section, sourced from master data rather than from the model keywords', async () => {
    const text = plainTextOf(await documentXmlOf(await renderCvDocx(profile, content)))
    expect(text).toContain('LANGUAGES')
    expect(text).toContain('English — Fluent (C1), Portuguese — Native')

    const ptText = plainTextOf(await documentXmlOf(await renderCvDocx(profile, { ...content, language: 'pt' })))
    expect(ptText).toContain('IDIOMAS')
  })

  it('omits the languages heading when the bank has no fluency entry', async () => {
    const text = plainTextOf(await documentXmlOf(await renderCvDocx(profile, { ...content, languages: [] })))
    expect(text).not.toContain('LANGUAGES')
  })

  it('sets a larger default body font size (docDefaults in styles.xml, applied to every paragraph that does not override it)', async () => {
    const zip = await JSZip.loadAsync(await renderCvDocx(profile, content))
    const styles = await zip.file('word/styles.xml')!.async('string')
    expect(styles).toContain('<w:rPrDefault><w:rPr><w:sz w:val="24"/>')
  })

  it('gives the name and section headings the accent color, and draws a divider border under a heading — still only Paragraph/TextRun, no table or text box', async () => {
    const xml = await documentXmlOf(await renderCvDocx(profile, content))
    expect(xml).toContain('<w:color w:val="1F4D78"/>')
    expect(xml).toContain('<w:pBdr><w:bottom w:val="single"')
    expect(xml).not.toContain('<w:tbl')
    expect(xml).not.toContain('w:txbxContent')
  })
})
