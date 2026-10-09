-- Queue app personal data (run in Supabase SQL editor)
-- Conflict policy (client): on login, remote replaces local; then local changes upsert/delete to remote.

-- Queue: to-watch / watched status + movie metadata
create table if not exists public.queue_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id integer not null,
  status text not null check (status in ('to-watch', 'watched')),
  title text not null,
  year text not null default '',
  poster_url text,
  overview text not null default '',
  imdb_id text,
  added_at timestamptz not null,
  watched_at timestamptz,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_id)
);

create index if not exists queue_items_user_id_idx on public.queue_items (user_id);

-- Existing projects: add sort_order if missing (safe to re-run)
alter table public.queue_items
  add column if not exists sort_order integer not null default 0;

-- User-added films (search results persisted into the local library)
create table if not exists public.user_films (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  film_id text not null,
  tmdb_id integer,
  imdb_id text,
  title text not null,
  year integer,
  director text,
  cover_url text,
  source_video_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, film_id)
);

create index if not exists user_films_user_id_idx on public.user_films (user_id);

-- Per-film notes
create table if not exists public.film_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  film_id text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, film_id)
);

create index if not exists film_notes_user_id_idx on public.film_notes (user_id);

-- Optional UI prefs (one row per user)
create table if not exists public.ui_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  catalog_sort text,
  catalog_visible boolean,
  catalog_width integer,
  details_width integer,
  updated_at timestamptz not null default now()
);

alter table public.queue_items enable row level security;
alter table public.user_films enable row level security;
alter table public.film_notes enable row level security;
alter table public.ui_prefs enable row level security;

-- RLS: users only read/write their own rows
drop policy if exists "queue_items_select_own" on public.queue_items;
drop policy if exists "queue_items_insert_own" on public.queue_items;
drop policy if exists "queue_items_update_own" on public.queue_items;
drop policy if exists "queue_items_delete_own" on public.queue_items;
drop policy if exists "user_films_select_own" on public.user_films;
drop policy if exists "user_films_insert_own" on public.user_films;
drop policy if exists "user_films_update_own" on public.user_films;
drop policy if exists "user_films_delete_own" on public.user_films;
drop policy if exists "film_notes_select_own" on public.film_notes;
drop policy if exists "film_notes_insert_own" on public.film_notes;
drop policy if exists "film_notes_update_own" on public.film_notes;
drop policy if exists "film_notes_delete_own" on public.film_notes;
drop policy if exists "ui_prefs_select_own" on public.ui_prefs;
drop policy if exists "ui_prefs_insert_own" on public.ui_prefs;
drop policy if exists "ui_prefs_update_own" on public.ui_prefs;
drop policy if exists "ui_prefs_delete_own" on public.ui_prefs;

create policy "queue_items_select_own"
  on public.queue_items for select
  using (auth.uid() = user_id);

create policy "queue_items_insert_own"
  on public.queue_items for insert
  with check (auth.uid() = user_id);

create policy "queue_items_update_own"
  on public.queue_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "queue_items_delete_own"
  on public.queue_items for delete
  using (auth.uid() = user_id);

create policy "user_films_select_own"
  on public.user_films for select
  using (auth.uid() = user_id);

create policy "user_films_insert_own"
  on public.user_films for insert
  with check (auth.uid() = user_id);

create policy "user_films_update_own"
  on public.user_films for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_films_delete_own"
  on public.user_films for delete
  using (auth.uid() = user_id);

create policy "film_notes_select_own"
  on public.film_notes for select
  using (auth.uid() = user_id);

create policy "film_notes_insert_own"
  on public.film_notes for insert
  with check (auth.uid() = user_id);

create policy "film_notes_update_own"
  on public.film_notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "film_notes_delete_own"
  on public.film_notes for delete
  using (auth.uid() = user_id);

create policy "ui_prefs_select_own"
  on public.ui_prefs for select
  using (auth.uid() = user_id);

create policy "ui_prefs_insert_own"
  on public.ui_prefs for insert
  with check (auth.uid() = user_id);

create policy "ui_prefs_update_own"
  on public.ui_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "ui_prefs_delete_own"
  on public.ui_prefs for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Global shared catalog (same as supabase/catalog_films.sql — safe to re-run)
-- ---------------------------------------------------------------------------
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

create unique index if not exists catalog_films_tmdb_id_uidx
  on public.catalog_films (tmdb_id)
  where tmdb_id is not null;

create index if not exists catalog_films_title_idx on public.catalog_films (title);

alter table public.catalog_films enable row level security;

drop policy if exists "catalog_films_select_public" on public.catalog_films;
create policy "catalog_films_select_public"
  on public.catalog_films for select
  to anon, authenticated
  using (true);
