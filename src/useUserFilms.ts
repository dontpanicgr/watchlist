import { useCallback, useEffect, useState } from 'react'
import type { Film } from './data/films.types'
import { fetchMovieDirector, fetchMovieImdbId, toCatalogCoverUrl } from './tmdb'
import type { Movie } from './types'

const STORAGE_KEY = 'queue.userFilms'

function isFilm(value: unknown): value is Film {
  if (!value || typeof value !== 'object') return false
  const film = value as Partial<Film>
  return (
    typeof film.id === 'string' &&
    typeof film.title === 'string' &&
    (film.tmdbId === null || typeof film.tmdbId === 'number') &&
    (film.imdbId === null || typeof film.imdbId === 'string' || film.imdbId === undefined) &&
    (film.year === null || typeof film.year === 'number') &&
    (film.director === null || typeof film.director === 'string') &&
    (film.coverUrl === null || typeof film.coverUrl === 'string') &&
    Array.isArray(film.sourceVideoIds)
  )
}

function loadUserFilms(): Film[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isFilm).map((film) => ({
      ...film,
      imdbId: film.imdbId ?? null,
      sourceVideoIds: film.sourceVideoIds.length > 0 ? film.sourceVideoIds : ['user-add'],
    }))
  } catch {
    return []
  }
}

/** Map a TMDB search `Movie` into catalog `Film` shape. */
export function movieToUserFilm(
  movie: Movie,
  extras?: { director?: string | null; imdbId?: string | null },
): Film {
  const parsedYear = movie.year ? Number.parseInt(movie.year, 10) : Number.NaN
  return {
    id: `tmdb-${movie.id}`,
    tmdbId: movie.id,
    imdbId: extras?.imdbId ?? movie.imdbId ?? null,
    title: movie.title,
    year: Number.isFinite(parsedYear) ? parsedYear : null,
    director: extras?.director ?? null,
    coverUrl: toCatalogCoverUrl(movie.posterUrl),
    sourceVideoIds: ['user-add'],
  }
}

export function useUserFilms() {
  const [userFilms, setUserFilms] = useState<Film[]>(() => loadUserFilms())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userFilms))
  }, [userFilms])

  /**
   * Persist a search result into the local library (localStorage).
   * Inserts immediately, then enriches director + IMDb id from TMDB when possible.
   */
  const addToLibrary = useCallback(async (movie: Movie) => {
    if (movie.id <= 0) return

    const base = movieToUserFilm(movie)
    setUserFilms((current) => {
      if (current.some((film) => film.tmdbId === movie.id || film.id === base.id)) {
        return current
      }
      return [base, ...current]
    })

    try {
      const [director, imdbId] = await Promise.all([
        fetchMovieDirector(movie.id).catch(() => null),
        movie.imdbId
          ? Promise.resolve(movie.imdbId)
          : fetchMovieImdbId(movie.id).catch(() => null),
      ])

      if (director == null && imdbId == null) return

      setUserFilms((current) =>
        current.map((film) =>
          film.tmdbId === movie.id
            ? {
                ...film,
                director: director ?? film.director,
                imdbId: imdbId ?? film.imdbId,
              }
            : film,
        ),
      )
    } catch {
      /* keep the optimistic film entry */
    }
  }, [])

  const replaceUserFilms = useCallback((next: Film[]) => {
    setUserFilms(Array.isArray(next) ? next.filter(isFilm) : [])
  }, [])

  return { userFilms, addToLibrary, replaceUserFilms }
}
