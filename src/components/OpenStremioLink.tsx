import { useEffect, useState, type MouseEvent, type PointerEvent } from 'react'
import { fetchMovieImdbId, hasApiKey } from '../tmdb'
import { getStremioMovieUrl } from '../stremio'

function stopRowOpen(event: MouseEvent | PointerEvent) {
  event.stopPropagation()
}

export function OpenStremioLink({
  imdbId,
  tmdbId,
}: {
  imdbId?: string | null
  tmdbId?: number | null
}) {
  const knownUrl = getStremioMovieUrl({ imdbId })
  const [href, setHref] = useState<string | null>(knownUrl)
  const [status, setStatus] = useState<'idle' | 'loading' | 'unavailable'>('idle')

  useEffect(() => {
    setHref(getStremioMovieUrl({ imdbId }))
    setStatus('idle')
  }, [imdbId, tmdbId])

  if (href) {
    return (
      <a
        className="stremio-link"
        href={href}
        rel="noopener noreferrer"
        onClick={stopRowOpen}
        onPointerDown={stopRowOpen}
      >
        Open Stremio
      </a>
    )
  }

  if (status === 'unavailable') {
    return (
      <span className="stremio-link is-disabled" title="IMDb id unavailable for this film">
        Open Stremio
      </span>
    )
  }

  const canFetch = tmdbId != null && tmdbId > 0 && hasApiKey()
  if (!canFetch) return null

  async function openViaTmdb() {
    if (tmdbId == null || tmdbId <= 0 || status === 'loading') return
    setStatus('loading')
    try {
      const resolved = await fetchMovieImdbId(tmdbId)
      const url = getStremioMovieUrl({ imdbId: resolved })
      if (!url) {
        setStatus('unavailable')
        return
      }
      setHref(url)
      setStatus('idle')
      window.location.href = url
    } catch {
      setStatus('unavailable')
    }
  }

  return (
    <button
      type="button"
      className="stremio-link"
      onClick={(event) => {
        stopRowOpen(event)
        void openViaTmdb()
      }}
      onPointerDown={stopRowOpen}
      disabled={status === 'loading'}
      title="Look up IMDb id and open in Stremio"
    >
      {status === 'loading' ? 'Opening…' : 'Open Stremio'}
    </button>
  )
}
