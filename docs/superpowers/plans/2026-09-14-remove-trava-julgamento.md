# Remove trava de julgamento de match — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parar de bloquear a geração de CV quando a IA julga que a vaga "não combina o suficiente" — gerar sempre (exceto banco mestre totalmente vazio), mostrando um aviso não-bloqueante na tela em vez de recusar.

**Architecture:** `runCvGeneration` (orchestrator) perde os 2 `throw` de julgamento; sobra só o de banco vazio. Quando a IA não seleciona nenhuma conquista relevante e não preenche `matchWarning` sozinha, o orchestrator garante um aviso padrão antes de salvar. A página de detalhe da candidatura passa a ler e mostrar esse aviso (nunca dentro do `.docx`/PDF, que já não leem esse campo).

**Tech Stack:** TypeScript, Vitest (TDD nos testes já existentes do orchestrator).

---

### Task 1: `generate-cv-orchestrator.ts` — remove as travas de julgamento

**Files:**
- Modify: `cv-tailor/src/lib/generate-cv-orchestrator.ts`
- Test: `cv-tailor/tests/generate-cv-orchestrator.test.ts`

- [ ] **Step 1: Reescrever os 2 testes que hoje esperam bloqueio (TDD — primeiro o teste, depois o código)**

Em `tests/generate-cv-orchestrator.test.ts`, localizar o teste:

```ts
  it('throws when Claude finds no relevant achievements for this posting', async () => {
    const deps = makeDeps({
      generateTailoredCv: vi.fn().mockResolvedValue({
        sufficientMatch: false, matchWarning: null,
        headline: 'X', summary: 'Y', selectedAchievements: [], keywords: [], interviewQuestions: [],
      }),
    })

    await expect(runCvGeneration(deps, 'app-1', 'pt')).rejects.toThrow(/relevante/)
    expect(deps.uploadCvDocx).not.toHaveBeenCalled()
  })
```

Substituir por:

```ts
  it('generates the CV anyway when Claude finds no relevant achievements, backfilling a matchWarning', async () => {
    const deps = makeDeps({
      generateTailoredCv: vi.fn().mockResolvedValue({
        sufficientMatch: false, matchWarning: null,
        headline: 'X', summary: 'Y', selectedAchievements: [], keywords: [], interviewQuestions: [],
      }),
    })

    await runCvGeneration(deps, 'app-1', 'pt')

    expect(deps.uploadCvDocx).toHaveBeenCalled()
    expect(deps.saveCvVersion).toHaveBeenCalledWith(
      'app-1',
      'app-1.docx',
      expect.objectContaining({ matchWarning: expect.stringContaining('Nenhuma conquista') }),
    )
  })
```

Localizar o teste (nome longo, com a explicação do bug real):

```ts
  it('throws with the model\'s own matchWarning when it picked real-but-irrelevant achievements for a mismatched vaga (real bug: a Web3 posting against a TPM-only bank got 3 real, verbatim, but topically irrelevant achievements selected, and the model wrote its honest "this is not a good fit" assessment into the résumé\'s own summary field instead of blocking)', async () => {
    const deps = makeDeps({
      generateTailoredCv: vi.fn().mockResolvedValue({
        sufficientMatch: false,
        matchWarning: 'Banco de dados nao tem experiencia real em Rust/Solidity/Soroban, exigidos pela vaga.',
        headline: 'Soroban Smart Contract Developer',
        summary: 'Some summary the model still filled in',
        selectedAchievements: [{ company: 'Acme', roleTitle: 'Role', bullet: 'Did something real but unrelated to Web3' }],
        keywords: [],
        interviewQuestions: [],
      }),
    })

    await expect(runCvGeneration(deps, 'app-1', 'pt')).rejects.toThrow(/Rust\/Solidity\/Soroban/)
    expect(deps.renderCvDocx).not.toHaveBeenCalled()
    expect(deps.uploadCvDocx).not.toHaveBeenCalled()
    expect(deps.saveCvVersion).not.toHaveBeenCalled()
  })
```

Substituir por:

```ts
  it('generates the CV anyway when sufficientMatch is false, preserving the model\'s own matchWarning untouched (real case: a Web3 posting against a TPM-only bank got 3 real, verbatim, but topically irrelevant achievements selected — the app must not decide for the user whether the vaga is worth applying to)', async () => {
    const deps = makeDeps({
      generateTailoredCv: vi.fn().mockResolvedValue({
        sufficientMatch: false,
        matchWarning: 'Banco de dados nao tem experiencia real em Rust/Solidity/Soroban, exigidos pela vaga.',
        headline: 'Soroban Smart Contract Developer',
        summary: 'Some summary the model still filled in',
        selectedAchievements: [{ company: 'Acme', roleTitle: 'Role', bullet: 'Did something real but unrelated to Web3' }],
        keywords: [],
        interviewQuestions: [],
      }),
    })

    await runCvGeneration(deps, 'app-1', 'pt')

    expect(deps.renderCvDocx).toHaveBeenCalled()
    expect(deps.uploadCvDocx).toHaveBeenCalled()
    expect(deps.saveCvVersion).toHaveBeenCalledWith(
      'app-1',
      'app-1.docx',
      expect.objectContaining({ matchWarning: 'Banco de dados nao tem experiencia real em Rust/Solidity/Soroban, exigidos pela vaga.' }),
    )
  })
```

O resto do arquivo de teste (pipeline completo, banco vazio, erro do Claude propagado) não muda.

- [ ] **Step 2: Rodar os testes e confirmar que falham (código ainda não mudou)**

Run: `cd cv-tailor && npx vitest run tests/generate-cv-orchestrator.test.ts`
Expected: FAIL — os 2 testes reescritos falham porque `runCvGeneration` ainda lança as exceções antigas.

- [ ] **Step 3: Remover as travas de julgamento em `generate-cv-orchestrator.ts`**

Localizar:

```ts
  const generated = await deps.generateTailoredCv(masterData, application.job_description_raw, language)
  if (generated.selectedAchievements.length === 0) {
    throw new CvGenerationError('Nenhuma conquista do banco mestre e relevante pra essa vaga especifica. Adicione conquistas relacionadas antes de gerar (ou confirme que essa vaga realmente nao combina com o seu perfil atual).')
  }
  // Real testing showed the model can still pick a few technically-real
  // achievements (passing the check above) for a vaga that doesn't actually
  // match — e.g. picking generic TPM bullets for a Rust/Soroban role. It
  // reliably self-reports this via sufficientMatch/matchWarning (see the
  // prompt), so trust that judgment and block before a misleading résumé
  // ever gets rendered.
  if (!generated.sufficientMatch) {
    throw new CvGenerationError(generated.matchWarning ?? 'O banco mestre nao cobre os requisitos tecnicos centrais dessa vaga.')
  }
```

Substituir por:

```ts
  const generated = await deps.generateTailoredCv(masterData, application.job_description_raw, language)

  // Não bloqueia mais por julgamento de match (sufficientMatch/selectedAchievements vazio) — o
  // usuário decide se quer se candidatar; a aplicação só maximiza a chance de passar no ATS e
  // chegar na parte humana. Se a IA não achou nenhuma conquista relevante e também não preencheu
  // matchWarning sozinha, garante que sempre existe um aviso pra mostrar na tela (nunca no
  // documento em si — nem docx-template.ts nem pdf-template.ts leem esse campo).
  if (generated.selectedAchievements.length === 0 && !generated.matchWarning) {
    generated.matchWarning = 'Nenhuma conquista do banco combina diretamente com essa vaga — CV gerado só com resumo/skills.'
  }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd cv-tailor && npx vitest run tests/generate-cv-orchestrator.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd cv-tailor && npx vitest run`
Expected: PASS (todos)

- [ ] **Step 6: Commit**

```bash
git add cv-tailor/src/lib/generate-cv-orchestrator.ts cv-tailor/tests/generate-cv-orchestrator.test.ts
git commit -m "fix(cv-tailor): remove trava de julgamento de match, gera CV sempre com aviso"
```

---

### Task 2: Mostrar o aviso na página de detalhe da candidatura

**Files:**
- Modify: `cv-tailor/src/app/applications/[id]/page.tsx`

- [ ] **Step 1: Ler e validar `generated_json` pra extrair `matchWarning`**

Localizar, no topo do arquivo:

```ts
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getApplicationDetail } from '@/lib/repository'
import { getCvDownloadUrl } from '@/lib/storage'
import { updateStatusAction } from '@/app/actions/update-status'
import { GenerateCvForm } from './generate-cv-form'
import type { ApplicationStatus } from '@/lib/types'
```

Trocar por (adiciona o import do schema):

```ts
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getApplicationDetail } from '@/lib/repository'
import { getCvDownloadUrl } from '@/lib/storage'
import { updateStatusAction } from '@/app/actions/update-status'
import { generatedCvSchema } from '@/lib/generation-schema'
import { GenerateCvForm } from './generate-cv-form'
import type { ApplicationStatus } from '@/lib/types'
```

Localizar:

```ts
  const { application, cvVersion, interviewQuestions } = await getApplicationDetail(db, id, userId)
  const downloadUrl = cvVersion ? await getCvDownloadUrl(db, cvVersion.storage_path) : null
```

Trocar por:

```ts
  const { application, cvVersion, interviewQuestions } = await getApplicationDetail(db, id, userId)
  const downloadUrl = cvVersion ? await getCvDownloadUrl(db, cvVersion.storage_path) : null
  const matchWarning = cvVersion ? generatedCvSchema.parse(cvVersion.generated_json).matchWarning : null
```

- [ ] **Step 2: Mostrar o aviso acima do card "CV gerado"**

Localizar:

```tsx
      {cvVersion && downloadUrl && (
        <>
          <h2>CV gerado</h2>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
```

Trocar por:

```tsx
      {cvVersion && downloadUrl && (
        <>
          <h2>CV gerado</h2>
          {matchWarning && (
            <div className="alert alert-info" role="status" style={{ marginBottom: 12 }}>
              ⚠️ {matchWarning}
            </div>
          )}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
```

(o restante do bloco — botões de download, seção de perguntas de entrevista — não muda)

- [ ] **Step 3: Rodar `tsc --noEmit` e `npm run build`**

Run: `cd cv-tailor && npx tsc --noEmit && npm run build`
Expected: sem erros, build completo

- [ ] **Step 4: Commit**

```bash
git add cv-tailor/src/app/applications/[id]/page.tsx
git commit -m "feat(cv-tailor): mostra aviso de match fraco na pagina da candidatura"
```

---

### Task 3: Verificação manual contra o Supabase/Claude real

**Não é subagent** — precisa de sessão logada e chamada real à API da Claude (custo). Feito pela
sessão controladora depois que Tasks 1-2 estiverem revisadas.

- [ ] **Step 1: Reproduzir o caso real do André**

Usar uma candidatura de teste com vaga que exija uma tecnologia que o banco mestre não tem (o André
já tem um caso real: vaga pedindo Python contra banco sem Python) — gerar o CV.

- [ ] **Step 2: Confirmar que gera em vez de bloquear**

Confirmar que o CV é gerado normalmente (antes travava com erro) e que aparece o aviso amarelo/neutro
acima do card "CV gerado" explicando a lacuna.

- [ ] **Step 3: Confirmar que o aviso não vaza pro documento**

Baixar o `.docx` e o PDF gerados — confirmar que nenhum dos dois menciona a ressalva de match em
lugar nenhum (nem no resumo, nem no headline).

- [ ] **Step 4: Confirmar o caso de match bom (sem regressão)**

Gerar CV pra uma vaga que combina bem com o banco — confirmar que nenhum aviso aparece.

---

## Fora de escopo (confirmado na spec)

- Mudar o prompt da IA ou os critérios de `sufficientMatch`
- Feature de LinkedIn/GitHub e quadro de cursos — specs separadas
