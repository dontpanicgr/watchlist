import { type MouseEvent, type PointerEvent } from 'react'

function stopRowOpen(event: MouseEvent | PointerEvent) {
  event.stopPropagation()
}

export function getTmdbMovieUrl(tmdbId: number): string {
  return `https://www.themoviedb.org/movie/${tmdbId}`
}

export function OpenTmdbLink({ tmdbId }: { tmdbId?: number | null }) {
  if (tmdbId == null || tmdbId <= 0) return null

  return (
    <a
      className="stremio-link"
      href={getTmdbMovieUrl(tmdbId)}
      target="_blank"
      rel="noreferrer"
      onClick={stopRowOpen}
      onPointerDown={stopRowOpen}
    >
      Open TMDB
    </a>
  )
}
