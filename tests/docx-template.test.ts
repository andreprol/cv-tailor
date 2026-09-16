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
  selectedAchievements: [
    { company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Reduced Cost of Goods Sold by 5%, generating ~R$5MM/year in savings.' },
  ],
  education: [
    { institution: 'UFRJ', degree: 'Engenharia', completedOn: '2010-12-01', inProgress: false },
  ],
  keywords: ['Agile', 'SAP Business One', 'Stakeholder Management'],
  interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
}

async function documentXmlOf(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  return zip.file('word/document.xml')!.async('string')
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
        { company: 'Test Co.', roleTitle: 'Role & Title', bullet: 'Reduced cost by <5%> & saved time.' },
      ],
    }
    const xml = await documentXmlOf(await renderCvDocx(profile, testContent))
    // Raw special characters must never appear unescaped in the XML text nodes.
    expect(xml).not.toContain('<5%>')
    // docx escapes via its XML builder, not string concatenation — verify the exact encoded form.
    expect(xml).toContain('Role &amp; Title')
    expect(xml).toContain('- Reduced cost by &lt;5%&gt; &amp; saved time.')
  })

  it('uses Portuguese section headers when language is pt, and English when language is en', async () => {
    const ptXml = await documentXmlOf(await renderCvDocx(profile, { ...content, language: 'pt' }))
    expect(ptXml).toContain('Resumo Profissional')
    expect(ptXml).toContain('Experiência Profissional')
    expect(ptXml).toContain('Formação Acadêmica')
    expect(ptXml).toContain('Competências')
    expect(ptXml).not.toContain('Professional Summary')

    const enXml = await documentXmlOf(await renderCvDocx(profile, { ...content, language: 'en' }))
    expect(enXml).toContain('Professional Summary')
    expect(enXml).toContain('Work Experience')
    expect(enXml).toContain('Education')
    expect(enXml).toContain('Skills')
  })

  it('groups multiple achievements from the same real job under one heading, instead of repeating the role title per bullet', async () => {
    const testContent: GeneratedCv = {
      ...content,
      selectedAchievements: [
        { company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Bullet one.' },
        { company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Bullet two.' },
        { company: 'Acme Corp', roleTitle: 'TPM', bullet: 'Bullet three.' },
      ],
    }
    const xml = await documentXmlOf(await renderCvDocx(profile, testContent))
    const headingOccurrences = xml.split('IT Manager - Delirio Tropical').length - 1
    expect(headingOccurrences).toBe(1)
    expect(xml).toContain('Bullet one.')
    expect(xml).toContain('Bullet two.')
    expect(xml).toContain('TPM - Acme Corp')
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
    expect(xml).toContain('Em andamento')
    expect(xml).toContain('Engenharia de Produ')
    expect(xml).toContain('UFRJ')
    expect(xml).toContain('2010-12-01')
  })

  it('justifies summary and bullet paragraphs', async () => {
    const xml = await documentXmlOf(await renderCvDocx(profile, content))
    expect(xml).toContain('<w:jc w:val="both"/>')
  })

  it('sets a larger default body font size (docDefaults in styles.xml, applied to every paragraph that does not override it)', async () => {
    const zip = await JSZip.loadAsync(await renderCvDocx(profile, content))
    const styles = await zip.file('word/styles.xml')!.async('string')
    expect(styles).toContain('<w:rPrDefault><w:rPr><w:sz w:val="24"/>')
  })
})
