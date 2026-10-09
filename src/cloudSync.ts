import type { Film } from './data/films.types'
import { supabase } from './supabaseClient'
import type { QueuedMovie } from './types'
import type { FilmNotesMap } from './useFilmNotes'

type CatalogFilmRow = {
  id: string
  tmdb_id: number | null
  imdb_id: string | null
  title: string
  year: number | null
  director: string | null
  cover_url: string | null
  source_video_ids: string[] | null
}

function rowToCatalogFilm(row: CatalogFilmRow): Film {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    imdbId: row.imdb_id,
    title: row.title,
    year: row.year,
    director: row.director,
    coverUrl: row.cover_url,
    sourceVideoIds: row.source_video_ids ?? [],
  }
}

/**
 * Fetch the shared global catalog from Supabase.
 * Returns null when Supabase is not configured, the table is empty, or the request fails.
 * Does not upload — seed with `npm run upload:catalog`.
 */
export async function fetchCatalogFilms(): Promise<Film[] | null> {
  if (!supabase) return null

  const pageSize = 1000
  const films: Film[] = []
  let from = 0

  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('catalog_films')
      .select('id,tmdb_id,imdb_id,title,year,director,cover_url,source_video_ids')
      .order('id')
      .range(from, to)

    if (error) {
      console.warn('[catalog] Failed to fetch catalog_films:', error.message)
      return null
    }

    const rows = (data ?? []) as CatalogFilmRow[]
    for (const row of rows) films.push(rowToCatalogFilm(row))

    if (rows.length < pageSize) break
    from += pageSize
  }

  return films.length > 0 ? films : null
}

export type UiPrefs = {
  catalogSort?: string
  catalogVisible?: boolean
  catalogWidth?: number
  detailsWidth?: number
}

export type RemoteSnapshot = {
  queue: QueuedMovie[]
  userFilms: Film[]
  notes: FilmNotesMap
  prefs: UiPrefs | null
}

type QueueRow = {
  tmdb_id: number
  status: 'to-watch' | 'watched'
  title: string
  year: string
  poster_url: string | null
  overview: string
  imdb_id: string | null
  added_at: string
  watched_at: string | null
  sort_order: number | null
}

type UserFilmRow = {
  film_id: string
  tmdb_id: number | null
  imdb_id: string | null
  title: string
  year: number | null
  director: string | null
  cover_url: string | null
  source_video_ids: string[] | null
}

type NoteRow = {
  film_id: string
  body: string
}

type PrefsRow = {
  catalog_sort: string | null
  catalog_visible: boolean | null
  catalog_width: number | null
  details_width: number | null
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function queueToRow(userId: string, movie: QueuedMovie, sortOrder: number) {
  return {
    user_id: userId,
    tmdb_id: movie.id,
    status: movie.status,
    title: movie.title,
    year: movie.year ?? '',
    poster_url: movie.posterUrl,
    overview: movie.overview ?? '',
    imdb_id: movie.imdbId ?? null,
    added_at: movie.addedAt,
    watched_at: movie.watchedAt ?? null,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  }
}

function rowToQueuedMovie(row: QueueRow): QueuedMovie {
  return {
    id: row.tmdb_id,
    title: row.title,
    year: row.year ?? '',
    posterUrl: row.poster_url,
    overview: row.overview ?? '',
    imdbId: row.imdb_id,
    status: row.status,
    addedAt: row.added_at,
    ...(row.watched_at ? { watchedAt: row.watched_at } : {}),
  }
}

function userFilmToRow(userId: string, film: Film) {
  return {
    user_id: userId,
    film_id: film.id,
    tmdb_id: film.tmdbId,
    imdb_id: film.imdbId,
    title: film.title,
    year: film.year,
    director: film.director,
    cover_url: film.coverUrl,
    source_video_ids: film.sourceVideoIds.length > 0 ? film.sourceVideoIds : ['user-add'],
    updated_at: new Date().toISOString(),
  }
}

function rowToUserFilm(row: UserFilmRow): Film {
  return {
    id: row.film_id,
    tmdbId: row.tmdb_id,
    imdbId: row.imdb_id,
    title: row.title,
    year: row.year,
    director: row.director,
    coverUrl: row.cover_url,
    sourceVideoIds:
      row.source_video_ids && row.source_video_ids.length > 0
        ? row.source_video_ids
        : ['user-add'],
  }
}

function prefsToRow(userId: string, prefs: UiPrefs) {
  return {
    user_id: userId,
    catalog_sort: prefs.catalogSort ?? null,
    catalog_visible: prefs.catalogVisible ?? null,
    catalog_width: prefs.catalogWidth ?? null,
    details_width: prefs.detailsWidth ?? null,
    updated_at: new Date().toISOString(),
  }
}

function rowToPrefs(row: PrefsRow): UiPrefs {
  const prefs: UiPrefs = {}
  if (typeof row.catalog_sort === 'string') prefs.catalogSort = row.catalog_sort
  if (typeof row.catalog_visible === 'boolean') prefs.catalogVisible = row.catalog_visible
  if (typeof row.catalog_width === 'number' && Number.isFinite(row.catalog_width)) {
    prefs.catalogWidth = row.catalog_width
  }
  if (typeof row.details_width === 'number' && Number.isFinite(row.details_width)) {
    prefs.detailsWidth = row.details_width
  }
  return prefs
}

/** Fetch all personal data for the signed-in user (remote replaces local on login). */
export async function pullRemoteSnapshot(userId: string): Promise<RemoteSnapshot> {
  const client = requireClient()

  const [queueRes, filmsRes, notesRes, prefsRes] = await Promise.all([
    client.from('queue_items').select('*').eq('user_id', userId).order('sort_order', {
      ascending: true,
    }),
    client.from('user_films').select('*').eq('user_id', userId),
    client.from('film_notes').select('*').eq('user_id', userId),
    client.from('ui_prefs').select('*').eq('user_id', userId).maybeSingle(),
  ])

  if (queueRes.error) throw queueRes.error
  if (filmsRes.error) throw filmsRes.error
  if (notesRes.error) throw notesRes.error
  if (prefsRes.error) throw prefsRes.error

  const notes: FilmNotesMap = {}
  for (const row of (notesRes.data ?? []) as NoteRow[]) {
    if (typeof row.body === 'string' && row.body.trim()) notes[row.film_id] = row.body
  }

  const queueRows = ((queueRes.data ?? []) as QueueRow[]).slice().sort((a, b) => {
    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return a.added_at.localeCompare(b.added_at)
  })

  return {
    queue: queueRows.map(rowToQueuedMovie),
    userFilms: ((filmsRes.data ?? []) as UserFilmRow[]).map(rowToUserFilm),
    notes,
    prefs: prefsRes.data ? rowToPrefs(prefsRes.data as PrefsRow) : null,
  }
}

/** Replace remote queue with the local list (upsert + delete orphans). */
export async function pushQueue(userId: string, movies: QueuedMovie[]): Promise<void> {
  const client = requireClient()
  const rows = movies.map((movie, index) => queueToRow(userId, movie, index))
  const keep = new Set(movies.map((m) => m.id))

  if (rows.length > 0) {
    const { error } = await client.from('queue_items').upsert(rows, {
      onConflict: 'user_id,tmdb_id',
    })
    if (error) throw error
  }

  const { data: existing, error: selectError } = await client
    .from('queue_items')
    .select('tmdb_id')
    .eq('user_id', userId)
  if (selectError) throw selectError

  const toDelete = (existing ?? [])
    .map((row) => (row as { tmdb_id: number }).tmdb_id)
    .filter((id) => !keep.has(id))

  if (toDelete.length > 0) {
    const { error } = await client
      .from('queue_items')
      .delete()
      .eq('user_id', userId)
      .in('tmdb_id', toDelete)
    if (error) throw error
  }
}

/** Replace remote user films with the local list. */
export async function pushUserFilms(userId: string, films: Film[]): Promise<void> {
  const client = requireClient()
  const rows = films.map((film) => userFilmToRow(userId, film))
  const keep = new Set(films.map((f) => f.id))

  if (rows.length > 0) {
    const { error } = await client.from('user_films').upsert(rows, {
      onConflict: 'user_id,film_id',
    })
    if (error) throw error
  }

  const { data: existing, error: selectError } = await client
    .from('user_films')
    .select('film_id')
    .eq('user_id', userId)
  if (selectError) throw selectError

  const toDelete = (existing ?? [])
    .map((row) => (row as { film_id: string }).film_id)
    .filter((id) => !keep.has(id))

  if (toDelete.length > 0) {
    const { error } = await client
      .from('user_films')
      .delete()
      .eq('user_id', userId)
      .in('film_id', toDelete)
    if (error) throw error
  }
}

/**
 * Sync notes: upsert non-empty, delete cleared.
 * Call with the full map after local edits (debounced).
 */
export async function pushNotes(userId: string, notes: FilmNotesMap): Promise<void> {
  const client = requireClient()
  const now = new Date().toISOString()
  const rows = Object.entries(notes)
    .filter(([, text]) => text.trim())
    .map(([film_id, body]) => ({
      user_id: userId,
      film_id,
      body,
      updated_at: now,
    }))
  const keep = new Set(rows.map((r) => r.film_id))

  if (rows.length > 0) {
    const { error } = await client.from('film_notes').upsert(rows, {
      onConflict: 'user_id,film_id',
    })
    if (error) throw error
  }

  const { data: existing, error: selectError } = await client
    .from('film_notes')
    .select('film_id')
    .eq('user_id', userId)
  if (selectError) throw selectError

  const toDelete = (existing ?? [])
    .map((row) => (row as { film_id: string }).film_id)
    .filter((id) => !keep.has(id))

  if (toDelete.length > 0) {
    const { error } = await client
      .from('film_notes')
      .delete()
      .eq('user_id', userId)
      .in('film_id', toDelete)
    if (error) throw error
  }
}

export async function pushUiPrefs(userId: string, prefs: UiPrefs): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('ui_prefs').upsert(prefsToRow(userId, prefs), {
    onConflict: 'user_id',
  })
  if (error) throw error
}
