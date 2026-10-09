-- Global shared film catalog (not per-user).
-- Run in Supabase SQL editor after (or alongside) schema.sql.
-- Writes: service role / seed script only. Clients only SELECT.

create table if not exists public.catalog_films (
  id text primary key,
  tmdb_id integer,
  imdb_id text,
  title text not null,
  year integer,
  director text,
  cover_url text,
  source_video_ids text[] not null default '{}',
  generated_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One row per TMDB match; unmatched stubs (tmdb_id null) are allowed multiple times.
create unique index if not exists catalog_films_tmdb_id_uidx
  on public.catalog_films (tmdb_id)
  where tmdb_id is not null;

create index if not exists catalog_films_title_idx on public.catalog_films (title);

alter table public.catalog_films enable row level security;

-- Public read so every client (signed-in or anon) sees the same library.
drop policy if exists "catalog_films_select_public" on public.catalog_films;
create policy "catalog_films_select_public"
  on public.catalog_films for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policies for anon/authenticated.
-- Seed with SUPABASE_SERVICE_ROLE_KEY (bypasses RLS): npm run upload:catalog
