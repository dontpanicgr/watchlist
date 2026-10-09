export type Movie = {
  id: number
  title: string
  year: string
  posterUrl: string | null
  overview: string
  /** IMDb id (`tt…`) when known (catalog films); search/queue may omit. */
  imdbId?: string | null
}

export type QueuedMovie = Movie & {
  status: 'to-watch' | 'watched'
  addedAt: string
  watchedAt?: string
}
