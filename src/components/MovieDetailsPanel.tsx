import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { Film } from '../data/films.types'
import {
  fetchMovieDetails,
  fetchMovieImages,
  fetchMovieTrailer,
  hasApiKey,
  toLargeStillUrl,
  type MovieStill,
  type MovieTrailer,
} from '../tmdb'
import { OpenStremioLink } from './OpenStremioLink'
import { OpenTmdbLink } from './OpenTmdbLink'
import { MovieTile, Poster } from './MovieTile'

const DETAILS_WIDTH_KEY = 'trakt.detailsPanelWidth'
const DETAILS_WIDTH_DEFAULT = 480
const DETAILS_WIDTH_MIN = 360
const DETAILS_WIDTH_MAX = 720

function RemoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export type MovieDetailsSubject = {
  id: string
  title: string
  year: string | null
  director?: string | null
  coverUrl: string | null
  imdbId?: string | null
  tmdbId?: number | null
}

type PanelTab = 'details' | 'notes' | 'other'

const OTHER_FILMS_EMPTY = 'No other films in your library.'

function normalizeDirector(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

type ExtrasState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  plot: string
  stills: MovieStill[]
  trailer: MovieTrailer | null
}

const EMPTY_EXTRAS: ExtrasState = {
  status: 'idle',
  plot: '',
  stills: [],
  trailer: null,
}

const NOTE_SAVE_DEBOUNCE_MS = 500

function clampDetailsWidth(width: number, viewportWidth = window.innerWidth): number {
  const maxForViewport = Math.min(DETAILS_WIDTH_MAX, Math.floor(viewportWidth * 0.7))
  const max = Math.max(DETAILS_WIDTH_MIN, maxForViewport)
  return Math.min(max, Math.max(DETAILS_WIDTH_MIN, Math.round(width)))
}

function loadDetailsWidth(): number {
  try {
    const raw = localStorage.getItem(DETAILS_WIDTH_KEY)
    if (!raw) return clampDetailsWidth(DETAILS_WIDTH_DEFAULT)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return clampDetailsWidth(DETAILS_WIDTH_DEFAULT)
    return clampDetailsWidth(parsed)
  } catch {
    return clampDetailsWidth(DETAILS_WIDTH_DEFAULT)
  }
}

export function MovieDetailsPanel({
  movie,
  open,
  note,
  catalogFilms,
  onSaveNote,
  onSelectFilm,
  onClose,
}: {
  movie: MovieDetailsSubject | null
  open: boolean
  note: string
  catalogFilms: Film[]
  onSaveNote: (text: string) => void
  onSelectFilm: (film: Film) => void
  onClose: () => void
}) {
  const titleId = useId()
  const noteId = useId()
  const tabsId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const saveTimer = useRef<number | null>(null)
  const widthDrag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(
    null,
  )
  const [tab, setTab] = useState<PanelTab>('details')
  const [draft, setDraft] = useState(note)
  const [shown, setShown] = useState<MovieDetailsSubject | null>(movie)
  const [extras, setExtras] = useState<ExtrasState>(EMPTY_EXTRAS)
  const [panelWidth, setPanelWidth] = useState(() => loadDetailsWidth())
  const [resizing, setResizing] = useState(false)
  const [plotExpanded, setPlotExpanded] = useState(false)
  const [plotOverflows, setPlotOverflows] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const plotRef = useRef<HTMLParagraphElement>(null)
  const subjectId = movie?.id
  const tmdbId = movie?.tmdbId
  const lightboxStill =
    lightboxIndex != null ? (extras.stills[lightboxIndex] ?? null) : null
  const canNavigateLightbox = extras.stills.length > 1

  function closeLightbox() {
    setLightboxIndex(null)
  }

  function stepLightbox(delta: number) {
    const count = extras.stills.length
    if (count === 0) return
    setLightboxIndex((current) => {
      if (current == null) return current
      return (current + delta + count) % count
    })
  }

  useEffect(() => {
    if (movie) setShown(movie)
  }, [movie])

  useEffect(() => {
    if (!subjectId) return
    setTab('details')
    setPlotExpanded(false)
    setPlotOverflows(false)
    setLightboxIndex(null)
  }, [subjectId])

  useEffect(() => {
    if (!open) setLightboxIndex(null)
  }, [open])

  useEffect(() => {
    setDraft(note)
  }, [note, subjectId])

  useEffect(() => {
    if (plotExpanded) return
    const node = plotRef.current
    if (!node || !extras.plot) {
      setPlotOverflows(false)
      return
    }

    function measure() {
      const el = plotRef.current
      if (!el) return
      setPlotOverflows(el.scrollHeight > el.clientHeight + 1)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [extras.plot, plotExpanded, panelWidth, open, tab])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (lightboxStill) {
        if (event.key === 'Escape') {
          event.stopPropagation()
          closeLightbox()
          return
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          stepLightbox(-1)
          return
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          stepLightbox(1)
          return
        }
        return
      }
      if (event.key === 'Escape') onClose()
    }

    function onPointerDown(event: globalThis.PointerEvent) {
      if (event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (panelRef.current?.contains(target)) return
      if (target.closest('.still-lightbox')) return
      // Let film tiles open / toggle the panel themselves.
      if (target.closest('[data-film-open-trigger]')) return
      onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onClose, lightboxStill, extras.stills.length])

  useEffect(() => {
    if (!open || tmdbId == null || tmdbId <= 0 || !hasApiKey()) {
      setExtras(EMPTY_EXTRAS)
      return
    }

    let cancelled = false
    setExtras({ status: 'loading', plot: '', stills: [], trailer: null })

    void Promise.allSettled([
      fetchMovieDetails(tmdbId),
      fetchMovieImages(tmdbId),
      fetchMovieTrailer(tmdbId),
    ]).then(([detailsResult, imagesResult, trailerResult]) => {
      if (cancelled) return
      const plot =
        detailsResult.status === 'fulfilled' ? detailsResult.value.overview : ''
      const stills = imagesResult.status === 'fulfilled' ? imagesResult.value : []
      const trailer = trailerResult.status === 'fulfilled' ? trailerResult.value : null
      setExtras({
        status: 'ready',
        plot,
        stills,
        trailer,
      })
    })

    return () => {
      cancelled = true
    }
  }, [open, tmdbId])

  useEffect(() => {
    try {
      localStorage.setItem(DETAILS_WIDTH_KEY, String(panelWidth))
    } catch {
      /* ignore quota / private mode */
    }
  }, [panelWidth])

  useEffect(() => {
    function onResize() {
      setPanelWidth((current) => clampDetailsWidth(current))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    }
  }, [])

  function clearSaveTimer() {
    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
  }

  function commitNote(text: string) {
    clearSaveTimer()
    if (text === note) return
    onSaveNote(text)
  }

  function scheduleSave(text: string) {
    clearSaveTimer()
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      if (text === note) return
      onSaveNote(text)
    }, NOTE_SAVE_DEBOUNCE_MS)
  }

  function handleDraftChange(value: string) {
    setDraft(value)
    scheduleSave(value)
  }

  function handleSave() {
    commitNote(draft)
  }

  function handleResizePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const panel = panelRef.current
    const startWidth = panel ? panel.getBoundingClientRect().width : panelWidth
    widthDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
    }
    setResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  function handleResizePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = widthDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    // Left-edge drag: moving left increases width.
    const next = clampDetailsWidth(drag.startWidth + (drag.startX - event.clientX))
    setPanelWidth(next)
  }

  function endResize(event: PointerEvent<HTMLButtonElement>) {
    const drag = widthDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    widthDrag.current = null
    setResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const subject = shown
  const yearLabel = subject?.year || 'Year unknown'
  const metaParts = [subject?.director, subject?.year ? String(subject.year) : null].filter(
    Boolean,
  ) as string[]
  const metaLabel = metaParts.length > 0 ? metaParts.join(' · ') : yearLabel
  const canLoadExtras = tmdbId != null && tmdbId > 0 && hasApiKey()
  const showExtrasShell = canLoadExtras || extras.status === 'ready'
  const noteDirty = draft !== note
  const maxWidth = Math.min(DETAILS_WIDTH_MAX, Math.floor(window.innerWidth * 0.7))

  const otherFilms = useMemo(() => {
    if (!subject) return []
    const directorKey = normalizeDirector(subject.director)
    if (!directorKey) return []
    return catalogFilms.filter(
      (film) =>
        film.id !== subject.id && normalizeDirector(film.director) === directorKey,
    )
  }, [catalogFilms, subject])

  return (
    <>
    <aside
      ref={panelRef}
      className="details-panel"
      data-open={open || undefined}
      data-resizing={resizing || undefined}
      role="complementary"
      aria-labelledby={subject ? titleId : undefined}
      aria-hidden={!open}
      inert={open ? undefined : true}
      style={{ '--details-panel-width': `${panelWidth}px` } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="details-resize"
        aria-label="Resize details panel"
        aria-orientation="vertical"
        aria-valuemin={DETAILS_WIDTH_MIN}
        aria-valuemax={maxWidth}
        aria-valuenow={panelWidth}
        data-active={resizing || undefined}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />

      {subject ? (
        <>
          <div className="details-panel-head">
            <div className="details-identity">
              <Poster title={subject.title} posterUrl={subject.coverUrl} />
              <div className="details-copy">
                <h2 id={titleId} className="details-title">
                  {subject.title}
                </h2>
                <p className="details-meta">{metaLabel}</p>
                <div className="external-links">
                  <OpenStremioLink imdbId={subject.imdbId} tmdbId={subject.tmdbId} />
                  <OpenTmdbLink tmdbId={subject.tmdbId} />
                </div>
              </div>
            </div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <RemoveIcon />
            </button>
          </div>

          <div className="details-tabs" role="tablist" aria-label="Film panel">
            <button
              type="button"
              role="tab"
              id={`${tabsId}-details`}
              className="details-tab"
              aria-selected={tab === 'details'}
              aria-controls={`${tabsId}-details-panel`}
              tabIndex={tab === 'details' ? 0 : -1}
              onClick={() => setTab('details')}
            >
              Details
            </button>
            <button
              type="button"
              role="tab"
              id={`${tabsId}-other`}
              className="details-tab"
              aria-selected={tab === 'other'}
              aria-controls={`${tabsId}-other-panel`}
              tabIndex={tab === 'other' ? 0 : -1}
              onClick={() => setTab('other')}
            >
              Other films{' '}
              <span className="details-tab-count">[{otherFilms.length}]</span>
            </button>
            <button
              type="button"
              role="tab"
              id={`${tabsId}-notes`}
              className="details-tab"
              aria-selected={tab === 'notes'}
              aria-controls={`${tabsId}-notes-panel`}
              tabIndex={tab === 'notes' ? 0 : -1}
              onClick={() => setTab('notes')}
            >
              Notes
            </button>
          </div>

          <div className="details-panel-body">
            {tab === 'details' ? (
              <div
                className="details-tab-panel"
                role="tabpanel"
                id={`${tabsId}-details-panel`}
                aria-labelledby={`${tabsId}-details`}
              >
                {showExtrasShell ? (
                  <div className="details-extras">
                    <section className="details-section" aria-label="Plot">
                      {extras.status === 'loading' ? (
                        <p className="details-empty">Loading details…</p>
                      ) : extras.plot ? (
                        <div className="details-plot-block">
                          <p
                            ref={plotRef}
                            className={`details-plot${plotExpanded ? ' expanded' : ''}`}
                            id={`${titleId}-plot-text`}
                          >
                            {extras.plot}
                          </p>
                          {plotOverflows || plotExpanded ? (
                            <button
                              type="button"
                              className="details-plot-toggle"
                              aria-expanded={plotExpanded}
                              aria-controls={`${titleId}-plot-text`}
                              onClick={() => setPlotExpanded((current) => !current)}
                            >
                              {plotExpanded ? 'Show less' : 'Show more'}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="details-empty">No plot available.</p>
                      )}
                    </section>

                    {extras.status === 'loading' ? null : (
                      <section className="details-section" aria-labelledby={`${titleId}-trailer`}>
                        <h3 id={`${titleId}-trailer`} className="details-label">
                          Trailer
                        </h3>
                        {extras.trailer ? (
                          <div className="details-trailer">
                            <iframe
                              className="details-trailer-frame"
                              src={extras.trailer.embedUrl}
                              title={extras.trailer.name}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                              loading="lazy"
                              referrerPolicy="strict-origin-when-cross-origin"
                            />
                          </div>
                        ) : (
                          <p className="details-empty">No trailer available.</p>
                        )}
                      </section>
                    )}

                    {extras.status === 'loading' ? null : extras.stills.length > 0 ? (
                      <section className="details-section" aria-label="Images">
                        <ul className="details-stills">
                          {extras.stills.map((still, index) => (
                            <li key={still.filePath} className="details-still">
                              <button
                                type="button"
                                className="details-still-btn"
                                aria-label="View image"
                                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                  event.stopPropagation()
                                  setLightboxIndex(index)
                                }}
                              >
                                <img src={still.url} alt="" loading="lazy" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                ) : (
                  <p className="details-empty">No details available for this film.</p>
                )}
              </div>
            ) : null}

            {tab === 'notes' ? (
              <div
                className="details-tab-panel details-notes"
                role="tabpanel"
                id={`${tabsId}-notes-panel`}
                aria-labelledby={`${tabsId}-notes`}
              >
                <label className="details-label" htmlFor={noteId}>
                  Notes
                </label>
                <textarea
                  id={noteId}
                  className="details-textarea"
                  value={draft}
                  onChange={(event) => handleDraftChange(event.target.value)}
                  onBlur={() => commitNote(draft)}
                  rows={12}
                  placeholder="Write a note about this film"
                  spellCheck
                />
                <div className="details-footer">
                  <button
                    type="button"
                    className="text-btn"
                    onClick={handleSave}
                    disabled={!noteDirty}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : null}

            {tab === 'other' ? (
              <div
                className="details-tab-panel details-other-films"
                role="tabpanel"
                id={`${tabsId}-other-panel`}
                aria-labelledby={`${tabsId}-other`}
              >
                {otherFilms.length === 0 ? (
                  <p className="details-empty">{OTHER_FILMS_EMPTY}</p>
                ) : (
                  <ul className="movie-list details-other-list" aria-label="Other films">
                    {otherFilms.map((film) => (
                      <MovieTile
                        key={film.id}
                        title={film.title}
                        posterUrl={film.coverUrl}
                        year={film.year != null ? String(film.year) : null}
                        director={film.director}
                        showStremio={false}
                        selected={film.id === subject.id}
                        onSelect={() => onSelectFilm(film)}
                        selectLabel={`Open ${film.title}`}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </aside>
    {lightboxStill
      ? createPortal(
          <div
            className="still-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Image"
            onClick={closeLightbox}
          >
            <button
              type="button"
              className="icon-btn still-lightbox-close"
              aria-label="Close"
              onClick={(event) => {
                event.stopPropagation()
                closeLightbox()
              }}
            >
              <RemoveIcon />
            </button>
            {canNavigateLightbox ? (
              <button
                type="button"
                className="icon-btn still-lightbox-nav still-lightbox-prev"
                aria-label="Previous image"
                onClick={(event) => {
                  event.stopPropagation()
                  stepLightbox(-1)
                }}
              >
                <ChevronLeftIcon />
              </button>
            ) : null}
            <img
              className="still-lightbox-image"
              src={toLargeStillUrl(lightboxStill)}
              alt=""
            />
            {canNavigateLightbox ? (
              <button
                type="button"
                className="icon-btn still-lightbox-nav still-lightbox-next"
                aria-label="Next image"
                onClick={(event) => {
                  event.stopPropagation()
                  stepLightbox(1)
                }}
              >
                <ChevronRightIcon />
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null}
    </>
  )
}
