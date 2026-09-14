# Dedup de upload: UNIQUE constraint + fix de recertificação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a race condition do dedup de upload de CV movendo a garantia de unicidade pra dentro do Postgres (UNIQUE constraint real), e corrigir o bug de recertificação incluindo a data de emissão na chave de unicidade de certificação.

**Architecture:** Migration nova adiciona colunas geradas normalizadas + índice único por tabela (`achievements`, `education`, `skills`, `certifications`). As 4 funções de insert em `repository.ts` trocam `.insert()` por `.upsert(..., { ignoreDuplicates: true })` e passam a retornar quantas linhas foram realmente inseridas. `upload-cv.ts` simplifica removendo o dedup em memória (fica redundante — o banco garante sozinho).

**Tech Stack:** Supabase (Postgres), `@supabase/supabase-js` (`.upsert()`), TypeScript.

**⚠️ Nota importante sobre a migration:** este plano cria o arquivo SQL da migration (Task 1), mas **não a aplica em produção**. Rodar a migration contra o banco real do André é uma operação HIGH-risco (contém `DELETE` de linhas duplicadas + `ALTER TABLE`) que exige pausa e confirmação explícita antes de executar, no formato do protocolo dele — isso é responsabilidade da sessão controladora (quem está executando este plano), não de um subagent. Nenhuma task abaixo pede pra um subagent rodar SQL contra o Supabase de produção.

---

### Task 1: Migration SQL

**Files:**
- Create: `cv-tailor/supabase/migrations/0003_dedup_unique_constraints.sql`

- [ ] **Step 1: Escrever a migration completa**

```sql
-- Remove duplicatas ja existentes antes de criar cada indice unico (um indice
-- unico falha na criacao se ja existir duplicata na tabela). Mantem a linha
-- mais antiga por created_at, apaga o resto. Mesmo criterio de normalizacao
-- (trim + lowercase + colapsar espacos) usado pelo app ate hoje.

delete from achievements a using achievements b
where a.user_id = b.user_id
  and lower(trim(regexp_replace(a.company, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.company, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(a.role_title, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.role_title, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(a.bullet, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.bullet, '\s+', ' ', 'g')))
  and a.created_at > b.created_at;

delete from skills a using skills b
where a.user_id = b.user_id
  and lower(trim(regexp_replace(a.name, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.name, '\s+', ' ', 'g')))
  and a.created_at > b.created_at;

delete from education a using education b
where a.user_id = b.user_id
  and lower(trim(regexp_replace(a.institution, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.institution, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(a.degree, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.degree, '\s+', ' ', 'g')))
  and a.created_at > b.created_at;

delete from certifications a using certifications b
where a.user_id = b.user_id
  and lower(trim(regexp_replace(a.name, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.name, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(coalesce(a.issuer, ''), '\s+', ' ', 'g'))) = lower(trim(regexp_replace(coalesce(b.issuer, ''), '\s+', ' ', 'g')))
  and coalesce(a.issued_on::text, '') = coalesce(b.issued_on::text, '')
  and a.created_at > b.created_at;

-- Colunas geradas normalizadas + indice unico por tabela.

alter table achievements
  add column company_norm text generated always as (lower(trim(regexp_replace(company, '\s+', ' ', 'g')))) stored,
  add column role_title_norm text generated always as (lower(trim(regexp_replace(role_title, '\s+', ' ', 'g')))) stored,
  add column bullet_norm text generated always as (lower(trim(regexp_replace(bullet, '\s+', ' ', 'g')))) stored;

create unique index achievements_dedup_idx on achievements (user_id, company_norm, role_title_norm, bullet_norm);

alter table skills
  add column name_norm text generated always as (lower(trim(regexp_replace(name, '\s+', ' ', 'g')))) stored;

create unique index skills_dedup_idx on skills (user_id, name_norm);

alter table education
  add column institution_norm text generated always as (lower(trim(regexp_replace(institution, '\s+', ' ', 'g')))) stored,
  add column degree_norm text generated always as (lower(trim(regexp_replace(degree, '\s+', ' ', 'g')))) stored;

create unique index education_dedup_idx on education (user_id, institution_norm, degree_norm);

-- issued_on entra na chave: recertificacao com data nova vira linha nova em
-- vez de ser tratada como duplicata da certificacao antiga.
alter table certifications
  add column name_norm text generated always as (lower(trim(regexp_replace(name, '\s+', ' ', 'g')))) stored,
  add column issuer_norm text generated always as (lower(trim(regexp_replace(coalesce(issuer, ''), '\s+', ' ', 'g')))) stored,
  add column issued_on_norm text generated always as (coalesce(issued_on::text, '')) stored;

create unique index certifications_dedup_idx on certifications (user_id, name_norm, issuer_norm, issued_on_norm);
```

- [ ] **Step 2: Não aplicar ainda — só commitar o arquivo**

A aplicação contra o Supabase de produção acontece depois de todas as tasks de código estarem
prontas e revisadas (ver Task 4), com a sessão controladora pausando pra confirmação explícita do
André antes de rodar qualquer `DELETE`/`ALTER TABLE` de verdade.

```bash
git add supabase/migrations/0003_dedup_unique_constraints.sql
git commit -m "feat(cv-tailor): migration de unique constraint pro dedup de dado mestre"
```

---

### Task 2: `repository.ts` — `insert*` viram `upsert`

**Files:**
- Modify: `cv-tailor/src/lib/repository.ts:140-187`

- [ ] **Step 1: Substituir as 4 funções**

Localizar em `src/lib/repository.ts` (linhas ~140-187) as 4 funções `insertAchievements`,
`insertSkills`, `insertEducation`, `insertCertifications` e substituir pelo bloco completo abaixo
(mesma ordem, mesmo lugar no arquivo):

```ts
export async function insertAchievements(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { company: string; roleTitle: string; startDate: string; endDate: string | null; bullet: string; metric: string | null }[],
): Promise<number> {
  const rows = items.map((a) => ({
    user_id: userId, company: a.company, role_title: a.roleTitle,
    start_date: a.startDate, end_date: a.endDate, bullet: a.bullet, metric: a.metric, positioning,
  }))
  const { data, error } = await db.from('achievements').upsert(rows, { onConflict: 'user_id,company_norm,role_title_norm,bullet_norm', ignoreDuplicates: true }).select()
  if (error) throw error
  return data?.length ?? 0
}

export async function insertSkills(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { name: string; category: string }[],
): Promise<number> {
  const rows = items.map((s) => ({ user_id: userId, name: s.name, category: s.category, positioning }))
  const { data, error } = await db.from('skills').upsert(rows, { onConflict: 'user_id,name_norm', ignoreDuplicates: true }).select()
  if (error) throw error
  return data?.length ?? 0
}

export async function insertEducation(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { institution: string; degree: string; completedOn: string | null; inProgress: boolean }[],
): Promise<number> {
  const rows = items.map((e) => ({
    user_id: userId, institution: e.institution, degree: e.degree, completed_on: e.completedOn, in_progress: e.inProgress, positioning,
  }))
  const { data, error } = await db.from('education').upsert(rows, { onConflict: 'user_id,institution_norm,degree_norm', ignoreDuplicates: true }).select()
  if (error) throw error
  return data?.length ?? 0
}

export async function insertCertifications(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { name: string; issuer: string | null; issuedOn: string | null }[],
): Promise<number> {
  const rows = items.map((c) => ({ user_id: userId, name: c.name, issuer: c.issuer, issued_on: c.issuedOn, positioning }))
  const { data, error } = await db.from('certifications').upsert(rows, { onConflict: 'user_id,name_norm,issuer_norm,issued_on_norm', ignoreDuplicates: true }).select()
  if (error) throw error
  return data?.length ?? 0
}
```

Note que a assinatura de retorno mudou de `Promise<void>` pra `Promise<number>` nas 4 funções — isso
vai gerar erro de tipo em quem chama e ainda espera `void`, o que é esperado e será corrigido nas
próximas tasks (Task 3 pro caller de `upload-cv.ts`; `scripts/import-cv.ts` já ignora o retorno hoje,
então não quebra).

- [ ] **Step 2: Rodar `tsc --noEmit` (vai falhar ainda — esperado)**

Run: `npx tsc --noEmit`
Expected: FAIL — erro em `src/app/actions/upload-cv.ts` porque `persistExtractedData` ainda trata o
retorno de `insertAchievements`/etc. como `void`. Isso é esperado nesta task; corrigido na Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/lib/repository.ts
git commit -m "feat(cv-tailor): insert* de dado mestre viram upsert com ignoreDuplicates"
```

---

### Task 3: `upload-cv.ts` — remove dedup em memória

**Files:**
- Modify: `cv-tailor/src/app/actions/upload-cv.ts`

- [ ] **Step 1: Remover as funções de normalização/chave que ficam sem uso**

Remover do topo do arquivo (logo após `detectFileKind`) as 5 funções: `normalize`, `achievementKey`,
`skillKey`, `educationKey`, `certificationKey`. Eram usadas só pelo dedup em memória que está saindo.

- [ ] **Step 2: Substituir `persistExtractedData`**

Substituir a função inteira por:

```ts
async function persistExtractedData(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  extracted: ImportedCv,
): Promise<{ saved: string[]; skippedCount: number; error: string | null }> {
  const saved: string[] = []
  let skippedCount = 0
  try {
    if (extracted.achievements.length) {
      const inserted = await insertAchievements(db, userId, positioning, extracted.achievements)
      if (inserted > 0) saved.push(`${inserted} conquistas`)
      skippedCount += extracted.achievements.length - inserted
    }
    if (extracted.skills.length) {
      const inserted = await insertSkills(db, userId, positioning, extracted.skills)
      if (inserted > 0) saved.push(`${inserted} skills`)
      skippedCount += extracted.skills.length - inserted
    }
    if (extracted.education.length) {
      const inserted = await insertEducation(db, userId, positioning, extracted.education)
      if (inserted > 0) saved.push(`${inserted} formacoes`)
      skippedCount += extracted.education.length - inserted
    }
    if (extracted.certifications.length) {
      const inserted = await insertCertifications(db, userId, positioning, extracted.certifications)
      if (inserted > 0) saved.push(`${inserted} certificacoes`)
      skippedCount += extracted.certifications.length - inserted
    }
    return { saved, skippedCount, error: null }
  } catch (error) {
    console.error('uploadCvAction: falha ao salvar dados extraidos:', error)
    const savedSoFar = saved.length > 0 ? `Ja foi salvo antes do erro: ${saved.join(', ')}.` : 'Nada foi salvo.'
    return { saved, skippedCount: 0, error: `Erro ao salvar parte dos dados extraidos. ${savedSoFar} Pode tentar subir o mesmo CV de novo — os itens ja salvos nao serao duplicados.` }
  }
}
```

O resto do arquivo (`uploadCvAction`, `detectFileKind`, imports) não muda.

- [ ] **Step 3: Rodar `tsc --noEmit` e a suíte de testes**

Run: `npx tsc --noEmit`
Expected: sem erros

Run: `npx vitest run`
Expected: PASS (nenhum teste existente cobre `upload-cv.ts` diretamente — mesma limitação de mock de
Supabase já documentada; confirmar só que nada mais quebrou)

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/upload-cv.ts
git commit -m "refactor(cv-tailor): remove dedup em memoria do upload-cv (garantido pelo banco agora)"
```

---

### Task 4: Aplicar a migration e verificar manualmente contra o Supabase real

**Esta task NÃO é executada por um subagent.** Requer acesso ao Supabase Dashboard do projeto
`rmvzupfcfbdmidkfbhww` e pausa de confirmação explícita do André antes de qualquer `DELETE`/`ALTER
TABLE` — é trabalho da sessão controladora, feito depois que as Tasks 1-3 estiverem implementadas e
revisadas.

- [ ] **Step 1: Contar duplicatas existentes antes de decidir apagar algo**

Rodar no SQL Editor do Supabase (só `SELECT`, nada destrutivo ainda) uma versão em `count(*)` de cada
`DELETE` da migration (trocar `delete from X a using X b where ...` por
`select count(*) from X a join X b on ...` com a mesma condição) pra saber quantas linhas cada tabela
teria removidas. Mostrar esse número ao André antes de aplicar a migration de verdade — se o número
for 0 em todas as tabelas (esperado, já que nunca houve confirmação de duplicata real em produção),
seguir com mais confiança; se for maior que 0, mostrar quais linhas seriam removidas antes de
confirmar.

- [ ] **Step 2: Aplicar `0003_dedup_unique_constraints.sql` no SQL Editor do Supabase**

Só depois da confirmação explícita do André sobre o resultado do Step 1.

- [ ] **Step 3: Testar o caso de dedup simples**

Subir o mesmo CV duas vezes seguidas em `/perfil` (via `npm run dev` local ou direto em produção,
como já foi feito antes nesta sessão pra outras features) — confirmar que a segunda vez reporta
"nenhum dado novo" e que a tabela não ganhou linha duplicada (conferir via SQL Editor).

- [ ] **Step 4: Testar a recertificação**

Subir um CV de teste com uma certificação que já existe no banco, mas com uma data de emissão
diferente — confirmar que agora aparece como um item NOVO na lista de "Certificações" do Perfil
(antes da correção, seria silenciosamente ignorado).

- [ ] **Step 5: Testar o caso de erro esperado (constraint colidindo numa edição manual)**

No Perfil, tentar editar uma conquista existente pra ter o mesmo texto (empresa+cargo+bullet) de
outra já existente — confirmar que a UI mostra "Erro ao salvar. Tente novamente." (mensagem genérica
já existente em `updateProfileItemAction`, sem crash) em vez de duplicar silenciosamente.

---

## Fora de escopo (confirmado na spec)

- Diferenciar visualmente recertificação de certificação nova na UI do Perfil
- Melhorar a mensagem de erro de `updateProfileItemAction` pra mencionar duplicata especificamente
