import { useCallback, useEffect, useState } from 'react'
import type { Movie, QueuedMovie } from './types'

const STORAGE_KEY = 'queue.movies'

function loadQueue(): QueuedMovie[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueuedMovie[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function useMovieQueue() {
  const [movies, setMovies] = useState<QueuedMovie[]>(() => loadQueue())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movies))
  }, [movies])

  const addMovie = useCallback((movie: Movie) => {
    setMovies((current) => {
      const existing = current.find((item) => item.id === movie.id)
      if (!existing) {
        const next: QueuedMovie = {
          ...movie,
          status: 'to-watch',
          addedAt: new Date().toISOString(),
        }
        return [next, ...current]
      }

      // Already in to-watch — no-op
      if (existing.status === 'to-watch') return current

      // Was watched — re-queue to to-watch, keep watchedAt for history badge
      return current.map((item) =>
        item.id === movie.id
          ? {
              ...item,
              ...movie,
              status: 'to-watch' as const,
              addedAt: new Date().toISOString(),
              watchedAt: item.watchedAt,
            }
          : item,
      )
    })
  }, [])

  const markWatched = useCallback((id: number) => {
    setMovies((current) =>
      current.map((movie) =>
        movie.id === id
          ? { ...movie, status: 'watched', watchedAt: new Date().toISOString() }
          : movie,
      ),
    )
  }, [])

  /**
   * Catalog checkmark toggle:
   * - Not watched → upsert as watched (or move to-watch → watched)
   * - Already watched → remove from queue (clears watched status entirely)
   */
  const toggleWatchedFromCatalog = useCallback((movie: Movie) => {
    setMovies((current) => {
      const existing = current.find((item) => item.id === movie.id)

      if (existing?.status === 'watched') {
        return current.filter((item) => item.id !== movie.id)
      }

      const watchedAt = new Date().toISOString()

      if (!existing) {
        const next: QueuedMovie = {
          ...movie,
          status: 'watched',
          addedAt: watchedAt,
          watchedAt,
        }
        return [next, ...current]
      }

      return current.map((item) =>
        item.id === movie.id
          ? { ...item, ...movie, status: 'watched' as const, watchedAt }
          : item,
      )
    })
  }, [])

  const removeMovie = useCallback((id: number) => {
    setMovies((current) => current.filter((movie) => movie.id !== id))
  }, [])

  /** Reorder to-watch items by id; watched rows keep their slots in the array. */
  const reorderToWatch = useCallback((fromId: number, toId: number) => {
    if (fromId === toId) return
    setMovies((current) => {
      const slots: number[] = []
      const items: QueuedMovie[] = []
      current.forEach((movie, index) => {
        if (movie.status === 'to-watch') {
          slots.push(index)
          items.push(movie)
        }
      })

      const fromIndex = items.findIndex((movie) => movie.id === fromId)
      const toIndex = items.findIndex((movie) => movie.id === toId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current

      const nextItems = [...items]
      const [moved] = nextItems.splice(fromIndex, 1)
      nextItems.splice(toIndex, 0, moved)

      const next = [...current]
      slots.forEach((slot, i) => {
        next[slot] = nextItems[i]!
      })
      return next
    })
  }, [])

  const replaceQueue = useCallback((next: QueuedMovie[]) => {
    setMovies(Array.isArray(next) ? next : [])
  }, [])

  const isInToWatch = useCallback(
    (id: number) => movies.some((movie) => movie.id === id && movie.status === 'to-watch'),
    [movies],
  )

  const isWatched = useCallback(
    (id: number) => movies.some((movie) => movie.id === id && movie.status === 'watched'),
    [movies],
  )

  const hasBeenWatched = useCallback(
    (id: number) =>
      movies.some(
        (movie) => movie.id === id && (movie.status === 'watched' || Boolean(movie.watchedAt)),
      ),
    [movies],
  )

  const toWatch = movies.filter((movie) => movie.status === 'to-watch')
  const watched = movies.filter((movie) => movie.status === 'watched')

  return {
    movies,
    toWatch,
    watched,
    addMovie,
    markWatched,
    toggleWatchedFromCatalog,
    removeMovie,
    reorderToWatch,
    replaceQueue,
    isInToWatch,
    isWatched,
    hasBeenWatched,
  }
}
