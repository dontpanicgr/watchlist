import {
  useRef,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { OpenStremioLink } from './OpenStremioLink'
import { OpenTmdbLink } from './OpenTmdbLink'

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function stopRowOpen(event: MouseEvent | PointerEvent) {
  event.stopPropagation()
}

function Poster({
  title,
  posterUrl,
  watched = false,
  reorderable = false,
  onDragStart,
  onDragEnd,
}: {
  title: string
  posterUrl: string | null
  watched?: boolean
  reorderable?: boolean
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd?: (event: DragEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      className={reorderable ? 'poster poster-reorder-source' : 'poster'}
      aria-hidden="true"
      draggable={reorderable || undefined}
      onDragStart={reorderable ? onDragStart : undefined}
      onDragEnd={reorderable ? onDragEnd : undefined}
    >
      {posterUrl ? (
        <img src={posterUrl} alt="" loading="lazy" draggable={false} />
      ) : (
        <div className="poster-fallback">{title.slice(0, 1)}</div>
      )}
      {watched ? (
        <span className="poster-watched" title="Watched">
          <CheckIcon size={12} />
        </span>
      ) : null}
    </div>
  )
}

function metaLine(year?: string | null, director?: string | null): string {
  const parts: string[] = []
  if (director) parts.push(director)
  if (year) parts.push(year)
  return parts.length > 0 ? parts.join(' · ') : 'Year unknown'
}

export type MovieTileProps = {
  title: string
  posterUrl: string | null
  year?: string | null
  director?: string | null
  watched?: boolean
  selected?: boolean
  justAdded?: boolean
  imdbId?: string | null
  tmdbId?: number | null
  showStremio?: boolean
  actions?: ReactNode
  onSelect?: () => void
  /** Accessible name when the tile opens details. */
  selectLabel?: string
  /** Poster-only HTML5 drag source for reorder (no handle chrome). */
  reorderable?: boolean
  dragging?: boolean
  dropTarget?: boolean
  onReorderDragStart?: (event: DragEvent<HTMLDivElement>) => void
  onReorderDragOver?: (event: DragEvent<HTMLLIElement>) => void
  onReorderDragLeave?: (event: DragEvent<HTMLLIElement>) => void
  onReorderDrop?: (event: DragEvent<HTMLLIElement>) => void
  onReorderDragEnd?: (event: DragEvent<HTMLDivElement>) => void
}

export function MovieTile({
  title,
  posterUrl,
  year,
  director,
  watched = false,
  selected = false,
  justAdded = false,
  imdbId,
  tmdbId,
  showStremio = true,
  actions,
  onSelect,
  selectLabel,
  reorderable = false,
  dragging = false,
  dropTarget = false,
  onReorderDragStart,
  onReorderDragOver,
  onReorderDragLeave,
  onReorderDrop,
  onReorderDragEnd,
}: MovieTileProps) {
  const interactive = typeof onSelect === 'function'
  const suppressClick = useRef(false)

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (!onSelect) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }

  function handleClick(event: MouseEvent<HTMLLIElement>) {
    if (suppressClick.current) {
      event.preventDefault()
      event.stopPropagation()
      suppressClick.current = false
      return
    }
    onSelect?.()
  }

  function handlePosterDragStart(event: DragEvent<HTMLDivElement>) {
    suppressClick.current = false
    onReorderDragStart?.(event)
  }

  function handlePosterDragEnd(event: DragEvent<HTMLDivElement>) {
    suppressClick.current = true
    onReorderDragEnd?.(event)
  }

  const className = [
    'movie-row',
    interactive ? 'movie-row-interactive' : null,
    reorderable ? 'movie-row-reorderable' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li
      className={className}
      data-just-added={justAdded || undefined}
      data-active={selected || undefined}
      data-dragging={dragging || undefined}
      data-drop-target={dropTarget || undefined}
      data-film-open-trigger={interactive || undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-expanded={interactive ? selected : undefined}
      aria-label={interactive ? (selectLabel ?? `Details for ${title}`) : undefined}
      onClick={interactive ? handleClick : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      onDragOver={reorderable ? onReorderDragOver : undefined}
      onDragLeave={reorderable ? onReorderDragLeave : undefined}
      onDrop={reorderable ? onReorderDrop : undefined}
    >
      <Poster
        title={title}
        posterUrl={posterUrl}
        watched={watched}
        reorderable={reorderable}
        onDragStart={handlePosterDragStart}
        onDragEnd={handlePosterDragEnd}
      />
      <div className="movie-copy">
        <p className="movie-title">{title}</p>
        <p className="movie-meta">{metaLine(year, director)}</p>
        {showStremio ? (
          <div className="external-links">
            <OpenStremioLink imdbId={imdbId} tmdbId={tmdbId} />
            <OpenTmdbLink tmdbId={tmdbId} />
          </div>
        ) : null}
      </div>
      {actions != null ? (
        <div className="actions" onClick={stopRowOpen} onPointerDown={stopRowOpen}>
          {actions}
        </div>
      ) : null}
    </li>
  )
}

export { Poster }
