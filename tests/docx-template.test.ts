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
  headline: 'Technical Program Manager',
  summary: 'Summary text for this role.',
  selectedAchievements: [
    { company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Reduced Cost of Goods Sold by 5%, generating ~R$5MM/year in savings.' },
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
})
