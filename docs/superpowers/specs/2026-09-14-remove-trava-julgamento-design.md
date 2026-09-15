# Remove trava de julgamento de match, mostra aviso em vez de bloquear

## Contexto

O sistema hoje **recusa gerar o CV** quando julga que o banco mestre não cobre bem os requisitos
técnicos da vaga (`sufficientMatch: false`) ou quando não acha nenhuma conquista relevante
(`selectedAchievements.length === 0`). André reportou o caso real: candidatura que exige Python,
banco mestre só tem outras linguagens — o sistema recusou gerar o CV inteiro.

**Decisão:** a aplicação não deve decidir se o André pode ou não se candidatar — o papel dela é
maximizar a chance de passar pelo ATS e chegar na parte humana, sempre que ele pedir pra gerar. A
única situação que continua bloqueando é a ausência total de dado (banco mestre vazio) — aí não é
julgamento, é impossibilidade real (não tem nada pra render).

## O que muda

### `src/lib/generate-cv-orchestrator.ts`

Remove os 2 `throw` de julgamento, mantém só o de banco vazio:

```ts
export async function runCvGeneration(deps: GenerateCvDeps, applicationId: string, language: CvLanguage): Promise<void> {
  const application = await deps.getApplication(applicationId)

  const masterData = await deps.getMasterDataBank()
  if (masterData.achievements.length === 0) {
    throw new CvGenerationError('Banco mestre vazio pra esse usuario — rode o importador antes de gerar um CV.')
  }

  const generated = await deps.generateTailoredCv(masterData, application.job_description_raw, language)

  // Não bloqueia mais por julgamento de match (sufficientMatch/selectedAchievements vazio) — o
  // usuário decide se quer se candidatar, a aplicação só maximiza a chance de passar no ATS.
  // Se a IA não achou nenhuma conquista relevante e também não preencheu matchWarning sozinha,
  // garante que sempre existe um aviso pra mostrar na tela (nunca no documento em si).
  if (generated.selectedAchievements.length === 0 && !generated.matchWarning) {
    generated.matchWarning = 'Nenhuma conquista do banco combina diretamente com essa vaga — CV gerado só com resumo/skills.'
  }

  const profile = await deps.getProfile()
  const docxBuffer = await deps.renderCvDocx(profile, generated)
  const storagePath = await deps.uploadCvDocx(applicationId, docxBuffer)

  await deps.saveCvVersion(applicationId, storagePath, generated)
  await deps.saveInterviewQuestions(applicationId, generated.interviewQuestions)
}
```

Nenhuma mudança no prompt (`claude-generation.ts`) nem nas travas anti-alucinação em
`assembleGeneratedCv` (ID real da conquista, métrica preservada na tradução) — essas seguem
validando FATOS, não fazendo julgamento de "vale a pena se candidatar". `sufficientMatch`/
`matchWarning` continuam existindo no schema e sendo preenchidos pela IA exatamente como hoje — só
o que muda é que deixam de travar, e passam a ser exibidos.

### `src/app/applications/[id]/page.tsx` — mostrar o aviso

Hoje `matchWarning` é salvo em `cv_versions.generated_json` mas nunca é lido de volta na tela — só
alimentava o bloqueio que está saindo. Precisa:

1. Validar `cvVersion.generated_json` com `generatedCvSchema.parse(...)` (mesmo padrão já usado no
   Route Handler do PDF) pra extrair `matchWarning` com segurança de tipo.
2. Se `matchWarning` existir, mostrar um aviso (`alert` — usar o estilo neutro/atenção já existente
   no projeto, não o `alert-error` vermelho, já que não é uma falha) **acima** do card "CV gerado",
   nunca dentro do `.docx`/PDF (isso já é garantido estruturalmente — nem `docx-template.ts` nem
   `pdf-template.ts` leem esse campo).

## Fora de escopo

- Mudar o prompt da IA ou os critérios de `sufficientMatch` — a IA continua avaliando e reportando
  do jeito que já faz, só para de travar o sistema.
- As outras 2 pedidas do André na mesma mensagem (LinkedIn/GitHub, quadro de cursos) — specs
  separadas, não fazem parte desta mudança.

## Testes

Sem infraestrutura de mock de Supabase/Anthropic pra testar o orchestrator inteiro fim a fim (mesma
limitação já documentada). Verificação manual:
1. Gerar CV pra uma vaga que claramente não combina com o banco (ex: repetir o caso real do André,
   vaga pedindo Python) — confirmar que o CV é gerado normalmente (antes travava) e que aparece um
   aviso na tela explicando a lacuna.
2. Confirmar que o aviso NÃO aparece dentro do `.docx`/PDF baixado.
3. Gerar CV pra uma vaga que combina bem — confirmar que nenhum aviso aparece (comportamento igual
   a hoje).
