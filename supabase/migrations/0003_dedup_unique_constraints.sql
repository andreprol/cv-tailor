-- Remove duplicatas ja existentes antes de criar cada indice unico (um indice
-- unico falha na criacao se ja existir duplicata na tabela). Mantem a linha
-- mais antiga por created_at, apaga o resto. Mesmo criterio de normalizacao
-- (trim + lowercase + colapsar espacos) usado pelo app ate hoje.
-- id entra como tie-breaker para garantir ordem total mesmo quando
-- created_at empata (ex: insercao em lote no mesmo statement).

begin;

delete from achievements a using achievements b
where a.user_id = b.user_id
  and lower(trim(regexp_replace(a.company, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.company, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(a.role_title, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.role_title, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(a.bullet, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.bullet, '\s+', ' ', 'g')))
  and (a.created_at, a.id) > (b.created_at, b.id);

delete from skills a using skills b
where a.user_id = b.user_id
  and lower(trim(regexp_replace(a.name, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.name, '\s+', ' ', 'g')))
  and (a.created_at, a.id) > (b.created_at, b.id);

delete from education a using education b
where a.user_id = b.user_id
  and lower(trim(regexp_replace(a.institution, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.institution, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(a.degree, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.degree, '\s+', ' ', 'g')))
  and (a.created_at, a.id) > (b.created_at, b.id);

delete from certifications a using certifications b
where a.user_id = b.user_id
  and lower(trim(regexp_replace(a.name, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(b.name, '\s+', ' ', 'g')))
  and lower(trim(regexp_replace(coalesce(a.issuer, ''), '\s+', ' ', 'g'))) = lower(trim(regexp_replace(coalesce(b.issuer, ''), '\s+', ' ', 'g')))
  and coalesce(a.issued_on::text, '') = coalesce(b.issued_on::text, '')
  and (a.created_at, a.id) > (b.created_at, b.id);

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

commit;
