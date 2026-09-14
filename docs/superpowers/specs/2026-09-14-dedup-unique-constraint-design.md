# Dedup de upload: UNIQUE constraint no banco + fix de recertificação

## Contexto

Débito técnico aceito conscientemente na Fase 2 (`docs/superpowers/plans/2026-09-12-cv-tailor-fase2-auth-perfil.md`):
1. **Race condition**: `persistExtractedData` (`src/app/actions/upload-cv.ts`) faz "ler tudo → filtrar
   em memória → inserir" — sem coordenação atômica, duas requisições concorrentes (duas abas, duplo
   clique) podem ler o mesmo estado "sem duplicata" antes de qualquer uma commitar, e ambas inserirem
   a mesma linha.
2. **Recertificação vira duplicata**: a chave de dedup de certificação é `nome|emissor` — não inclui
   a data de emissão. Subir a mesma certificação renovada com uma **data nova** é tratado como
   duplicata do registro antigo e descartado, perdendo a informação da recertificação.

## Decisão: mover o dedup pra dentro do banco (UNIQUE constraint real + `upsert`)

Os dois problemas têm a mesma causa raiz: a garantia de "não duplicar" vive só na aplicação, não no
banco. A correção estrutural é enforçar unicidade no Postgres e deixar o Postgres decidir
atomicamente — isso fecha a race de vez (impossível dois processos concorrentes burlarem uma
constraint do banco, ao contrário de uma checagem em memória) e, ajustando a chave de unicidade da
certificação pra incluir a data, resolve o caso de recertificação junto.

### Migration nova: `supabase/migrations/0003_dedup_unique_constraints.sql`

Para cada uma das 4 tabelas de dado mestre, adiciona colunas geradas (`generated always as (...)
stored` — o Postgres calcula e mantém sozinho, nunca fica desatualizado mesmo se algum código
esquecer de popular) com o mesmo critério de normalização já usado em `upload-cv.ts`
(`trim` + `lowercase` + colapsar espaços internos), e cria um índice único sobre essas colunas
normalizadas + `user_id`:

```sql
-- achievements
alter table achievements
  add column company_norm text generated always as (lower(trim(regexp_replace(company, '\s+', ' ', 'g')))) stored,
  add column role_title_norm text generated always as (lower(trim(regexp_replace(role_title, '\s+', ' ', 'g')))) stored,
  add column bullet_norm text generated always as (lower(trim(regexp_replace(bullet, '\s+', ' ', 'g')))) stored;

create unique index achievements_dedup_idx on achievements (user_id, company_norm, role_title_norm, bullet_norm);

-- skills
alter table skills
  add column name_norm text generated always as (lower(trim(regexp_replace(name, '\s+', ' ', 'g')))) stored;

create unique index skills_dedup_idx on skills (user_id, name_norm);

-- education
alter table education
  add column institution_norm text generated always as (lower(trim(regexp_replace(institution, '\s+', ' ', 'g')))) stored,
  add column degree_norm text generated always as (lower(trim(regexp_replace(degree, '\s+', ' ', 'g')))) stored;

create unique index education_dedup_idx on education (user_id, institution_norm, degree_norm);

-- certifications — issued_on entra na chave (fix da recertificação), null normalizado pra '' pra
-- continuar deduplicando "mesma certificação sem data" como antes.
alter table certifications
  add column name_norm text generated always as (lower(trim(regexp_replace(name, '\s+', ' ', 'g')))) stored,
  add column issuer_norm text generated always as (lower(trim(regexp_replace(coalesce(issuer, ''), '\s+', ' ', 'g')))) stored,
  add column issued_on_norm text generated always as (coalesce(issued_on::text, '')) stored;

create unique index certifications_dedup_idx on certifications (user_id, name_norm, issuer_norm, issued_on_norm);
```

### ⚠️ Passo obrigatório antes de cada `create unique index`: limpar duplicatas já existentes

Criar um índice único **falha** se já existir alguma duplicata na tabela — e como o dedup até hoje
era só em memória (nunca 100% atômico), pode existir duplicata real já gravada em produção. A
migration precisa apagar duplicatas existentes (mantendo a linha mais antiga por `created_at`) antes
de cada `create unique index`, usando o mesmo critério de normalização:

```sql
delete from achievements a using achievements b
where a.user_id = b.user_id
  and lower(trim(regexp_replace(a.company, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.company, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(a.role_title, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.role_title, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(a.bullet, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.bullet, '\s+', ' ', 'g')))
  and a.created_at > b.created_at;
```

(mesma lógica pras outras 3 tabelas, comparando as colunas relevantes de cada uma). Isso é uma
operação destrutiva (`DELETE`) rodando contra o banco de produção real — mesmo sendo "só" remoção de
duplicata genuína, entra na categoria de migration/ALTER TABLE do protocolo do André: **rodar com
pausa de confirmação explícita antes de executar no Supabase de produção**, mostrando antes quantas
linhas cada `DELETE` afetaria (rodar como `SELECT count(*)` da mesma condição primeiro, sem
`DELETE`, e mostrar o número pra ele antes de aplicar de verdade).

### Repository: `insert*` viram `upsert` com `ignoreDuplicates`

Em `src/lib/repository.ts`, as 4 funções (`insertAchievements`, `insertSkills`, `insertEducation`,
`insertCertifications`) trocam `.insert(rows)` por
`.upsert(rows, { onConflict: '<colunas do índice>', ignoreDuplicates: true }).select()`, e passam a
**retornar quantas linhas foram realmente inseridas** (`Promise<number>` em vez de `Promise<void>`)
— o Postgres/PostgREST só devolve as linhas que entraram de verdade quando usa
`ON CONFLICT DO NOTHING`, então `data?.length ?? 0` já é a contagem certa de "quantas eram
realmente novas".

Exemplo (`insertAchievements`):

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
```

Mesma forma para `insertSkills` (`onConflict: 'user_id,name_norm'`), `insertEducation`
(`onConflict: 'user_id,institution_norm,degree_norm'`) e `insertCertifications`
(`onConflict: 'user_id,name_norm,issuer_norm,issued_on_norm'`).

Não é preciso (nem possível) enviar valores pras colunas `*_norm` no `upsert` — são geradas pelo
próprio Postgres a partir das colunas reais, o PostgREST só precisa do nome delas em `onConflict`
pra saber contra qual índice comparar.

### `upload-cv.ts`: simplifica removendo o dedup em memória

Com o banco garantindo a unicidade, `persistExtractedData` não precisa mais buscar
`getMasterDataBank` nem calcular `existingAchievementKeys`/etc. — só chama `insertX` pra cada
categoria não-vazia e usa o número retornado (linhas realmente inseridas) pra calcular quantas foram
puladas por já existir:

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

As funções `normalize`, `achievementKey`, `skillKey`, `educationKey`, `certificationKey` no topo de
`upload-cv.ts` ficam sem uso depois dessa mudança — são removidas (código morto, a normalização
agora vive só no Postgres).

O comentário existente sobre "cada arquivo do batch commita antes do próximo começar" também sai —
deixa de ser relevante porque a garantia agora não depende mais de ordem/timing entre chamadas, é
atômica em qualquer cenário (sequencial ou concorrente).

### `scripts/import-cv.ts` — ganha a proteção de graça

O script de importação inicial chama `insertAchievements`/etc. diretamente, sem passar por
`persistExtractedData`. Como a assinatura muda de `Promise<void>` pra `Promise<number>`, o script
continua funcionando sem alteração (só ignora o valor de retorno, igual já faz hoje) — e ganha a
mesma proteção contra duplicata que o upload da Fase 2 tem, de graça.

## Fora de escopo

- Mudar a UI pra mostrar de forma diferente uma recertificação vs. uma certificação nova no Perfil —
  hoje as duas aparecem como itens separados na lista (comportamento correto pro fix, só não muda a
  apresentação visual).
- Tornar a mensagem de erro de `updateProfileItemAction` mais específica quando uma edição manual no
  Perfil colidir com a nova constraint (ex: editar o nome de uma conquista pra ficar igual a outra
  já existente) — vai continuar caindo na mensagem genérica "Erro ao salvar. Tente novamente.", o que
  é uma melhoria de UX possível mas não pedida agora; o importante é que a edição para de criar uma
  duplicata silenciosa (hoje seria permitida, depois da migration passa a ser rejeitada pelo banco).

## Testes

Sem infraestrutura de mock de Supabase no projeto (mesma limitação já documentada em specs
anteriores) — `insertX`/`persistExtractedData` não ganham teste automatizado novo. Verificação é
manual, contra o Supabase real:

1. Rodar a migration (com a checagem/confirmação de duplicatas antes, como descrito acima).
2. Subir o mesmo CV duas vezes seguidas no Perfil — confirmar que a segunda vez reporta "nenhum dado
   novo" (como já reporta hoje) e que não duplicou nada no banco.
3. Simular a race condition de propósito: abrir duas abas logadas, colar o mesmo CV nas duas, e
   submeter as duas o mais próximo possível uma da outra (dá pra automatizar clicando rápido, não
   precisa ser exatamente simultâneo — o objetivo é confirmar que mesmo num timing apertado o banco
   não deixa passar duplicata, o que a versão antiga podia deixar passar em teoria).
4. Testar a recertificação: subir uma certificação já existente no banco, mas com um CV de teste que
   tenha uma data de emissão diferente pra ela — confirmar que agora vira uma linha nova (visível
   como um item a mais na lista de "Certificações" do Perfil), em vez de ser silenciosamente
   ignorada.
