# Perfil: atalho "Nova candidatura" + apagar candidatura do histórico

## Contexto

Dashboard (`/`) já é o histórico pesquisável de candidaturas (full-text search por empresa/cargo via `search_vector`). Duas lacunas reais identificadas:

1. O atalho "Nova candidatura" só existe no dashboard, não no Perfil.
2. Toda candidatura criada é persistida pra sempre — não existe forma de removê-la do histórico.

Decisão tomada com o André: não é um opt-in no momento da criação (não há estado "rascunho"/"pendente"). Segue como hoje — tudo salva por padrão — e ganha um botão de apagar por candidatura.

## Parte 1 — Atalho no Perfil

Adicionar `<Link href="/applications/new" className="btn btn-primary">+ Nova candidatura</Link>` no topo de `src/app/perfil/page.tsx`, mesmo padrão visual do dashboard (`src/app/page.tsx`). Sem mudança de lógica, só de layout.

## Parte 2 — Apagar candidatura

### Escopo do delete

Delete é **total e irreversível**: candidatura + CVs gerados + perguntas de entrevista. Confirmado com o André (não é soft-delete/arquivamento).

### Repository — `deleteApplication`

Nova função em `src/lib/repository.ts`:

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

Pontos deliberados:
- **Storage não é limpo por cascade do Postgres** (só linhas do banco são). Precisa de remoção explícita antes/depois do delete da linha — aqui é feita antes, mas independente do resultado do delete de `applications`.
- Falha no Storage **não bloqueia** o delete da candidatura — só loga. Prioridade é o usuário conseguir limpar o histórico; um arquivo órfão ocasional no bucket privado é aceitável (mesmo trade-off já aceito em outros lugares do projeto, ver débito técnico da Fase 2).
- `cv_versions` e `interview_questions` são removidos via `on delete cascade` já existente na migration `0001_init.sql` — não precisa de delete manual dessas tabelas.
- Filtro `.eq('user_id', userId)` explícito: o service client ignora RLS, então a proteção de "só apaga candidatura própria" é no código (mesmo padrão de `updateApplicationStatus`).

### Server Action

Nova `deleteApplicationAction` em `src/app/actions/delete-application.ts` (arquivo próprio, seguindo o padrão de uma action por arquivo já usado no projeto — `create-application.ts`, `update-status.ts`):

```ts
'use server'

export async function deleteApplicationAction(applicationId: string): Promise<void> {
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  await deleteApplication(db, applicationId, userId)
  revalidatePath('/')
}
```

Sem `redirect` — a action é chamada a partir da própria linha da tabela do dashboard (não navega pra outra página); `revalidatePath('/')` refaz a lista sem o item apagado.

### UI — dashboard

Nova coluna de ações na tabela de `src/app/page.tsx` (Server Component). Extraído um Client Component novo, `delete-application-button.tsx`, pra isolar o estado de confirmação (Server Component não tem `useState`) — mesmo padrão dois-passos de `profile-item-list.tsx`:

- Estado inicial: botão "Apagar"
- Ao clicar: vira "Confirmar" (vermelho, `--danger`) + "Cancelar" inline, sem modal
- "Confirmar" dispara a Server Action (`<form action={...}>`, sem JS obrigatório) e mostra estado "Apagando…" (via `useActionState`, mesmo padrão de outras actions do projeto)

## Fora de escopo (não implementado aqui)

- Soft-delete/arquivamento (rejeitado — usuário confirmou hard delete)
- Opt-in de salvar no momento da criação (rejeitado — dashboard já serve de histórico completo, delete pontual resolve o caso de uso)
- Retry automático de limpeza de Storage órfão (baixo risco, single-user, não vale a complexidade agora)

## Testes

- `deleteApplication`: remove application + cascade de cv_versions/interview_questions; chama `storage.remove` com os paths certos; não lança se `versions` vier vazio; não lança se o delete de Storage falhar (só loga); nunca apaga candidatura de outro `user_id` (chamada com userId errado não afeta linha).
- `deleteApplicationAction`: sessão expirada não deve derrubar a página (mesmo tratamento de erro esperado das outras actions).
- UI: two-step confirm renderiza "Confirmar"/"Cancelar" ao clicar "Apagar"; "Cancelar" volta ao estado original sem chamar a action.
