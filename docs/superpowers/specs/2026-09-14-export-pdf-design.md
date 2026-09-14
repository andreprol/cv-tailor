# Export de CV em PDF

## Contexto

Hoje o CV Tailor só gera `.docx` (biblioteca `docx`, texto puro — sem tabela/text box — pra garantir
que o arquivo passe limpo por parsers de ATS). André quer também PDF: parte pra portais/ATS que só
aceitam PDF, parte pra conferir visualmente o resultado antes de enviar.

## Decisão: gerar sob demanda, sem mudar o fluxo de geração

`cv_versions.generated_json` já guarda o conteúdo estruturado (`GeneratedCv`) usado por
`renderCvDocx`. Isso significa que o PDF pode ser renderizado **na hora do download**, a partir do
mesmo dado, sem:
- Migration de banco (não precisa de coluna nova pra um segundo `storage_path`)
- Mudança no `generate-cv-orchestrator.ts` ou em `generateCvAction` (a geração continua produzindo só
  o `.docx`, como hoje)
- Upload extra pro Storage (o PDF nunca é persistido — é bytes gerados e devolvidos direto na resposta HTTP)

Alternativas descartadas (ver decisão já validada com o André):
- Converter o `.docx` gerado pra PDF via LibreOffice/Chromium headless — mais fiel visualmente ao
  `.docx`, mas dependência pesada (binário externo ou Chromium), ruim de rodar em função serverless
  da Vercel (cold start, tamanho do bundle).
- Gerar e persistir o PDF no Storage junto com o `.docx` na hora da geração — exigiria migration
  (coluna nova ou generalizar `cv_versions` pra múltiplos formatos) e duplicaria trabalho de escrita
  toda vez que um CV é gerado, sem necessidade real já que renderizar o PDF é barato e raro (só
  quando alguém clica em baixar).

## Biblioteca: `pdfkit`, não `pdf-lib`

Ajuste em relação à conversa inicial: `pdfkit` (em vez de `pdf-lib`) — motivo é que `pdfkit` já
resolve **quebra de linha automática e paginação** (`doc.text(str, { width })` flui o texto e cria
página nova sozinho quando estoura o espaço). `pdf-lib` não tem isso embutido — exigiria escrever à
mão a lógica de medir largura de texto, quebrar linha e decidir quando criar página nova, código a
mais pra manter só pra reimplementar o que `pdfkit` já faz. `pdfkit` é puro JS/Node (usa `fontkit`
internamente), roda sem binário externo, funciona normalmente em função serverless da Vercel — usa
só as 14 fontes padrão do PDF (Helvetica), sem precisar carregar arquivo de fonte do disco.

## Arquitetura

**Novo arquivo:** `src/lib/pdf-template.ts`

```ts
export async function renderCvPdf(profile: Profile, content: GeneratedCv): Promise<Buffer>
```

Mesma assinatura de `renderCvDocx` (mesmo par de argumentos), pra deixar claro que é um renderer
irmão do mesmo dado — não deriva do `.docx`, deriva do mesmo `GeneratedCv` + `Profile`. Layout
espelha `docx-template.ts` (mesmas seções, mesma ordem, mesmo texto):

1. Nome (fonte maior, negrito) — `Helvetica-Bold`, 20pt
2. Headline (`content.headline`) — `Helvetica`, 12pt
3. Linha de contato (`location | phone | email | linkedin | github`, filtrando nulos) — `Helvetica`, 10pt
4. Linha em branco
5. "Professional Summary" (heading, `Helvetica-Bold` 13pt) + `content.summary` (corpo, `Helvetica` 10pt)
6. "Work Experience" (heading) + por conquista: `roleTitle - company` em negrito, depois `- bullet` em corpo
7. "Skills" (heading) + `content.keywords.join(', ')`

Margens de 50pt em página A4 (`pdfkit` usa A4 como tamanho padrão). Texto puro via `doc.text(...)` —
sem tabela, sem imagem, sem elemento que atrapalhe extração de texto por ATS (mesma garantia do
`.docx`, verificada de forma diferente: PDF gerado só com `doc.text`, nunca `doc.image`/anotação).

**Novo Route Handler:** `src/app/applications/[id]/pdf/route.ts`

```ts
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response>
```

Passos:
1. `getCurrentUserId()` — se falhar (sessão expirada), responde `401` (não faz sentido redirecionar
   pra `/login` num endpoint que serve um arquivo binário; o navegador não segue redirect de download
   de forma útil aqui — devolve status de erro simples).
2. `getApplicationDetail(db, id, userId)` — já filtra por `user_id` (proteção de ownership igual ao
   resto do app); se não achar a candidatura (não existe ou não é do usuário), `getApplication`
   dentro dela lança (`.single()` sem match), o handler captura e responde `404`.
3. Se `cvVersion` for `null` (candidatura sem CV gerado ainda), responde `404` com mensagem
   ("Nenhum CV gerado pra essa candidatura ainda").
4. Valida `cvVersion.generated_json` (tipado `unknown` no banco) com
   `generatedCvSchema.parse(cvVersion.generated_json)` antes de usar — mesmo cuidado que o resto do
   projeto tem com dado vindo do Postgres tipado frouxo.
5. Busca `profile` via `getProfile(db, userId)`.
6. `renderCvPdf(profile, content)` → `Buffer`.
7. Responde com `Content-Type: application/pdf` e
   `Content-Disposition: attachment; filename="CV-${sanitizeFilename(application.company)}.pdf"`,
   onde `sanitizeFilename` é uma função nova e pequena em `pdf-template.ts` (ou no próprio
   `route.ts` — decisão do implementador, não há um helper de sanitização de nome de arquivo em
   nenhum outro lugar do projeto hoje): `name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'curriculo'`.
   O download do `.docx` hoje usa uma signed URL do Storage sem nome customizado (o navegador usa o
   nome do arquivo salvo no bucket) — esse comportamento do `.docx` não muda, é só o PDF que ganha
   nome amigável por vir de uma resposta HTTP direta, não de uma signed URL de Storage.

**UI:** em `src/app/applications/[id]/page.tsx`, ao lado do botão existente `⬇ Baixar .docx`
(linha 61), adicionar:

```tsx
<a href={`/applications/${application.id}/pdf`} className="btn btn-secondary">⬇ Baixar PDF</a>
```

`btn-secondary` (não `btn-primary` como o `.docx`) pra manter o DOCX como ação primária visual — é o
formato "canônico" do app, o PDF é uma opção adicional. Sem JavaScript client-side: é um link comum,
o navegador dispara o download pelo `Content-Disposition` do Route Handler.

## Dependências novas

- `npm install pdfkit` + `npm install -D @types/pdfkit` (o pacote não inclui tipos TypeScript próprios) — produção.
- `npm install -D pdf-parse` — só para o teste de `pdf-template.ts` (extrair texto do PDF gerado e
  confirmar que nome/headline aparecem); não é usada em nenhum código de produção.

## Fora de escopo

- Preservar formatação rica (negrito seletivo dentro de uma frase, múltiplas colunas, etc.) — o PDF
  é deliberadamente tão simples quanto o `.docx` atual, mesma filosofia de "texto puro por cima de
  visual bonito", já validada pelo André na Fase 1.
- Guardar/cachear o PDF gerado — cada download re-renderiza. Custo de CPU é baixo (texto puro, sem
  imagem) e a frequência de uso é baixa (uma pessoa, poucos downloads por candidatura).
- Escolher entre DOCX e PDF na hora de *gerar* o CV — os dois formatos ficam sempre disponíveis lado
  a lado depois que o CV é gerado uma vez, exatamente como o app já disponibiliza um único DOCX hoje.

## Testes

`pdf-template.ts` ganha teste no mesmo padrão de `docx-template.test.ts`: gera um PDF com dado
sintético (mesmo fixture `GeneratedCv`/`Profile` já usado lá) e confirma:
- Buffer não vazio e começa com o cabeçalho de arquivo PDF (`%PDF-`)
- Nenhuma exceção ao gerar com uma lista de conquistas vazia (`selectedAchievements: []`) — caso
  extremo que o código de layout precisa suportar sem quebrar
- Nome completo e headline aparecem no texto extraído do PDF (usar uma lib de extração simples, ex.
  `pdf-parse`, só no teste — não vira dependência de produção)

O Route Handler não ganha teste automatizado pela mesma razão que as outras Server Actions do
projeto não têm (depende de Supabase real, sem infraestrutura de mock) — verificação é manual, via
`npm run dev` contra o Supabase real, clicando em "Baixar PDF" numa candidatura de teste com CV já
gerado e conferindo o arquivo baixado.
