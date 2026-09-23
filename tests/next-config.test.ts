import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Read as text rather than imported: next.config.mjs is plain JS with no type
// declaration, so importing it fails `tsc --noEmit` under this tsconfig.
const config = readFileSync(fileURLToPath(new URL('../next.config.mjs', import.meta.url)), 'utf8')
const packageJson = readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')

describe('next.config.mjs', () => {
  it('keeps the Server Action body limit under the platform hard cap of 4.5MB', () => {
    expect(config).toContain("bodySizeLimit: '4mb'")
  })
})

describe('package.json', () => {
  // PDF export was removed after four production attempts to make pdfkit
  // resolve its built-in fonts inside a Vercel function, all of which failed
  // on the same `Cannot find module '#standard-fonts/Helvetica'`. The .docx
  // is the supported download; a PDF is produced from it by hand when needed.
  // This guard exists so pdfkit does not drift back in as a transitive
  // "quick win" without that history being reconsidered.
  it('does not depend on pdfkit', () => {
    expect(packageJson).not.toContain('pdfkit')
  })
})
