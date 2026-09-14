# Perfil: atalho "Nova candidatura" + apagar candidatura do histórico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar atalho "Nova candidatura" na página de Perfil e permitir apagar uma candidatura (com CVs e perguntas de entrevista) direto do dashboard.

**Architecture:** Duas mudanças independentes no app Next.js existente (`cv-tailor/`). Parte 1 é só layout (um `Link` a mais). Parte 2 segue o padrão já estabelecido no projeto para operações destrutivas — `repository.ts` (função pura de acesso a dados) → Server Action (`'use server'`, sessão + `revalidatePath`) → Client Component isolado pra estado de confirmação two-step (igual `profile-item-list.tsx`).

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase JS client (Postgres + Storage), TypeScript, Vitest.

**Nota sobre testes:** `repository.ts` e as Server Actions deste projeto **não têm cobertura automatizada** hoje — dependem de um `SupabaseClient` real (Postgres + Storage), e o projeto não tem infraestrutura de mock pra isso (os testes existentes em `tests/` cobrem só lógica pura: `docx-template`, `generation-schema`, `claude-generation`, etc., fakeando apenas o SDK da Anthropic). Este plano segue a mesma convenção: as tasks que tocam `repository.ts`/Server Actions/Client Components são verificadas manualmente contra o Supabase real via `npm run dev`, do jeito que toda a Fase 1 e Fase 2 deste projeto já foram validadas (ver `docs/superpowers/specs/` anteriores). Introduzir um mock de Supabase agora seria escopo novo não pedido — não faz parte desta mudança.

---

### Task 1: Atalho "Nova candidatura" no Perfil

**Files:**
- Modify: `cv-tailor/src/app/perfil/page.tsx`

- [ ] **Step 1: Adicionar o import e o botão**

Em `cv-tailor/src/app/perfil/page.tsx`, adicionar o import do `Link` no topo do arquivo:

```tsx
import Link from 'next/link'
```

Substituir o cabeçalho atual:

```tsx
      <h1>Perfil</h1>
      <p className="hint">Suba um CV (PDF ou DOCX) pra alimentar seu banco de dados. Edite ou apague qualquer item quando quiser — a revisão nunca é obrigatória.</p>
```

por:

```tsx
      <div className="section-header">
        <h1>Perfil</h1>
        <Link href="/applications/new" className="btn btn-primary">
          + Nova candidatura
        </Link>
      </div>
      <p className="hint">Suba um CV (PDF ou DOCX) pra alimentar seu banco de dados. Edite ou apague qualquer item quando quiser — a revisão nunca é obrigatória.</p>
```

(`.section-header` já existe em `globals.css`, é a mesma classe usada no cabeçalho do dashboard em `src/app/page.tsx`.)

- [ ] **Step 2: Verificar manualmente**

Rodar (se o dev server não estiver de pé):

```bash
cd cv-tailor
npm run dev
```

Abrir `http://localhost:3056/perfil` no navegador, confirmar que o botão "+ Nova candidatura" aparece ao lado do título "Perfil" com o mesmo estilo do botão do dashboard, e que clicar nele navega para `/applications/new`.

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/app/perfil/page.tsx
git commit -m "feat(cv-tailor): adiciona atalho de nova candidatura na pagina de perfil"
```

---

### Task 2: `deleteApplication` no repository

**Files:**
- Modify: `cv-tailor/src/lib/repository.ts`

- [ ] **Step 1: Adicionar a função `deleteApplication`**

Em `cv-tailor/src/lib/repository.ts`, adicionar logo depois da função `updateApplicationStatus` (linha ~93, antes de `getApplicationDetail`):

```ts
export async function deleteApplication(db: SupabaseClient, applicationId: string, userId: string): Promise<void> {
  const { data: versions, error: versionsError } = await db
    .from('cv_versions')
    .select('storage_path')
    .eq('application_id', applicationId)
  if (versionsError) throw versionsError

  if (versions && versions.length > 0) {
    const { error: storageError } = await db.storage.from('cv-files').remove(versions.map((v) => v.storage_path))
    if (storageError) console.error('deleteApplication: falha ao remover arquivos do Storage:', storageError)
  }

  const { error } = await db.from('applications').delete().eq('id', applicationId).eq('user_id', userId)
  if (error) throw error
}
```

Notas de implementação (não pular):
- A busca de `cv_versions` **não filtra por `user_id`** porque `cv_versions` não tem essa coluna (só `application_id`) — a proteção de ownership acontece no delete final de `applications`, que filtra por `user_id` explicitamente. Como o delete de `applications` só afeta a linha se `user_id` bater, um `applicationId` de outro usuário não apaga nada (nem a linha, nem — via cascade — os `cv_versions`), mesmo que os arquivos de Storage já tenham sido (inutilmente) listados. Isso é aceitável: só lista, nunca apaga Storage de quem não é dono, porque a lista vem de `cv_versions.application_id`, que só existe se a candidatura existir — se pertence a outro usuário, o attacker precisaria adivinhar um UUID de candidatura alheia, e mesmo acertando, a única consequência seria apagar o arquivo do PRÓPRIO Storage de outro usuário sem apagar a linha dele do banco (o `cv_versions` continua existindo, só o arquivo referenciado por ele suma) — cenário de baixo impacto real dado que a Server Action da Task 3 só é alcançável por quem está autenticado como si mesmo, mas vale registrar como limitação conhecida no PR.
- Falha ao remover do Storage (`storageError`) **não lança** — só loga e segue pro delete da linha. Prioridade é o usuário conseguir limpar o histórico mesmo se o Storage falhar.
- `cv_versions` e `interview_questions` são removidos pelo `on delete cascade` de `applications` (migration `0001_init.sql`), não precisa de delete manual.

- [ ] **Step 2: Sem verificação isolada nesta task**

`deleteApplication` ainda não tem nenhuma forma de ser chamada (a Server Action e o botão de UI vêm nas Tasks 3 e 4). A verificação end-to-end contra o Supabase real acontece no Step 3 da Task 4, que já cobre banco + Storage. Não escrever script temporário só pra testar esta função isoladamente — seria trabalho descartável que a Task 4 já revalida.

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/lib/repository.ts
git commit -m "feat(cv-tailor): adiciona deleteApplication ao repository (banco + storage)"
```

---

### Task 3: Server Action `deleteApplicationAction`

**Files:**
- Create: `cv-tailor/src/app/actions/delete-application.ts`

- [ ] **Step 1: Criar a action**

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { deleteApplication } from '@/lib/repository'

export async function deleteApplicationAction(applicationId: string): Promise<void> {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    redirect('/login')
  }
  const db = createServiceClient()
  await deleteApplication(db, applicationId, userId)
  revalidatePath('/')
}
```

Esse arquivo espelha exatamente o padrão de `cv-tailor/src/app/actions/update-status.ts` (mesma forma de tratar sessão expirada, mesmo uso de `revalidatePath`).

- [ ] **Step 2: Commit**

```bash
git add cv-tailor/src/app/actions/delete-application.ts
git commit -m "feat(cv-tailor): adiciona server action deleteApplicationAction"
```

---

### Task 4: Botão "Apagar" na tabela do dashboard

**Files:**
- Create: `cv-tailor/src/app/delete-application-button.tsx`
- Modify: `cv-tailor/src/app/page.tsx`

- [ ] **Step 1: Criar o Client Component do botão**

```tsx
'use client'

import { useState } from 'react'
import { deleteApplicationAction } from '@/app/actions/delete-application'

export function DeleteApplicationButton({ applicationId }: { applicationId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <form
          action={async () => {
            setPending(true)
            await deleteApplicationAction(applicationId)
          }}
        >
          <button type="submit" disabled={pending} className="btn btn-secondary" style={{ color: 'var(--danger)' }}>
            {pending ? 'Apagando…' : 'Confirmar'}
          </button>
        </form>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="btn btn-secondary">
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className="btn btn-secondary">
      Apagar
    </button>
  )
}
```

Segue o mesmo padrão two-step de `ProfileItemRow` em `profile-item-list.tsx` (estado local `confirming`, sem modal), adaptado porque `deleteApplicationAction` recebe o `applicationId` como argumento direto (não como `FormData` — não há outros campos de formulário aqui), então o `<form action={...}>` usa uma função inline em vez de `.bind()`.

- [ ] **Step 2: Adicionar a coluna "Ações" na tabela do dashboard**

Em `cv-tailor/src/app/page.tsx`, adicionar o import no topo:

```tsx
import { DeleteApplicationButton } from './delete-application-button'
```

Na `<thead>`, adicionar uma coluna:

```tsx
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Cargo</th>
              <th>Status</th>
              <th>Candidatado em</th>
              <th>Ações</th>
            </tr>
          </thead>
```

No `<tbody>`, adicionar a célula correspondente em cada linha:

```tsx
            {applications.map((app) => (
              <tr key={app.id}>
                <td><Link href={`/applications/${app.id}`}>{app.company}</Link></td>
                <td>{app.role_title}</td>
                <td><span className={`badge badge--${app.status}`}>{app.status.replace('_', ' ')}</span></td>
                <td className="muted">{app.applied_at}</td>
                <td><DeleteApplicationButton applicationId={app.id} /></td>
              </tr>
            ))}
```

- [ ] **Step 3: Verificar manualmente contra o Supabase real (cobre também a Task 2)**

Com `npm run dev` rodando e logado:
1. Repetir os passos 1-3 da verificação da Task 2 (criar candidatura de teste, gerar CV, confirmar `storage_path` existe no bucket `cv-files`).
2. No dashboard (`/`), localizar a linha da candidatura de teste, clicar "Apagar" → confirmar que vira "Confirmar"/"Cancelar".
3. Clicar "Cancelar" — confirmar que volta pro botão "Apagar" original, nada foi apagado (recarregar a página e checar que a candidatura ainda está lá).
4. Clicar "Apagar" de novo, depois "Confirmar" — confirmar que o botão mostra "Apagando…" e a linha some da tabela.
5. No SQL Editor do Supabase, confirmar que a linha de `applications` sumiu, e que os `cv_versions`/`interview_questions` associados também sumiram (cascade).
6. No Storage Browser do Supabase, confirmar que o arquivo `.docx` cujo `storage_path` foi anotado no passo 1 não existe mais no bucket `cv-files`.
7. Testar o caso de erro esperado: deslogar (ou expirar a sessão manualmente limpando o cookie) e tentar acessar `/` — confirmar que redireciona pra `/login` em vez de quebrar.

- [ ] **Step 4: Commit**

```bash
git add cv-tailor/src/app/delete-application-button.tsx cv-tailor/src/app/page.tsx
git commit -m "feat(cv-tailor): adiciona botao de apagar candidatura no dashboard"
```

---

## Fora de escopo (confirmado na spec)

- Soft-delete/arquivamento
- Opt-in de salvar no momento da criação da candidatura
- Mock de Supabase para testes automatizados de `repository.ts` (não existe no projeto hoje, não é objeto desta mudança)
- Retry automático de limpeza de Storage órfão
