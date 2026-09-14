# Export de CV em PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um botão "Baixar PDF" na página de detalhe da candidatura, gerando o PDF sob demanda a partir do mesmo dado estruturado já usado para o `.docx`.

**Architecture:** `src/lib/pdf-template.ts` (novo, irmão de `docx-template.ts`) renderiza `GeneratedCv` + `Profile` em PDF via `pdfkit`. Um Route Handler novo (`src/app/applications/[id]/pdf/route.ts`) busca o CV já gerado no banco, valida seu formato, chama o renderer e devolve os bytes com `Content-Disposition: attachment`. Nada persiste no Storage — cada download re-renderiza. `src/app/applications/[id]/page.tsx` ganha um link novo ao lado do "Baixar .docx" existente.

**Tech Stack:** Next.js 15 (App Router, Route Handlers), `pdfkit` (geração de PDF puro-texto), TypeScript, Vitest + `pdf-parse` (só em teste).

---

### Task 1: `renderCvPdf` em `pdf-template.ts`

**Files:**
- Create: `cv-tailor/src/lib/pdf-template.ts`
- Test: `cv-tailor/tests/pdf-template.test.ts`

- [ ] **Step 1: Instalar as dependências**

```bash
cd cv-tailor
npm install pdfkit
npm install -D @types/pdfkit pdf-parse
```

- [ ] **Step 2: Escrever o teste (falhando)**

Criar `cv-tailor/tests/pdf-template.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import pdfParse from 'pdf-parse'
import { renderCvPdf, sanitizeFilename } from '../src/lib/pdf-template'
import type { Profile } from '../src/lib/types'
import type { GeneratedCv } from '../src/lib/generation-schema'

const profile: Profile = {
  id: '1', user_id: '1', full_name: 'André Dias Moreira Prol', email: 'andreprol@andreprol.com.br',
  phone: '+55 (21) 97558-9767', location: 'Rio de Janeiro, Brazil', linkedin_url: 'linkedin.com/in/andre-dias-moreira-prol', github_url: 'github.com/andreprol',
}

const content: GeneratedCv = {
  sufficientMatch: true,
  matchWarning: null,
  headline: 'Technical Program Manager',
  summary: 'Summary text for this role.',
  selectedAchievements: [
    { company: 'Delirio Tropical', roleTitle: 'IT Manager', bullet: 'Reduced Cost of Goods Sold by 5%, generating ~R$5MM/year in savings.' },
  ],
  keywords: ['Agile', 'SAP Business One', 'Stakeholder Management'],
  interviewQuestions: [{ question: 'Q1', rationale: 'R1' }],
}

describe('renderCvPdf', () => {
  it('produces a valid, non-empty PDF buffer', async () => {
    const buffer = await renderCvPdf(profile, content)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })

  it('includes the full name, headline and achievement bullet as extractable text', async () => {
    const buffer = await renderCvPdf(profile, content)
    const { text } = await pdfParse(buffer)
    expect(text).toContain('André Dias Moreira Prol')
    expect(text).toContain('Technical Program Manager')
    expect(text).toContain('Reduced Cost of Goods Sold by 5')
  })

  it('does not throw when there are no selected achievements', async () => {
    const emptyContent: GeneratedCv = { ...content, selectedAchievements: [] }
    const buffer = await renderCvPdf(profile, emptyContent)
    expect(buffer.length).toBeGreaterThan(0)
  })
})

describe('sanitizeFilename', () => {
  it('strips characters unsafe for a filename', () => {
    expect(sanitizeFilename('Acme/Global: Tech?')).toBe('AcmeGlobal Tech')
  })

  it('falls back to a default name when the result would be empty', () => {
    expect(sanitizeFilename('???')).toBe('curriculo')
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/pdf-template.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/pdf-template'`

- [ ] **Step 4: Implementar `pdf-template.ts`**

```ts
import PDFDocument from 'pdfkit'
import type { Profile } from './types'
import type { GeneratedCv } from './generation-schema'

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim()
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
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/pdf-template.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Rodar a suíte inteira pra confirmar que nada quebrou**

Run: `npx vitest run`
Expected: PASS (todos os testes existentes + os 5 novos)

- [ ] **Step 7: Commit**

```bash
git add cv-tailor/package.json cv-tailor/package-lock.json cv-tailor/src/lib/pdf-template.ts cv-tailor/tests/pdf-template.test.ts
git commit -m "feat(cv-tailor): adiciona renderCvPdf (pdfkit) espelhando o docx-template"
```

---

### Task 2: Route Handler `GET /applications/[id]/pdf`

**Files:**
- Create: `cv-tailor/src/app/applications/[id]/pdf/route.ts`

- [ ] **Step 1: Implementar o Route Handler**

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getApplicationDetail, getProfile } from '@/lib/repository'
import { generatedCvSchema } from '@/lib/generation-schema'
import { renderCvPdf, sanitizeFilename } from '@/lib/pdf-template'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return NextResponse.json({ error: 'Sessao expirada. Faca login novamente.' }, { status: 401 })
  }

  const db = createServiceClient()

  let application
  let cvVersion
  try {
    const detail = await getApplicationDetail(db, id, userId)
    application = detail.application
    cvVersion = detail.cvVersion
  } catch (error) {
    console.error('GET /applications/[id]/pdf: candidatura nao encontrada:', error)
    return NextResponse.json({ error: 'Candidatura nao encontrada.' }, { status: 404 })
  }

  if (!cvVersion) {
    return NextResponse.json({ error: 'Nenhum CV gerado para essa candidatura ainda.' }, { status: 404 })
  }

  const content = generatedCvSchema.parse(cvVersion.generated_json)
  const profile = await getProfile(db, userId)
  const pdfBuffer = await renderCvPdf(profile, content)

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="CV-${sanitizeFilename(application.company)}.pdf"`,
    },
  })
}
```

Notas de implementação (não pular):
- `getApplicationDetail` já filtra por `user_id` internamente (mesma proteção de ownership do resto
  do app) — se a candidatura não existe ou não é do usuário logado, a query interna de
  `getApplication` (`.single()`) lança, e o `catch` aqui responde `404` sem vazar qual dos dois casos
  aconteceu (não existe vs. não é sua — mesmo padrão de não vazar existência usado em
  `deleteApplication`).
- `generatedCvSchema.parse(...)` valida o formato do JSON vindo do banco (coluna `jsonb`, tipada
  `unknown` em `CvVersion`) antes de repassar pro renderer — se o schema não bater, o Route Handler
  deixa a exceção do Zod propagar como erro 500 genérico do Next.js (comportamento aceitável: dado
  corrompido em `generated_json` é um bug de outro lugar do sistema, não algo pra esconder com uma
  mensagem bonita aqui).
- `getProfile` não tem try/catch dedicado — se o perfil não existir (usuário sem perfil, situação que
  não deveria acontecer pra quem já tem `cv_versions`), deixa propagar como 500 também.

- [ ] **Step 2: Rodar `tsc --noEmit` pra confirmar que compila**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/app/applications/[id]/pdf/route.ts
git commit -m "feat(cv-tailor): adiciona route handler de download do CV em PDF"
```

---

### Task 3: Botão "Baixar PDF" na página de detalhe

**Files:**
- Modify: `cv-tailor/src/app/applications/[id]/page.tsx`

- [ ] **Step 1: Adicionar o link ao lado do "Baixar .docx"**

Em `cv-tailor/src/app/applications/[id]/page.tsx`, localizar o bloco (linha ~56-62):

```tsx
      {cvVersion && downloadUrl && (
        <>
          <h2>CV gerado</h2>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span>Currículo pronto, ATS-safe, sob medida pra essa vaga.</span>
            <a href={downloadUrl} className="btn btn-primary">⬇ Baixar .docx</a>
          </div>
```

Substituir por:

```tsx
      {cvVersion && downloadUrl && (
        <>
          <h2>CV gerado</h2>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span>Currículo pronto, ATS-safe, sob medida pra essa vaga.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={downloadUrl} className="btn btn-primary">⬇ Baixar .docx</a>
              <a href={`/applications/${application.id}/pdf`} className="btn btn-secondary">⬇ Baixar PDF</a>
            </div>
          </div>
```

(o restante do bloco — a seção de "Perguntas prováveis de entrevista" logo abaixo — não muda, só a `<div className="card">` interna ganha o segundo link dentro de um wrapper flex).

- [ ] **Step 2: Rodar `tsc --noEmit` e `npm run build`**

Run: `cd cv-tailor && npx tsc --noEmit && npm run build`
Expected: sem erros, build completo

- [ ] **Step 3: Verificar manualmente contra o Supabase real**

Com `npm run dev` rodando e logado:
1. Abrir uma candidatura que já tenha CV gerado (ou gerar uma nova de teste).
2. Confirmar que aparecem os dois botões lado a lado: "⬇ Baixar .docx" (primário) e "⬇ Baixar PDF" (secundário).
3. Clicar em "⬇ Baixar PDF" — confirmar que baixa um arquivo `CV-<empresa>.pdf` (nome sem caracteres especiais).
4. Abrir o PDF baixado — confirmar visualmente: nome, headline, contato, resumo, experiência (cargo/empresa em negrito + bullet), skills. Sem tabela, sem imagem — só texto corrido.
5. Selecionar texto dentro do PDF aberto (Ctrl+A ou arrastar o mouse) — confirmar que o texto é selecionável (prova de que é texto real, não imagem escaneada — importante pra compatibilidade com ATS).
6. Testar o caso de candidatura sem CV gerado ainda: acessar `/applications/<id-sem-cv>/pdf` diretamente na URL — confirmar que responde 404 com a mensagem esperada, não quebra com erro genérico.

- [ ] **Step 4: Commit**

```bash
git add cv-tailor/src/app/applications/[id]/page.tsx
git commit -m "feat(cv-tailor): adiciona botao de baixar CV em PDF na pagina de candidatura"
```

---

## Fora de escopo (confirmado na spec)

- Persistir o PDF gerado no Storage
- Formatação rica (negrito seletivo, múltiplas colunas)
- Escolher o formato de saída no momento de *gerar* o CV — DOCX e PDF ficam sempre os dois disponíveis lado a lado depois que o CV existe
