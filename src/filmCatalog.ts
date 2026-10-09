import type { Film } from './data/films.types'
import type { Movie } from './types'

export type DecadeFilter = 'all' | '10s' | '00s' | '90s' | '80s' | '70s'

export const DECADE_FILTERS: { id: DecadeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '10s', label: '10s' },
  { id: '00s', label: '00s' },
  { id: '90s', label: '90s' },
  { id: '80s', label: '80s' },
  { id: '70s', label: '70s' },
]

const DECADE_RANGES: Record<Exclude<DecadeFilter, 'all'>, { min: number; max: number }> = {
  '10s': { min: 2010, max: 2019 },
  '00s': { min: 2000, max: 2009 },
  '90s': { min: 1990, max: 1999 },
  '80s': { min: 1980, max: 1989 },
  '70s': { min: 1970, max: 1979 },
}

/** Deterministic negative id from a stable string (for unmatched films). */
export function hashFilmId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (Math.imul(31, hash) + id.charCodeAt(i)) | 0
  }
  const magnitude = Math.abs(hash) || 1
  return -magnitude
}

export function filmToMovie(film: Film): Movie {
  return {
    id: film.tmdbId ?? hashFilmId(film.id),
    title: film.title,
    year: film.year != null ? String(film.year) : '',
    posterUrl: film.coverUrl,
    overview: '',
    imdbId: film.imdbId ?? null,
  }
}

export function filmMetaLine(film: Film): string {
  const parts: string[] = []
  if (film.director) parts.push(film.director)
  if (film.year != null) parts.push(String(film.year))
  return parts.length > 0 ? parts.join(' · ') : 'Details unknown'
}

/** Films with null/unknown year appear only under All. */
export function filterFilmsByDecade(films: Film[], decade: DecadeFilter): Film[] {
  if (decade === 'all') return films
  const { min, max } = DECADE_RANGES[decade]
  return films.filter((film) => film.year != null && film.year >= min && film.year <= max)
}

/** Movies with missing/invalid year appear only under All. */
export function filterMoviesByDecade(movies: Movie[], decade: DecadeFilter): Movie[] {
  if (decade === 'all') return movies
  const { min, max } = DECADE_RANGES[decade]
  return movies.filter((movie) => {
    const year = Number.parseInt(movie.year, 10)
    return Number.isFinite(year) && year >= min && year <= max
  })
}

export type CatalogSort = 'year-desc' | 'year-asc'

export const CATALOG_SORTS: CatalogSort[] = ['year-desc', 'year-asc']

export const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  'year-desc': 'Year newest first',
  'year-asc': 'Year oldest first',
}

export function isCatalogSort(value: string): value is CatalogSort {
  return (CATALOG_SORTS as string[]).includes(value)
}

export function nextCatalogSort(current: CatalogSort): CatalogSort {
  const index = CATALOG_SORTS.indexOf(current)
  return CATALOG_SORTS[(index + 1) % CATALOG_SORTS.length]
}

/** Case-insensitive match on title or director. Empty query returns all. */
export function filterFilmsByQuery(films: Film[], query: string): Film[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return films
  return films.filter((film) => {
    if (film.title.toLowerCase().includes(trimmed)) return true
    return film.director != null && film.director.toLowerCase().includes(trimmed)
  })
}

function compareTitle(a: Film, b: Film): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

/** Unknown years sort last. Title is the tiebreaker within the same year. */
export function sortFilms(films: Film[], sort: CatalogSort): Film[] {
  const sorted = [...films]
  if (sort === 'year-asc') {
    return sorted.sort((a, b) => {
      if (a.year == null && b.year == null) return compareTitle(a, b)
      if (a.year == null) return 1
      if (b.year == null) return -1
      return a.year - b.year || compareTitle(a, b)
    })
  }
  return sorted.sort((a, b) => {
    if (a.year == null && b.year == null) return compareTitle(a, b)
    if (a.year == null) return 1
    if (b.year == null) return -1
    return b.year - a.year || compareTitle(a, b)
  })
}

/**
 * Merge static `films.json` with user-added films.
 * Dedupes by `tmdbId` (static wins). User-only films are prepended.
 */
export function mergeCatalog(staticFilms: Film[], userFilms: Film[]): Film[] {
  const staticTmdbIds = new Set<number>()
  for (const film of staticFilms) {
    if (film.tmdbId != null) staticTmdbIds.add(film.tmdbId)
  }

  const seenUserTmdb = new Set<number>()
  const extras: Film[] = []
  for (const film of userFilms) {
    if (film.tmdbId != null) {
      if (staticTmdbIds.has(film.tmdbId) || seenUserTmdb.has(film.tmdbId)) continue
      seenUserTmdb.add(film.tmdbId)
    }
    extras.push(film)
  }

  return [...extras, ...staticFilms]
}
