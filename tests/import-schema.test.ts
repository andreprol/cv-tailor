import { describe, it, expect } from 'vitest'
import { parseImportedCv } from '../src/lib/import-schema'

describe('parseImportedCv', () => {
  it('parses valid JSON matching the schema', () => {
    const json = JSON.stringify({
      achievements: [{ company: 'Acme', roleTitle: 'PM', startDate: '2020-01-01', endDate: null, bullet: 'Did X', metric: null }],
      skills: [{ name: 'SQL', category: 'Data' }],
      education: [{ institution: 'MIT', degree: 'BSc', completedOn: '2015-06-01', inProgress: false }],
      certifications: [{ name: 'AWS SAA', issuer: 'AWS', issuedOn: null }],
    })
    const result = parseImportedCv(json)
    expect(result.achievements[0].company).toBe('Acme')
    expect(result.skills[0].name).toBe('SQL')
  })

  it('strips a markdown fence before parsing', () => {
    const json = '```json\n' + JSON.stringify({ achievements: [], skills: [], education: [], certifications: [] }) + '\n```'
    expect(() => parseImportedCv(json)).not.toThrow()
  })

  it('throws when a required field is missing', () => {
    const json = JSON.stringify({ achievements: [{ company: 'Acme' }], skills: [], education: [], certifications: [] })
    expect(() => parseImportedCv(json)).toThrow()
  })
})
