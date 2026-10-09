import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useEffectEvent,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import filmsDb from './data/films.json'
import type { Film, FilmsDatabase } from './data/films.types'
import {
  CATALOG_SORT_LABELS,
  DECADE_FILTERS,
  filmToMovie,
  filterFilmsByDecade,
  filterFilmsByQuery,
  filterMoviesByDecade,
  hashFilmId,
  isCatalogSort,
  mergeCatalog,
  nextCatalogSort,
  sortFilms,
  type CatalogSort,
  type DecadeFilter,
} from './filmCatalog'
import { AccountControl, SyncIndicator } from './components/AccountControl'
import { MovieDetailsPanel, type MovieDetailsSubject } from './components/MovieDetailsPanel'
import { MovieTile } from './components/MovieTile'
import type { UiPrefs } from './cloudSync'
import { hasApiKey, searchMovies } from './tmdb'
import type { Movie } from './types'
import { useAuth } from './useAuth'
import { useBaseCatalog } from './useBaseCatalog'
import { useCloudSync } from './useCloudSync'
import { useFilmNotes } from './useFilmNotes'
import { useMovieQueue } from './useMovieQueue'
import { useUserFilms } from './useUserFilms'

const localFilms = (filmsDb as FilmsDatabase).films

const CATALOG_WIDTH_KEY = 'trakt.catalogWidth'
const CATALOG_SORT_KEY = 'trakt.catalogSort'
const CATALOG_VISIBLE_KEY = 'trakt.catalogVisible'
const CATALOG_WIDTH_DEFAULT = 320
const CATALOG_WIDTH_MIN = 240
const CATALOG_WIDTH_MAX = 560
const CATALOG_SORT_DEFAULT: CatalogSort = 'year-desc'
const MAIN_MIN_WIDTH = 280

type WatchedFilter = 'all' | 'watched' | 'unwatched'
type AppTab = 'watchlist' | WatchedFilter | 'add'

const NAV_FILTERS: { id: WatchedFilter; label: string }[] = [
  { id: 'unwatched', label: 'Unwatched' },
  { id: 'watched', label: 'Watched' },
  { id: 'all', label: 'All' },
]

function loadCatalogWidth(): number {
  try {
    const raw = localStorage.getItem(CATALOG_WIDTH_KEY)
    if (!raw) return CATALOG_WIDTH_DEFAULT
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return CATALOG_WIDTH_DEFAULT
    return clampCatalogWidth(parsed)
  } catch {
    return CATALOG_WIDTH_DEFAULT
  }
}

function loadCatalogSort(): CatalogSort {
  try {
    const raw = localStorage.getItem(CATALOG_SORT_KEY)
    if (raw && isCatalogSort(raw)) return raw
    // Migrate removed title A–Z / Z–A prefs to year newest.
    if (raw === 'title-asc' || raw === 'title-desc') return CATALOG_SORT_DEFAULT
  } catch {
    /* ignore */
  }
  return CATALOG_SORT_DEFAULT
}

function clampCatalogWidth(width: number, viewportWidth = window.innerWidth): number {
  const maxForViewport = Math.max(
    CATALOG_WIDTH_MIN,
    viewportWidth - MAIN_MIN_WIDTH - 120,
  )
  const max = Math.min(CATALOG_WIDTH_MAX, maxForViewport)
  return Math.min(max, Math.max(CATALOG_WIDTH_MIN, Math.round(width)))
}

function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

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

function RemoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Watchlist — ordered list. */
function WatchlistNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6h13M8 12h13M8 18h13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Unwatched — eye with slash (visibility none). */
function UnwatchedNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 4l16 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function WatchedNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

/** All — 2×2 grid. */
function AllNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Sort — stacked bars with direction cue. */
function SortIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h10M4 12h7M4 17h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17 5v14M14 16l3 3 3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Catalog sidebar — panel with left edge. */
function CatalogToggleIcon({ visible }: { visible: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="2" />
      {visible ? (
        <path
          d="M14 9l-3 3 3 3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M12 9l3 3-3 3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

const NAV_FILTER_ICONS: Record<WatchedFilter, ReactNode> = {
  unwatched: <UnwatchedNavIcon />,
  watched: <WatchedNavIcon />,
  all: <AllNavIcon />,
}

function stopRowOpen(event: MouseEvent | PointerEvent) {
  event.stopPropagation()
}

function filmToDetails(film: Film): MovieDetailsSubject {
  return {
    id: film.id,
    title: film.title,
    year: film.year != null ? String(film.year) : null,
    director: film.director,
    coverUrl: film.coverUrl,
    imdbId: film.imdbId,
    tmdbId: film.tmdbId,
  }
}

function findCatalogFilmForMovie(movie: Movie, films: Film[]): Film | undefined {
  if (movie.id > 0) {
    return films.find((film) => film.tmdbId === movie.id)
  }
  return films.find((film) => hashFilmId(film.id) === movie.id)
}

function movieToDetails(movie: Movie, films: Film[]): MovieDetailsSubject {
  const film = findCatalogFilmForMovie(movie, films)
  if (film) return filmToDetails(film)
  return {
    id: movie.id > 0 ? `tmdb-${movie.id}` : `movie-${movie.id}`,
    title: movie.title,
    year: movie.year || null,
    coverUrl: movie.posterUrl,
    imdbId: movie.imdbId ?? null,
    tmdbId: movie.id > 0 ? movie.id : null,
  }
}

export default function App() {
  const navId = useId()
  const decadeFilterId = useId()
  const toWatchDecadeFilterId = useId()
  const searchId = useId()
  const catalogFilterId = useId()
  const apiReady = hasApiKey()
  const {
    movies,
    toWatch,
    addMovie,
    markWatched,
    toggleWatchedFromCatalog,
    removeMovie,
    reorderToWatch,
    replaceQueue,
    isInToWatch,
    isWatched,
    hasBeenWatched,
  } = useMovieQueue()
  const { userFilms, addToLibrary, replaceUserFilms } = useUserFilms()
  const { notes, getNote, setNote, replaceNotes } = useFilmNotes()
  const baseFilms = useBaseCatalog(localFilms)
  const {
    configured: supabaseConfigured,
    status: authStatus,
    user,
    authMessage,
    authBusy,
    signInWithEmail,
    signOut,
    clearAuthMessage,
  } = useAuth()

  const catalogFilms = useMemo(
    () => mergeCatalog(baseFilms, userFilms),
    [baseFilms, userFilms],
  )

  const [decade, setDecade] = useState<DecadeFilter>('all')
  const [toWatchDecade, setToWatchDecade] = useState<DecadeFilter>('all')
  const [watchedFilter, setWatchedFilter] = useState<WatchedFilter>('unwatched')
  const [appTab, setAppTab] = useState<AppTab>('watchlist')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogSort, setCatalogSort] = useState<CatalogSort>(() => loadCatalogSort())
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Movie[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<number | null>(null)
  const [details, setDetails] = useState<MovieDetailsSubject | null>(null)
  const [catalogWidth, setCatalogWidth] = useState(() => loadCatalogWidth())
  // Start closed: Watchlist is the default tab; library tabs open the catalog.
  const [catalogVisible, setCatalogVisible] = useState(false)
  const [resizingCatalog, setResizingCatalog] = useState(false)
  const [watchlistDragId, setWatchlistDragId] = useState<number | null>(null)
  const [watchlistDropId, setWatchlistDropId] = useState<number | null>(null)

  const cloudPrefs = useMemo<UiPrefs>(
    () => ({
      catalogSort,
      catalogVisible,
      catalogWidth,
    }),
    [catalogSort, catalogVisible, catalogWidth],
  )

  const applyCloudPrefs = useCallback((next: UiPrefs) => {
    if (next.catalogSort && isCatalogSort(next.catalogSort)) {
      setCatalogSort(next.catalogSort)
    }
    if (typeof next.catalogVisible === 'boolean') {
      setCatalogVisible(next.catalogVisible)
    }
    if (typeof next.catalogWidth === 'number') {
      setCatalogWidth(clampCatalogWidth(next.catalogWidth))
    }
  }, [])

  const { syncStatus, syncError } = useCloudSync({
    authStatus,
    userId: user?.id ?? null,
    movies,
    userFilms,
    notes,
    prefs: cloudPrefs,
    replaceQueue,
    replaceUserFilms,
    replaceNotes,
    applyPrefs: applyCloudPrefs,
  })
  const flashTimer = useRef<number | null>(null)
  const lastDetails = useRef<MovieDetailsSubject | null>(null)
  const libraryRef = useRef<HTMLDivElement | null>(null)
  const catalogDrag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(
    null,
  )
  const watchlistDragIdRef = useRef<number | null>(null)

  const clearWatchlistDrag = useCallback(() => {
    watchlistDragIdRef.current = null
    setWatchlistDragId(null)
    setWatchlistDropId(null)
  }, [])

  const handleWatchlistDragStart = useCallback((movieId: number, event: DragEvent<HTMLDivElement>) => {
    watchlistDragIdRef.current = movieId
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(movieId))
    setWatchlistDragId(movieId)
    setWatchlistDropId(null)
  }, [])

  const handleWatchlistDragOver = useCallback((movieId: number, event: DragEvent<HTMLLIElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const fromId = watchlistDragIdRef.current
    if (fromId == null || fromId === movieId) return
    setWatchlistDropId(movieId)
  }, [])

  const handleWatchlistDragLeave = useCallback((movieId: number, event: DragEvent<HTMLLIElement>) => {
    const related = event.relatedTarget as Node | null
    if (related && event.currentTarget.contains(related)) return
    setWatchlistDropId((current) => (current === movieId ? null : current))
  }, [])

  const handleWatchlistDrop = useCallback(
    (movieId: number, event: DragEvent<HTMLLIElement>) => {
      event.preventDefault()
      const raw = event.dataTransfer.getData('text/plain')
      const fromId = Number(raw || watchlistDragIdRef.current)
      if (Number.isFinite(fromId) && fromId !== movieId) {
        reorderToWatch(fromId, movieId)
      }
      clearWatchlistDrag()
    },
    [clearWatchlistDrag, reorderToWatch],
  )

  if (details) lastDetails.current = details
  const panelMovie = details ?? lastDetails.current
  const panelOpen = details != null
  const addMode = appTab === 'add'
  const watchlistMode = appTab === 'watchlist'

  const decadeCatalog = useMemo(
    () => filterFilmsByDecade(catalogFilms, decade),
    [catalogFilms, decade],
  )

  const filteredToWatch = useMemo(
    () => filterMoviesByDecade(toWatch, toWatchDecade),
    [toWatch, toWatchDecade],
  )

  const statusCatalog = useMemo(() => {
    if (watchedFilter === 'all') return decadeCatalog
    return decadeCatalog.filter((film) => {
      const filmWatched = hasBeenWatched(filmToMovie(film).id)
      return watchedFilter === 'watched' ? filmWatched : !filmWatched
    })
  }, [decadeCatalog, watchedFilter, hasBeenWatched])

  const filteredCatalog = useMemo(() => {
    const textFiltered = filterFilmsByQuery(statusCatalog, catalogQuery)
    return sortFilms(textFiltered, catalogSort)
  }, [statusCatalog, catalogQuery, catalogSort])

  const statusCatalogEmpty = statusCatalog.length === 0
  const textFilterActive = catalogQuery.trim().length > 0
  const sortLabel = CATALOG_SORT_LABELS[catalogSort]

  const runSearch = useEffectEvent(async (value: string) => {
    if (!apiReady) return
    const trimmed = value.trim()
    if (!trimmed) {
      setResults([])
      setStatus('idle')
      setError(null)
      return
    }

    setStatus('loading')
    setError(null)

    try {
      const movies = await searchMovies(trimmed)
      setResults(movies)
      setStatus('ready')
    } catch (err) {
      setResults([])
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not search movies.')
    }
  })

  useEffect(() => {
    if (!addMode) return
    const handle = window.setTimeout(() => {
      void runSearch(query)
    }, 320)
    return () => window.clearTimeout(handle)
  }, [query, addMode])

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CATALOG_WIDTH_KEY, String(catalogWidth))
    } catch {
      /* ignore quota / private mode */
    }
  }, [catalogWidth])

  useEffect(() => {
    try {
      localStorage.setItem(CATALOG_SORT_KEY, catalogSort)
    } catch {
      /* ignore quota / private mode */
    }
  }, [catalogSort])

  useEffect(() => {
    try {
      localStorage.setItem(CATALOG_VISIBLE_KEY, catalogVisible ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [catalogVisible])

  useEffect(() => {
    function onResize() {
      setCatalogWidth((current) => clampCatalogWidth(current))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function handleCatalogResizePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const library = libraryRef.current
    const sidebar = library?.querySelector('.sidebar')
    const startWidth =
      sidebar instanceof HTMLElement ? sidebar.getBoundingClientRect().width : catalogWidth
    catalogDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
    }
    setResizingCatalog(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function handleCatalogResizePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = catalogDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const next = clampCatalogWidth(drag.startWidth + (event.clientX - drag.startX))
    setCatalogWidth(next)
  }

  function endCatalogResize(event: PointerEvent<HTMLButtonElement>) {
    const drag = catalogDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    catalogDrag.current = null
    setResizingCatalog(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleAdd(movie: Movie) {
    addMovie(movie)
    // Search-only films need a local library entry so they show under Unwatched/All.
    const alreadyInCatalog = baseFilms.some((film) => film.tmdbId === movie.id)
    if (!alreadyInCatalog) {
      void addToLibrary(movie)
    }
    setFlashId(movie.id)
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashId(null), 900)
  }

  function handleAddFilm(film: Film) {
    handleAdd(filmToMovie(film))
  }

  function selectDetails(next: MovieDetailsSubject) {
    setDetails((current) => (current?.id === next.id ? null : next))
  }

  function closeFilmDetails() {
    setDetails(null)
  }

  function enterWatchlist() {
    setAppTab('watchlist')
    setCatalogVisible(false)
    setQuery('')
    setResults([])
    setStatus('idle')
    setError(null)
  }

  function enterBrowse(filter: WatchedFilter) {
    setAppTab(filter)
    setWatchedFilter(filter)
    setCatalogVisible(true)
    setQuery('')
    setResults([])
    setStatus('idle')
    setError(null)
  }

  function enterAddMode() {
    setAppTab('add')
    setCatalogVisible(true)
  }

  const activeFilterLabel =
    NAV_FILTERS.find((option) => option.id === watchedFilter)?.label ?? 'All'
  const sidebarTitle = addMode ? 'Add' : activeFilterLabel

  let searchMeta: string | null = null
  let metaTone: 'default' | 'error' = 'default'

  if (!apiReady) {
    searchMeta = 'Add a TMDB API key to enable search.'
  } else if (status === 'loading') {
    searchMeta = 'Searching…'
  } else if (status === 'error' && error) {
    searchMeta = error
    metaTone = 'error'
  } else if (status === 'ready' && query.trim()) {
    searchMeta =
      results.length === 0
        ? 'No movies found.'
        : `${results.length} result${results.length === 1 ? '' : 's'}`
  }

  return (
    <div
      className="shell"
      data-catalog={catalogVisible || undefined}
      data-details={panelOpen || undefined}
      data-view={appTab}
      style={{ '--catalog-width': `${catalogWidth}px` } as CSSProperties}
    >
      <nav className="app-nav scrollable" aria-labelledby={navId}>
        <span id={navId} className="visually-hidden">
          Views
        </span>
        <button
          type="button"
          className="app-nav-btn"
          aria-label="Watchlist"
          title="Watchlist"
          aria-current={watchlistMode ? 'true' : undefined}
          data-active={watchlistMode || undefined}
          onClick={enterWatchlist}
        >
          <WatchlistNavIcon />
        </button>
        {NAV_FILTERS.map((option) => {
          const selected = appTab === option.id
          return (
            <button
              key={option.id}
              type="button"
              className="app-nav-btn"
              aria-label={option.label}
              title={option.label}
              aria-current={selected ? 'true' : undefined}
              data-active={selected || undefined}
              onClick={() => enterBrowse(option.id)}
            >
              {NAV_FILTER_ICONS[option.id]}
            </button>
          )
        })}
        <button
          type="button"
          className="app-nav-btn"
          aria-label="Add"
          title="Add"
          data-active={addMode || undefined}
          aria-pressed={addMode}
          onClick={enterAddMode}
        >
          <PlusIcon />
        </button>
        <div className="app-nav-spacer" aria-hidden="true" />
        <button
          type="button"
          className="app-nav-btn app-nav-catalog-toggle"
          aria-label={catalogVisible ? 'Hide catalog' : 'Show catalog'}
          title={catalogVisible ? 'Hide catalog' : 'Show catalog'}
          aria-pressed={catalogVisible}
          onClick={() => setCatalogVisible((current) => !current)}
        >
          <CatalogToggleIcon visible={catalogVisible} />
        </button>
        <AccountControl
          configured={supabaseConfigured}
          authStatus={authStatus}
          email={user?.email ?? null}
          authBusy={authBusy}
          authMessage={authMessage}
          onSignIn={signInWithEmail}
          onSignOut={signOut}
          onClearMessage={clearAuthMessage}
        />
      </nav>

      <div className="library" ref={libraryRef} aria-hidden={!catalogVisible}>
        <aside className="sidebar" aria-labelledby="catalog-heading">
          <div className="sidebar-head">
            <div className="section-head">
              <h2 id="catalog-heading" className="section-title">
                {sidebarTitle}
              </h2>
              {!addMode ? (
                <span className="section-count">{filteredCatalog.length}</span>
              ) : null}
            </div>

            {addMode ? (
              <div className="search">
                <label className="visually-hidden" htmlFor={searchId}>
                  Search movies
                </label>
                <input
                  id={searchId}
                  className="search-input"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search movies…"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!apiReady}
                  autoFocus
                />
                {searchMeta ? (
                  <p className="search-meta" data-tone={metaTone === 'error' ? 'error' : undefined}>
                    {searchMeta}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="catalog-toolbar">
                  <label className="visually-hidden" htmlFor={catalogFilterId}>
                    Filter catalog
                  </label>
                  <input
                    id={catalogFilterId}
                    className="search-input catalog-filter-input"
                    type="search"
                    value={catalogQuery}
                    onChange={(event) => setCatalogQuery(event.target.value)}
                    placeholder="Filter..."
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="catalog-sort-btn"
                    title={`Sort: ${sortLabel}`}
                    aria-label={`Sort: ${sortLabel}`}
                    onClick={() => setCatalogSort((current) => nextCatalogSort(current))}
                  >
                    <SortIcon />
                  </button>
                </div>
                <div className="filter-chips" role="group" aria-labelledby={decadeFilterId}>
                  <span id={decadeFilterId} className="visually-hidden">
                    Filter by decade
                  </span>
                  {DECADE_FILTERS.map((option) => {
                    const selected = decade === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className="chip"
                        aria-pressed={selected}
                        data-active={selected || undefined}
                        onClick={() => setDecade(option.id)}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {addMode && !apiReady ? (
              <p className="setup">
                Create a free key at{' '}
                <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
                  themoviedb.org/settings/api
                </a>
                , then add <code>VITE_TMDB_API_KEY=your_key</code> to a <code>.env</code> file in the
                project root and restart the dev server.
              </p>
            ) : null}
          </div>

          {addMode ? (
            results.length > 0 ? (
              <ul className="movie-list catalog-list scrollable" aria-label="Search results">
                {results.map((movie) => {
                  const inToWatch = isInToWatch(movie.id)
                  const catalogFilm = findCatalogFilmForMovie(movie, catalogFilms)
                  return (
                    <MovieTile
                      key={movie.id}
                      title={movie.title}
                      posterUrl={movie.posterUrl}
                      year={movie.year || null}
                      director={catalogFilm?.director}
                      watched={hasBeenWatched(movie.id)}
                      selected={details?.id === (catalogFilm?.id ?? `tmdb-${movie.id}`)}
                      imdbId={movie.imdbId ?? catalogFilm?.imdbId}
                      tmdbId={movie.id > 0 ? movie.id : null}
                      onSelect={() => selectDetails(movieToDetails(movie, catalogFilms))}
                      selectLabel={`Details for ${movie.title}`}
                      actions={
                        <button
                          type="button"
                          className="icon-btn"
                          data-tone="accent"
                          aria-label={
                            inToWatch ? `${movie.title} already in list` : `Add ${movie.title}`
                          }
                          disabled={inToWatch}
                          onClick={() => handleAdd(movie)}
                        >
                          <PlusIcon />
                        </button>
                      }
                    />
                  )
                })}
              </ul>
            ) : (
              <p className="empty">
                {query.trim() && status === 'ready' ? 'No movies found.' : 'Search to add movies.'}
              </p>
            )
          ) : filteredCatalog.length === 0 ? (
            <p className="empty">
              {textFilterActive && !statusCatalogEmpty
                ? 'No films match this filter.'
                : decadeCatalog.length === 0
                  ? 'No films in this decade.'
                  : watchedFilter === 'watched'
                    ? 'No watched films in this view.'
                    : watchedFilter === 'unwatched'
                      ? 'No unwatched films in this view.'
                      : 'No films in this view.'}
            </p>
          ) : (
            <ul className="movie-list catalog-list scrollable" aria-label={sidebarTitle}>
              {filteredCatalog.map((film) => {
                const movie = filmToMovie(film)
                const inToWatch = isInToWatch(movie.id)
                const filmWatched = isWatched(movie.id)
                return (
                  <MovieTile
                    key={film.id}
                    title={film.title}
                    posterUrl={film.coverUrl}
                    year={film.year != null ? String(film.year) : null}
                    director={film.director}
                    justAdded={flashId === movie.id}
                    watched={hasBeenWatched(movie.id)}
                    selected={details?.id === film.id}
                    imdbId={film.imdbId}
                    tmdbId={film.tmdbId}
                    onSelect={() => selectDetails(filmToDetails(film))}
                    selectLabel={`Details for ${film.title}`}
                    actions={
                      <>
                        <button
                          type="button"
                          className="icon-btn"
                          data-tone="ok"
                          data-active={filmWatched || undefined}
                          aria-pressed={filmWatched}
                          aria-label={
                            filmWatched
                              ? `Remove watched status for ${film.title}`
                              : `Mark ${film.title} as watched`
                          }
                          onClick={(event) => {
                            stopRowOpen(event)
                            toggleWatchedFromCatalog(movie)
                          }}
                        >
                          <CheckIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          data-tone="accent"
                          aria-label={
                            inToWatch ? `${film.title} already in list` : `Add ${film.title}`
                          }
                          disabled={inToWatch}
                          onClick={(event) => {
                            stopRowOpen(event)
                            handleAddFilm(film)
                          }}
                        >
                          <PlusIcon />
                        </button>
                      </>
                    }
                  />
                )
              })}
            </ul>
          )}
        </aside>

        <button
          type="button"
          className="library-resize"
          aria-label="Resize catalog"
          aria-orientation="vertical"
          aria-valuemin={CATALOG_WIDTH_MIN}
          aria-valuemax={CATALOG_WIDTH_MAX}
          aria-valuenow={catalogWidth}
          data-active={resizingCatalog || undefined}
          tabIndex={catalogVisible ? 0 : -1}
          onPointerDown={handleCatalogResizePointerDown}
          onPointerMove={handleCatalogResizePointerMove}
          onPointerUp={endCatalogResize}
          onPointerCancel={endCatalogResize}
        />
      </div>

      <main className="main scrollable">
        <section className="section" aria-labelledby="watchlist-heading">
          <div className="section-head">
            <h2 id="watchlist-heading" className="section-title">
              Watchlist
            </h2>
            <div className="section-actions">
              <SyncIndicator
                configured={supabaseConfigured}
                authStatus={authStatus}
                syncStatus={syncStatus}
                syncError={syncError}
              />
              <span className="section-count">{filteredToWatch.length}</span>
            </div>
          </div>
          <div className="filter-chips" role="group" aria-labelledby={toWatchDecadeFilterId}>
            <span id={toWatchDecadeFilterId} className="visually-hidden">
              Filter watchlist by decade
            </span>
            {DECADE_FILTERS.map((option) => {
              const selected = toWatchDecade === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  className="chip"
                  aria-pressed={selected}
                  data-active={selected || undefined}
                  onClick={() => setToWatchDecade(option.id)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          {toWatch.length === 0 ? (
            <p className="empty">Nothing queued yet. Use Add or Unwatched to find films.</p>
          ) : filteredToWatch.length === 0 ? (
            <p className="empty">No films in this decade.</p>
          ) : (
            <ul className="movie-list">
              {filteredToWatch.map((movie) => {
                const subject = movieToDetails(movie, catalogFilms)
                const catalogFilm = findCatalogFilmForMovie(movie, catalogFilms)
                return (
                  <MovieTile
                    key={movie.id}
                    title={movie.title}
                    posterUrl={movie.posterUrl}
                    year={movie.year || null}
                    director={catalogFilm?.director}
                    justAdded={flashId === movie.id}
                    selected={details?.id === subject.id}
                    imdbId={movie.imdbId ?? catalogFilm?.imdbId}
                    tmdbId={movie.id > 0 ? movie.id : catalogFilm?.tmdbId}
                    onSelect={() => selectDetails(subject)}
                    reorderable
                    dragging={watchlistDragId === movie.id}
                    dropTarget={
                      watchlistDropId === movie.id && watchlistDragId !== movie.id
                    }
                    onReorderDragStart={(event) => handleWatchlistDragStart(movie.id, event)}
                    onReorderDragOver={(event) => handleWatchlistDragOver(movie.id, event)}
                    onReorderDragLeave={(event) => handleWatchlistDragLeave(movie.id, event)}
                    onReorderDrop={(event) => handleWatchlistDrop(movie.id, event)}
                    onReorderDragEnd={clearWatchlistDrag}
                    actions={
                      <>
                        <button
                          type="button"
                          className="icon-btn"
                          data-tone="ok"
                          aria-label={`Mark ${movie.title} as watched`}
                          onClick={() => markWatched(movie.id)}
                        >
                          <CheckIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          data-tone="danger"
                          aria-label={`Remove ${movie.title}`}
                          onClick={() => removeMovie(movie.id)}
                        >
                          <RemoveIcon />
                        </button>
                      </>
                    }
                  />
                )
              })}
            </ul>
          )}
        </section>
      </main>

      <MovieDetailsPanel
        movie={panelMovie}
        open={panelOpen}
        note={panelMovie ? getNote(panelMovie.id) : ''}
        catalogFilms={catalogFilms}
        onSaveNote={(text) => {
          if (!panelMovie) return
          setNote(panelMovie.id, text)
        }}
        onSelectFilm={(film) => setDetails(filmToDetails(film))}
        onClose={closeFilmDetails}
      />
    </div>
  )
}
