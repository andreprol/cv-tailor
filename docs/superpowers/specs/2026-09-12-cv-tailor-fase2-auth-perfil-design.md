# CV Tailor — Fase 2: Autenticação + Perfil/Upload (design)

Data: 2026-09-12
Status: aprovado por André, pronto pra virar plano de implementação

## Contexto e motivação

A Fase 1 entregou o motor de geração de CV ATS-safe + rastreador de candidaturas, validado em produção
(`https://cv-tailor-amber.vercel.app`) com dado real do André. Todo o "banco de dados mestre" (achievements,
education, skills, certifications) foi populado por um importador CLI one-shot
([scripts/import-cv.ts](../../../scripts/import-cv.ts)) que só funciona porque quem operou a importação
(o agente) sabia exatamente onde estavam os CVs do André no disco. `user_id` é hoje uma constante fixa
([src/lib/constants.ts](../../../src/lib/constants.ts): `DEFAULT_USER_ID`).

Isso trava a Fase 1 em uso pessoal. Pra qualquer usuário novo e desconhecido, a aplicação não tem como
"conhecer" a pessoa — precisa de uma área de login e de um fluxo de upload self-service que substitua o
importador manual. André confirmou intenção de transformar isso em produto vendável em breve; esta fase é
pré-requisito direto pra isso (sem multi-usuário real, não há o que vender).

## Objetivo da Fase 2

1. Autenticação real via Supabase Auth, com os 3 métodos de login ativos simultaneamente: magic link,
   Google OAuth, email/senha.
2. Área de perfil onde o usuário sobe seu(s) CV(s) existente(s) (PDF ou DOCX), a aplicação extrai os
   dados estruturados via Claude (reaproveitando o motor da Fase 1) e grava no banco mestre do usuário
   logado — sem depender de ninguém saber onde estão os arquivos.
3. Cada item do banco mestre (achievement/education/skill/certification) marcado com 1+ tags de
   posicionamento (`TPM` | `AI Product` | `Web3` — mesmo enum que já existe em
   [src/lib/types.ts](../../../src/lib/types.ts)), escolhidas pelo usuário no momento do upload — cobre o
   caso de "múltiplas fontes de CV" (ex.: um CV mais TPM, outro mais Web3) sem precisar de tabela de
   perfis separada.
4. Usuário pode ver, editar e apagar qualquer item do banco mestre a qualquer momento, e subir CVs novos
   depois pra complementar (upload não substitui, faz append).
5. Todo dado passa a ser isolado por `user_id` real (RLS + filtro explícito no código), substituindo o
   `DEFAULT_USER_ID` hardcoded.

**Revisão dos dados extraídos é opcional, não obrigatória** — depois do upload o usuário cai direto no
dashboard e pode gerar candidaturas imediatamente; a tela de perfil (visualizar/editar/apagar) fica
disponível a qualquer momento, não é um gate de onboarding.

Fora de escopo nesta fase: cobrança/billing, tabela de perfis separados por posicionamento (fica pra uma
fase futura se o modelo de tags não for suficiente), export do CV em outro formato além de `.docx`,
recuperação de senha customizada (usa o fluxo padrão do Supabase Auth), scraping de LinkedIn pra
importação automática de perfil.

## Arquitetura

- **Supabase Auth** como provedor único, 3 métodos ativos: magic link (OTP por email), Google OAuth,
  email/senha. Sessão via cookie, lida no server com `@supabase/ssr` (`createServerClient`).
- **Middleware Next.js** protege as rotas autenticadas (`/`, `/applications/*`, `/perfil`), redireciona
  pra `/login` sem sessão válida.
- **Isolamento de dado em duas camadas**: filtro explícito `user_id = <sessão atual>` em todo
  select/insert/update/delete no código da aplicação, MAIS RLS ativada em todas as tabelas
  (`policy: user_id = auth.uid()`) como rede de segurança — não confiar só no código da aplicação (lição
  já registrada na memória do projeto Uriverse3D: RLS "é comportamento, não só segurança").
- **`createServiceClient()`** (service role, já existe da Fase 1) continua usado nos server actions —
  service role ignora RLS por design (`BYPASSRLS`), então o filtro `user_id` explícito no código
  continua obrigatório mesmo com RLS ativada.
- **Upload e extração** reaproveitam o motor da Fase 1 quase integralmente
  ([src/lib/claude-generation.ts](../../../src/lib/claude-generation.ts) já usa
  `anthropic.beta.messages.create` com bloco de documento PDF). A lógica hoje presa no script
  [scripts/import-cv.ts](../../../scripts/import-cv.ts) vira Server Action acionada pelo formulário de
  upload da tela de perfil, gravando com `user_id` real em vez de rodar CLI manual.
- **Conversão de DOCX**: a API de documento da Anthropic só aceita PDF como bloco binário. Pra aceitar
  upload em DOCX, o texto é extraído antes com a lib `mammoth`
  (`mammoth.extractRawText({ buffer })`) e enviado como bloco de texto puro no prompt — branch separada
  do fluxo PDF (que continua indo como bloco de documento binário, com melhor extração de layout).
- **Arquivo original enviado no upload não é persistido** — só processado (extração de texto/documento)
  e descartado, igual o script CLI atual faz. Só o que a Claude extrai vira linha no banco.

## Componentes

1. **Login** (`/login`) — layout em coluna única: botão "Continuar com Google" no topo, divisor, campo
   de email + senha com botão "Entrar", e um link secundário "Prefiro receber um link mágico por email"
   que troca o formulário pro fluxo de magic link (mesmo campo de email, botão "Enviar link").
2. **Callback de auth** (`/auth/callback`) — rota que troca o code do OAuth/magic link pela sessão
   (padrão `@supabase/ssr`), redireciona pro dashboard.
3. **Perfil** (`/perfil`) — upload de CV novo (PDF ou DOCX) com checkboxes de posicionamento (1+
   obrigatório) antes de enviar; abaixo, lista de todo o banco mestre agrupado por categoria (Conquistas,
   Formação, Skills, Certificações), cada item mostrando badges de tag de posicionamento e ações de
   editar (abre os campos inline) e apagar.
4. **Importador refeito como Server Action** — recebe arquivo + tags escolhidas, detecta PDF vs DOCX,
   extrai (documento binário ou `mammoth` + texto), chama Claude, valida com o mesmo schema Zod da Fase
   1, grava cada achievement/education/skill/certification com as tags escolhidas e `user_id` da sessão.
5. **Dashboard e candidaturas** (`/`, `/applications/*`) — sem mudança de layout, só passam a filtrar por
   `user_id` da sessão em vez do `DEFAULT_USER_ID`.

## Modelo de dados

Schema atual já cobre quase tudo — `positioning text[]` existe em `achievements`, `education`, `skills`,
`certifications` desde a migração da Fase 1 ([supabase/migrations/0001_init.sql](../../../supabase/migrations/0001_init.sql)),
só nunca foi exposto na UI.

Mudanças necessárias (nova migração):

- `user_id uuid not null` em todas as tabelas passa a ter `references auth.users(id) on delete cascade`
  (hoje é uma coluna solta, sem referência — só funcionava porque era sempre o mesmo UUID fixo).
- `alter table ... enable row level security` em todas as tabelas de dado do usuário
  (`profile`, `achievements`, `education`, `certifications`, `skills`, `applications`, `cv_versions`,
  `interview_questions`).
- Uma `policy` por tabela: `using (user_id = auth.uid())` pra select/update/delete,
  `with check (user_id = auth.uid())` pra insert.
- Nenhuma tabela nova — "múltiplas fontes de CV" vira tag no schema existente, não perfil separado.

> ⚠️ Adicionar FK + ativar RLS em tabela com dado real (candidaturas do André já gravadas em produção) é
> operação de risco alto no protocolo de execução — na implementação, essa migração roda com backup e
> confirmação explícita antes de aplicar em produção, não é feita silenciosamente dentro de uma task.

## Fluxo

1. Usuário novo abre o app → tela de login → escolhe um dos 3 métodos → autentica.
2. Callback grava a sessão → redireciona pro dashboard, que está vazio (nenhuma candidatura ainda).
3. Usuário vai em "Perfil" → sobe um CV (PDF ou DOCX) → marca 1+ tags de posicionamento → confirma.
4. Server Action extrai o conteúdo (mammoth se DOCX, bloco de documento se PDF) → chama Claude → valida →
   grava achievements/education/skills/certifications com as tags escolhidas e `user_id` da sessão.
5. Usuário cai na tela de perfil vendo a lista recém-importada (revisão é opcional — pode ignorar e ir
   direto pro dashboard, ou editar/apagar algum item ali mesmo).
6. Dali em diante, fluxo idêntico à Fase 1 (nova candidatura → gerar CV → baixar `.docx`), só que
   filtrado pelo `user_id` real.
7. Se quiser adicionar mais dado depois (ex.: um CV mais focado em Web3), volta em "Perfil" e sobe outro
   arquivo com outras tags — o upload faz append, não substitui o que já existe.

## Tratamento de erro

Segue o padrão já estabelecido na Fase 1 — `useActionState` retornando estado com `error`, nunca `throw`
cru (erros de Server Action/Server Component perdem a mensagem em produção, só sobra um digest).

- Upload de arquivo que não é PDF nem DOCX → erro inline no formulário, upload não é enviado.
- Falha na extração (Claude retorna vazio ou JSON malformado) → 1 retry automático (mesmo padrão do
  motor de geração da Fase 1); falhando de novo, erro claro: "Não consegui ler esse CV, tenta outro
  arquivo ou peça pra ele revisar o formato."
- Login com credencial inválida ou magic link expirado → erro inline no formulário de login, mensagem do
  próprio Supabase Auth traduzida pro português quando aplicável.
- Acesso negado por RLS → não deveria acontecer com o filtro de código correto; funciona como rede de
  segurança, não como tratamento de erro principal da aplicação.

## Testes

- Unit: nova Server Action de upload/perfil (mock Anthropic + Supabase), mesma cobertura de qualidade da
  Fase 1 (schema Zod, guarda anti-alucinação, retry).
- Unit: extração de texto via `mammoth` com fixture `.docx` real.
- RLS: teste específico com **anon key** via chamada direta (não service role — service role ignora RLS
  por design, testar com ele mentiria sobre a proteção real). Confirma que usuário A não lê/edita/apaga
  dado do usuário B.
- E2E manual (mesma disciplina da Fase 1 — testar contra serviço live, não só mock): criar conta nova,
  logar pelos 3 métodos, subir um CV em PDF e outro em DOCX, gerar um CV pra vaga, confirmar que o
  dashboard só mostra dado do usuário logado.

## Decisões descartadas (com motivo)

- **Revisão obrigatória dos dados extraídos antes de liberar o resto do app**: descartado — André
  preferiu fluxo mais rápido (cair direto no dashboard), revisão fica disponível mas opcional na tela de
  perfil.
- **Tabela `profiles` separada por posicionamento** (cada CV vira um perfil isolado, usuário escolhe QUAL
  perfil usar por candidatura): descartado pra esta fase — mais fiel ao pedido original de "múltiplas
  fontes", mas exige mais schema e mais tela (gerenciar perfis, trocar perfil ativo) sem ganho real sobre
  o modelo de tags, que já resolve o caso de uso (dar ênfase certa por vaga) com o schema que já existe.
  Fica registrado como opção futura se o modelo de tags não escalar.
- **Tag de posicionamento livre** (usuário digita qualquer rótulo): descartado — enum fixo
  (`TPM`/`AI Product`/`Web3`) já existe no código, cobre o caso real do André, evita tela de gerenciar
  tags e autocomplete que só fariam sentido com múltiplos usuários com necessidades diferentes.
- **Claude infere a tag de posicionamento automaticamente**: descartado — exigiria chamada extra de IA e
  poderia errar sem ninguém notar, já que a revisão agora é opcional. Usuário escolher a tag no próprio
  formulário de upload é zero ambiguidade e zero custo extra.
- **Tela de perfil só com visualizar/apagar/reupload, sem edição campo-a-campo**: descartado — André
  pediu edição inline também, pra corrigir extração torta sem precisar reimportar o CV inteiro.
- **Login em abas separadas (senha vs. link mágico)**: descartado a favor de layout em coluna única — mais
  direto, sem clique extra pra achar o link mágico.
- **Tela de perfil com segmented control de posicionamento como filtro primário**: descartado a favor de
  lista única agrupada por categoria com a tag como badge — mais simples de construir, resolve bem
  enquanto o banco mestre não estiver muito grande.
