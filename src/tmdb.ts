import type { Movie } from './types'

const API_BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w185'

/** Upgrade a search/list poster URL to catalog w500 size when possible. */
export function toCatalogCoverUrl(posterUrl: string | null): string | null {
  if (!posterUrl) return null
  return posterUrl.replace(/\/t\/p\/w\d+\//, '/t/p/w500/')
}

type TmdbMovie = {
  id: number
  title: string
  release_date?: string
  poster_path: string | null
  overview: string
}

type SearchResponse = {
  results: TmdbMovie[]
}

function getApiKey(): string {
  const key = import.meta.env.VITE_TMDB_API_KEY
  if (!key || typeof key !== 'string') {
    throw new Error('Missing TMDB API key. Add VITE_TMDB_API_KEY to your .env file.')
  }
  return key
}

function mapMovie(item: TmdbMovie): Movie {
  return {
    id: item.id,
    title: item.title,
    year: item.release_date?.slice(0, 4) ?? '',
    posterUrl: item.poster_path ? `${IMAGE_BASE}${item.poster_path}` : null,
    overview: item.overview ?? '',
  }
}

export async function searchMovies(query: string): Promise<Movie[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const url = new URL(`${API_BASE}/search/movie`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('query', trimmed)
  url.searchParams.set('include_adult', 'false')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Could not search movies. Try again.')
  }

  const data = (await response.json()) as SearchResponse
  return data.results.slice(0, 8).map(mapMovie)
}

type ExternalIdsResponse = {
  imdb_id?: string | null
}

/** Resolve IMDb id (`tt…`) for a TMDB movie, or null if unavailable. */
export async function fetchMovieImdbId(tmdbId: number): Promise<string | null> {
  const url = new URL(`${API_BASE}/movie/${tmdbId}/external_ids`)
  url.searchParams.set('api_key', getApiKey())

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Could not look up IMDb id.')
  }

  const data = (await response.json()) as ExternalIdsResponse
  const imdbId = data.imdb_id
  if (!imdbId || typeof imdbId !== 'string') return null
  const trimmed = imdbId.trim()
  return /^tt\d+$/i.test(trimmed) ? trimmed.toLowerCase() : null
}

type CreditsResponse = {
  crew?: Array<{ job?: string; name?: string }>
}

/** Resolve primary Director credit for a TMDB movie, or null if unavailable. */
export async function fetchMovieDirector(tmdbId: number): Promise<string | null> {
  const url = new URL(`${API_BASE}/movie/${tmdbId}/credits`)
  url.searchParams.set('api_key', getApiKey())

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Could not look up director.')
  }

  const data = (await response.json()) as CreditsResponse
  const director = data.crew?.find((person) => person.job === 'Director')
  const name = director?.name?.trim()
  return name || null
}

type MovieDetailsResponse = {
  overview?: string | null
}

type TmdbImage = {
  file_path: string
  vote_average?: number
  width?: number
}

type MovieImagesResponse = {
  backdrops?: TmdbImage[]
}

export type MovieDetails = {
  overview: string
}

export type MovieStill = {
  url: string
  filePath: string
}

const STILL_IMAGE_BASE = 'https://image.tmdb.org/t/p/w780'
const STILL_FULL_IMAGE_BASE = 'https://image.tmdb.org/t/p/w1280'

/** Larger TMDB still URL for lightbox / full view. */
export function toLargeStillUrl(still: MovieStill): string {
  return `${STILL_FULL_IMAGE_BASE}${still.filePath}`
}
const detailsCache = new Map<number, MovieDetails>()
const imagesCache = new Map<number, MovieStill[]>()
const trailerCache = new Map<number, MovieTrailer | null>()

type TmdbVideo = {
  id?: string
  key?: string
  name?: string
  site?: string
  type?: string
  official?: boolean
  published_at?: string
}

type MovieVideosResponse = {
  results?: TmdbVideo[]
}

export type MovieTrailer = {
  key: string
  name: string
  embedUrl: string
  watchUrl: string
}

/** Fetch movie plot/overview from TMDB (cached by tmdbId). */
export async function fetchMovieDetails(tmdbId: number): Promise<MovieDetails> {
  const cached = detailsCache.get(tmdbId)
  if (cached) return cached

  const url = new URL(`${API_BASE}/movie/${tmdbId}`)
  url.searchParams.set('api_key', getApiKey())

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Could not load movie details.')
  }

  const data = (await response.json()) as MovieDetailsResponse
  const details: MovieDetails = {
    overview: (data.overview ?? '').trim(),
  }
  detailsCache.set(tmdbId, details)
  return details
}

/** Fetch backdrop stills from TMDB images API (cached by tmdbId). */
export async function fetchMovieImages(tmdbId: number): Promise<MovieStill[]> {
  const cached = imagesCache.get(tmdbId)
  if (cached) return cached

  const url = new URL(`${API_BASE}/movie/${tmdbId}/images`)
  url.searchParams.set('api_key', getApiKey())

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Could not load movie images.')
  }

  const data = (await response.json()) as MovieImagesResponse
  const backdrops = [...(data.backdrops ?? [])]
    .filter((img) => Boolean(img.file_path))
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, 20)

  const stills: MovieStill[] = backdrops.map((img) => ({
    filePath: img.file_path,
    url: `${STILL_IMAGE_BASE}${img.file_path}`,
  }))
  imagesCache.set(tmdbId, stills)
  return stills
}

function pickYoutubeTrailer(videos: TmdbVideo[]): MovieTrailer | null {
  const youtube = videos.filter(
    (video) =>
      video.site === 'YouTube' &&
      typeof video.key === 'string' &&
      video.key.trim().length > 0,
  )
  if (youtube.length === 0) return null

  const scored = [...youtube].sort((a, b) => {
    const score = (video: TmdbVideo) => {
      let value = 0
      if (video.type === 'Trailer') value += 100
      else if (video.type === 'Teaser') value += 40
      if (video.official) value += 50
      const name = (video.name ?? '').toLowerCase()
      if (name.includes('official trailer')) value += 30
      else if (name.includes('trailer')) value += 15
      return value
    }
    return score(b) - score(a)
  })

  const best = scored[0]
  const key = best.key!.trim()
  return {
    key,
    name: (best.name ?? 'Trailer').trim() || 'Trailer',
    embedUrl: `https://www.youtube.com/embed/${key}`,
    watchUrl: `https://www.youtube.com/watch?v=${key}`,
  }
}

/** Prefer an official YouTube trailer from TMDB videos (cached by tmdbId). */
export async function fetchMovieTrailer(tmdbId: number): Promise<MovieTrailer | null> {
  if (trailerCache.has(tmdbId)) return trailerCache.get(tmdbId) ?? null

  const url = new URL(`${API_BASE}/movie/${tmdbId}/videos`)
  url.searchParams.set('api_key', getApiKey())

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Could not load movie trailer.')
  }

  const data = (await response.json()) as MovieVideosResponse
  const trailer = pickYoutubeTrailer(data.results ?? [])
  trailerCache.set(tmdbId, trailer)
  return trailer
}

export function hasApiKey(): boolean {
  const key = import.meta.env.VITE_TMDB_API_KEY
  return Boolean(key && typeof key === 'string')
}
