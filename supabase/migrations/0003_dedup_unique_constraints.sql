-- Remove duplicatas ja existentes antes de criar cada indice unico (um indice
-- unico falha na criacao se ja existir duplicata na tabela). Mantem a linha
-- mais antiga por created_at, apaga o resto. Mesmo criterio de normalizacao
-- (trim + lowercase + colapsar espacos) usado pelo app ate hoje.
-- id entra como tie-breaker para garantir ordem total mesmo quando
-- created_at empata (ex: insercao em lote no mesmo statement).

begin;

-- Postgres marca regexp_replace() como nao-imutavel de fabrica (o
-- comportamento de \s pode depender de locale), entao nao pode ser usado
-- direto dentro de uma coluna GENERATED ALWAYS AS ... STORED (erro real
-- encontrado ao aplicar esta migration: "generation expression is not
-- immutable"). Envelopar numa funcao SQL declarada IMMUTABLE resolve —
-- Postgres confia na declaracao explicita em vez de tentar provar por si so.
create or replace function normalize_text(value text) returns text
  language sql immutable as $$
    select lower(trim(regexp_replace(value, '\s+', ' ', 'g')))
  $$;

delete from achievements a using achievements b
where a.user_id = b.user_id
  and normalize_text(a.company) = normalize_text(b.company)
  and normalize_text(a.role_title) = normalize_text(b.role_title)
  and normalize_text(a.bullet) = normalize_text(b.bullet)
  and (a.created_at, a.id) > (b.created_at, b.id);

delete from skills a using skills b
where a.user_id = b.user_id
  and normalize_text(a.name) = normalize_text(b.name)
  and (a.created_at, a.id) > (b.created_at, b.id);

delete from education a using education b
where a.user_id = b.user_id
  and normalize_text(a.institution) = normalize_text(b.institution)
  and normalize_text(a.degree) = normalize_text(b.degree)
  and (a.created_at, a.id) > (b.created_at, b.id);

delete from certifications a using certifications b
where a.user_id = b.user_id
  and normalize_text(a.name) = normalize_text(b.name)
  and normalize_text(coalesce(a.issuer, '')) = normalize_text(coalesce(b.issuer, ''))
  and coalesce(a.issued_on::text, '') = coalesce(b.issued_on::text, '')
  and (a.created_at, a.id) > (b.created_at, b.id);

-- Colunas geradas normalizadas + indice unico por tabela.

alter table achievements
  add column company_norm text generated always as (normalize_text(company)) stored,
  add column role_title_norm text generated always as (normalize_text(role_title)) stored,
  add column bullet_norm text generated always as (normalize_text(bullet)) stored;

create unique index achievements_dedup_idx on achievements (user_id, company_norm, role_title_norm, bullet_norm);

alter table skills
  add column name_norm text generated always as (normalize_text(name)) stored;

create unique index skills_dedup_idx on skills (user_id, name_norm);

alter table education
  add column institution_norm text generated always as (normalize_text(institution)) stored,
  add column degree_norm text generated always as (normalize_text(degree)) stored;

create unique index education_dedup_idx on education (user_id, institution_norm, degree_norm);

-- issued_on entra na chave: recertificacao com data nova vira linha nova em
-- vez de ser tratada como duplicata da certificacao antiga.
alter table certifications
  add column name_norm text generated always as (normalize_text(name)) stored,
  add column issuer_norm text generated always as (normalize_text(coalesce(issuer, ''))) stored,
  add column issued_on_norm text generated always as (coalesce(issued_on::text, '')) stored;

create unique index certifications_dedup_idx on certifications (user_id, name_norm, issuer_norm, issued_on_norm);

commit;
