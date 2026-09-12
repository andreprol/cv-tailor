create extension if not exists pgcrypto;

create table profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  full_name text not null,
  email text not null,
  phone text,
  location text,
  linkedin_url text,
  github_url text,
  created_at timestamptz not null default now()
);

create table achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company text not null,
  role_title text not null,
  start_date date not null,
  end_date date,
  bullet text not null,
  metric text,
  positioning text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  institution text not null,
  degree text not null,
  completed_on date,
  in_progress boolean not null default false,
  positioning text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  issuer text,
  issued_on date,
  positioning text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  category text not null,
  positioning text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company text not null,
  role_title text not null,
  source_url text,
  job_description_raw text not null,
  status text not null default 'sem_resposta' check (status in ('sem_resposta','rejeitado','entrevista','oferta')),
  applied_at date not null default current_date,
  created_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('portuguese', coalesce(company,'') || ' ' || coalesce(role_title,'') || ' ' || coalesce(job_description_raw,''))
  ) stored
);

create index applications_search_idx on applications using gin (search_vector);
create index applications_user_idx on applications (user_id);

create table cv_versions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  storage_path text not null,
  generated_json jsonb not null,
  created_at timestamptz not null default now()
);

create table interview_questions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  question text not null,
  rationale text not null,
  created_at timestamptz not null default now()
);
