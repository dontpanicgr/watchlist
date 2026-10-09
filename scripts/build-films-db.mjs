#!/usr/bin/env node
/**
 * Build local film database from YouTube "Top 100" video descriptions + TMDB.
 *
 * Usage:
 *   node scripts/build-films-db.mjs
 *   node scripts/build-films-db.mjs --skip-fetch   # reuse data/raw/*.meta.json
 *   node scripts/build-films-db.mjs --raw-only     # extract titles only (no TMDB)
 *   node scripts/build-films-db.mjs --imdb-only    # add/refresh imdbId on existing films.json
 *
 * Requires VITE_TMDB_API_KEY in .env for enrichment.
 */

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data')
const RAW_DIR = join(DATA_DIR, 'raw')
const SRC_DATA_DIR = join(ROOT, 'src', 'data')
const TMDB_API = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

const VIDEO_IDS = [
  'GPU9TvX5ZTg',
  'If_8e6URJCI',
  'Tvi1usBu7m0',
  'tc1xKIn5Hp8',
  'nqbGxmKbbu8',
]

/** Approximate release-year window per source list (for remake disambiguation). */

/** Hard overrides when search ranking is unreliable (key = lowercase extracted title). */
const FORCE_TMDB_IDS = {
  'close-up': 30017, // Abbas Kiarostami, 1990
  safe: 32646, // Todd Haynes, 1995
  // TMDB English title is the old US dub name; keep the familiar title in our DB.
  nausicaa: { id: 81, title: 'Nausica\u00e4 of the Valley of the Wind' },
  // Remakes / ambiguous short titles
  it: 346364, // Andr뿯½s Muschietti, 2017
  hero: 79, // Zhang Yimou, 2002
  frozen: 109445, // Disney, 2013
  room: 264644, // Lenny Abrahamson, 2015
  burning: 491584, // Lee Chang-dong, 2018
  'cold war': 440298, // Paweł Pawlikowski, 2018
  leviathan: 265180, // Andrey Zvyagintsev, 2014
    once: 5723, // John Carney, 2007
  'wall-e': 10681,
  'y tu mama tambien': 1391,
  'leon the professional': 101,
  santantango: 31414,
}

function resolveForce(entry) {
  if (entry == null) return null
  if (typeof entry === 'number') return { id: entry, title: null }
  return { id: entry.id, title: entry.title ?? null }
}

const VIDEO_DECADES = {
  GPU9TvX5ZTg: [1970, 1979],
  If_8e6URJCI: [1980, 1989],
  Tvi1usBu7m0: [1990, 1999],
  tc1xKIn5Hp8: [2000, 2009],
  nqbGxmKbbu8: [2010, 2019],
}

/** Expand compound list entries into multiple searchable titles. */
const EXPAND_TITLES = {
  'The Godfather I & II': ['The Godfather', 'The Godfather Part II'],
  'Three Colors: Blue/Red/White': [
    'Three Colors: Blue',
    'Three Colors: Red',
    'Three Colors: White',
  ],
}

/**
 * Common description typos / shorthand 뿯↽ better TMDB queries.
 * Keys are lowercased extracted titles.
 */
const QUERY_CORRECTIONS = {
  'aguire, the wrath of god': 'Aguirre, the Wrath of God',
  'dont look now': "Don't Look Now",
  'kramer v kramer': 'Kramer vs. Kramer',
  'french connection': 'The French Connection',
  'jeanne dielman, 32 quai des commerce': 'Jeanne Dielman',
  fittzcaraldo: 'Fitzcarraldo',
  'the killer': 'The Killer',
  'my dinner with andre': 'My Dinner with Andre',
  nausicaa: 'Nausica\u00e4 of the Valley of the Wind',
  "where is the friend's house": "Where Is the Friend's House?",
  'bill and ted': "Bill & Ted's Excellent Adventure",
  bettlejuice: 'Beetlejuice',
  mishima: 'Mishima: A Life in Four Chapters',
  'rambo': 'First Blood',
  'mad max 2': 'Mad Max 2: The Road Warrior',
  goonies: 'The Goonies',
  'blood simple': 'Blood Simple',
  'planes trains and automobiles': 'Planes, Trains and Automobiles',
  'this is spinal tap': 'This Is Spinal Tap',
  'sex lies and videotape': 'Sex, Lies, and Videotape',
  'blues brothers': 'The Blues Brothers',
  'evil dead ii': 'Evil Dead II',
  'rain man': 'Rain Man',
  'when harry met sally...': 'When Harry Met Sally...',
  'the breakfast club': 'The Breakfast Club',
  et: 'E.T. the Extra-Terrestrial',
  'grave of fireflies': 'Grave of the Fireflies',
  'the raiders of the lost ark': 'Raiders of the Lost Ark',
  'glengarry glenross': 'Glengarry Glen Ross',
  'romeo and juliet': 'Romeo + Juliet',
  'double life of veronique': 'The Double Life of Veronique',
  'nightmare before christmas': 'The Nightmare Before Christmas',
  'jerry mcguire': 'Jerry Maguire',
  'edward scissorhands': 'Edward Scissorhands',
  'blair witch project': 'The Blair Witch Project',
  santantango: 'S\u00e1t\u00e1ntang\u00f3',
  'la confidential': 'L.A. Confidential',
  '10 things i hate about you': '10 Things I Hate About You',
  'sixth sense': 'The Sixth Sense',
  'leon the professional': 'L\u00e9on: The Professional',
  'terminator: judgement day': 'Terminator 2: Judgment Day',
  'groundhogs day': 'Groundhog Day',
  'goodwill hunting': 'Good Will Hunting',
  'big lebowski': 'The Big Lebowski',
  'lion king': 'The Lion King',
  seven: 'Se7en',
  matrix: 'The Matrix',
  'shawshank redemption': 'The Shawshank Redemption',
  'silence of the lambs': 'The Silence of the Lambs',
  'investigation of a citizen above suspicion':
    'Investigation of a Citizen Above Suspicion',
  'phantom of the paradise': 'Phantom of the Paradise',
  'the phantom of the paradise': 'Phantom of the Paradise',
  mash: 'M*A*S*H',
  'spirit of the beehive': 'The Spirit of the Beehive',
  mirror: 'Mirror',
  'willy wonka and the chocolate factory':
    'Willy Wonka & the Chocolate Factory',
  'superman: the movie': 'Superman',
  'stranger than paradise': 'Stranger Than Paradise',
  'the emigrants': 'The Emigrants',
  'life of brian': "Monty Python's Life of Brian",
  'star wars': 'Star Wars',
  'hannah and her sisters': 'Hannah and Her Sisters',
  'pretty in pink': 'Pretty in Pink',
  'risky business': 'Risky Business',
  'dirty dancing': 'Dirty Dancing',
  'return of the jedi': 'Return of the Jedi',
  'an american werewolf in london': 'An American Werewolf in London',
  'dead poet\'s society': "Dead Poets Society",
  'once upon a time in america': 'Once Upon a Time in America',
  robocop: 'RoboCop',
  'dances with wolves': 'Dances with Wolves',
  'hard boiled': 'Hard Boiled',
  'beau travail': 'Beau Travail',
  'wild at heart': 'Wild at Heart',
  "wayne's world": "Wayne's World",
  'eternity and a day': 'Eternity and a Day',
  'prince of egypt': 'The Prince of Egypt',
  'boyz n the hood': "Boyz n the Hood",
  'life is beautiful': 'Life Is Beautiful',
  'a brighter summer day': 'A Brighter Summer Day',
  'chungking express': 'Chungking Express',
  'boogie nights': 'Boogie Nights',
  'saving private ryan': 'Saving Private Ryan',
  'reservoir dogs': 'Reservoir Dogs',
  'fight club': 'Fight Club',
  'jurassic park': 'Jurassic Park',
  'goodfellas': 'GoodFellas',
  "schindler's list": "Schindler's List",
  'pulp fiction': 'Pulp Fiction',
  'american beauty': 'American Beauty',
  titanic: 'Titanic',
  'forrest gump': 'Forrest Gump',
  heat: 'Heat',
  'la haine': 'La Haine',
  'before sunrise': 'Before Sunrise',
  'the truman show': 'The Truman Show',
  'close-up': 'Close-Up',
  'dazed and confused': 'Dazed and Confused',
  unforgiven: 'Unforgiven',
  'princess mononoke': 'Princess Mononoke',
  magnolia: 'Magnolia',
  'the iron giant': 'The Iron Giant',
  clueless: 'Clueless',
  'beauty and the beast': 'Beauty and the Beast',
  'being john malkovich': 'Being John Malkovich',
  'eyes wide shut': 'Eyes Wide Shut',
  'perfect blue': 'Perfect Blue',
  trainspotting: 'Trainspotting',
  'the thin red line': 'The Thin Red Line',
  'malcolm x': 'Malcolm X',
  'thelma and louise': 'Thelma & Louise',
  rushmore: 'Rushmore',
  'barton fink': 'Barton Fink',
  'toy story 2': 'Toy Story 2',
  'the usual suspects': 'The Usual Suspects',
  'home alone': 'Home Alone',
  scream: 'Scream',
  'the green mile': 'The Green Mile',
  casino: 'Casino',
  'american history x': 'American History X',
  jfk: 'JFK',
  'the fugitive': 'The Fugitive',
  'the piano': 'The Piano',
  naked: 'Naked',
  'the english patient': "The English Patient",
  "you've got mail": "You've Got Mail",
  election: 'Election',
  'men in black': 'Men in Black',
  'jackie brown': 'Jackie Brown',
  safe: 'Safe',
  'pretty woman': 'Pretty Woman',
  'starship troopers': 'Starship Troopers',
  'ed wood': 'Ed Wood',
  clerks: 'Clerks',
  'dead man': 'Dead Man',
  aladdin: 'Aladdin',
  swingers: 'Swingers',
  'raise the red lantern': 'Raise the Red Lantern',
  'fear and loathing in las vegas': 'Fear and Loathing in Las Vegas',
  braveheart: 'Braveheart',
  'independence day': 'Independence Day',
  'space jam': 'Space Jam',
  babe: 'Babe',
  speed: 'Speed',
  'office space': 'Office Space',
  'sleepless in seattle': 'Sleepless in Seattle',
  // 2000s
  'oceans 11': "Ocean's Eleven",
  'punch drunk love': 'Punch-Drunk Love',
  'pirates of the caribbean: curse of the black pearl':
    'Pirates of the Caribbean: The Curse of the Black Pearl',
  'spider man 2': 'Spider-Man 2',
  'wall-e': 'WALL-E',
  '4 months, 3 weeks, 2 days': '4 Months, 3 Weeks and 2 Days',
  'harry potter and the sorcerers stone':
    "Harry Potter and the Sorcerer's Stone",
  'catch me if you can': 'Catch Me If You Can',
  'y tu mama tambien': 'Y tu mam\u00e1 tambi\u00e9n',
  '500 days of summer': '(500) Days of Summer',
  anchorman: 'Anchorman: The Legend of Ron Burgundy',
  'bourne ultimatum': 'The Bourne Ultimatum',
  'lord of the rings: two towers':
    'The Lord of the Rings: The Two Towers',
  '40 year old virgin': 'The 40-Year-Old Virgin',
  'synecdoche new york': 'Synecdoche, New York',
  amelie: 'Am\u00e9lie',
  'kill bill: vol i': 'Kill Bill: Vol. 1',
  'lord of the rings: fellowship of the rings':
    'The Lord of the Rings: The Fellowship of the Ring',
  'crouching tiger hidden dragon': 'Crouching Tiger, Hidden Dragon',
  'pans labyrinth': "Pan's Labyrinth",
  'no country for old men': 'No Country for Old Men',
  'the lord of the rings: return of the king':
    'The Lord of the Rings: The Return of the King',
  'fantastic mr. fox': 'Fantastic Mr. Fox',
  'mulholland drive': 'Mulholland Drive',
  'o brother, where art thou?': 'O Brother, Where Art Thou?',
  'i\'m not there': "I'm Not There",
  'enter the void': 'Enter the Void',
  'moulin rouge!': 'Moulin Rouge!',
  // 2010s
  'the king’s speech': "The King's Speech",
  "the king's speech": "The King's Speech",
  'three billboards': 'Three Billboards Outside Ebbing, Missouri',
  'a star is born': 'A Star Is Born',
  'once upon a time in hollywood': 'Once Upon a Time… in Hollywood',
  'how to train your dragon': 'How to Train Your Dragon',
  'ghost story': 'A Ghost Story',
  'mission impossible fallout': 'Mission: Impossible – Fallout',
  'inside llewelyn davis': 'Inside Llewyn Davis',
  'spider man: into the spider verse':
    'Spider-Man: Into the Spider-Verse',
  'scott pilgrim': 'Scott Pilgrim vs. the World',
  'call me by your name': 'Call Me by Your Name',
  'wolf of wall street': 'The Wolf of Wall Street',
  'mad max fury road': 'Mad Max: Fury Road',
  'guardians of the galaxy': 'Guardians of the Galaxy',
  'the avengers': 'The Avengers',
  'silver linings playbook': 'Silver Linings Playbook',
  'dallas buyers club': 'Dallas Buyers Club',
  'hell or high water': 'Hell or High Water',
  'under the skin': 'Under the Skin',
  'the handmaiden': 'The Handmaiden',
  'the florida project': 'The Florida Project',
  '21 jump street': '21 Jump Street',
  'the shape of water': 'The Shape of Water',
  'it follows': 'It Follows',
  'eighth grade': 'Eighth Grade',
  'django unchained': 'Django Unchained',
  'black swan': 'Black Swan',
  'moonrise kingdom': 'Moonrise Kingdom',
  'sing street': 'Sing Street',
  'the favourite': 'The Favourite',
  'manchester by the sea': 'Manchester by the Sea',
  'blade runner 2049': 'Blade Runner 2049',
  'the irishman': 'The Irishman',
  '12 years a slave': '12 Years a Slave',
  'before midnight': 'Before Midnight',
  'marriage story': 'Marriage Story',
  'the revenant': 'The Revenant',
  'phantom thread': 'Phantom Thread',
  'zero dark thirty': 'Zero Dark Thirty',
  'a separation': 'A Separation',
  'get out': 'Get Out',
  'the tree of life': 'The Tree of Life',
  'the grand budapest hotel': 'The Grand Budapest Hotel',
  'the social network': 'The Social Network',
  boyhood: 'Boyhood',
  whiplash: 'Whiplash',
  inception: 'Inception',
  moonlight: 'Moonlight',
  parasite: 'Parasite',
  'lady bird': 'Lady Bird',
  her: 'Her',
  roma: 'Roma',
  'la la land': 'La La Land',
  birdman: 'Birdman',
  drive: 'Drive',
  'beasts of the southern wild': 'Beasts of the Southern Wild',
  'first reformed': 'First Reformed',
  'paddington 2': 'Paddington 2',
  'the lego movie': 'The Lego Movie',
  'the big short': 'The Big Short',
  'spring breakers': 'Spring Breakers',
  dogtooth: 'Dogtooth',
  nightcrawler: 'Nightcrawler',
  'the farewell': 'The Farewell',
  'the babadook': 'The Babadook',
  dunkirk: 'Dunkirk',
  'black panther': 'Black Panther',
  deadpool: 'Deadpool',
  prisoners: 'Prisoners',
  'wonder woman': 'Wonder Woman',
  'american sniper': 'American Sniper',
  'baby driver': 'Baby Driver',
  '127 hours': '127 Hours',
  melancholia: 'Melancholia',
  elle: 'Elle',
  'john wick': 'John Wick',
  carol: 'Carol',
  'gone girl': 'Gone Girl',
  arrival: 'Arrival',
  logan: 'Logan',
  hereditary: 'Hereditary',
  gravity: 'Gravity',
  coco: 'Coco',
  bridesmaids: 'Bridesmaids',
  skyfall: 'Skyfall',
  shoplifters: 'Shoplifters',
  amour: 'Amour',
  'toy story 3': 'Toy Story 3',
  'inside out': 'Inside Out',
  spotlight: 'Spotlight',
  interstellar: 'Interstellar',
  'the master': 'The Master',
}

const NOISE_PATTERNS = [
  /^make sure to follow/i,
  /^the definitive top/i,
  /^this list was compiled/i,
  /instagram|tiktok|subscribe|sponsor|patreon|http/i,
  /^@\w+/,
]

const args = new Set(process.argv.slice(2))
const skipFetch = args.has('--skip-fetch')
const rawOnly = args.has('--raw-only')
const imdbOnly = args.has('--imdb-only')

function readJson(filePath) {
  const text = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  return JSON.parse(text)
}

function loadEnv() {
  const envPath = join(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function findYtDlp() {
  const local = join(ROOT, 'tools', 'yt-dlp.exe')
  if (existsSync(local)) return local
  const localBin = join(ROOT, 'tools', 'yt-dlp')
  if (existsSync(localBin)) return localBin
  return 'yt-dlp'
}

function fetchVideoMeta(videoId) {
  const metaPath = join(RAW_DIR, `${videoId}.meta.json`)
  if (skipFetch && existsSync(metaPath)) {
    return readJson(metaPath)
  }

  // Prefer already-dumped full yt-dlp JSON if present
  const dumpPath = join(RAW_DIR, `${videoId}.json`)
  if (existsSync(dumpPath) && (skipFetch || !existsSync(metaPath))) {
    const dump = readJson(dumpPath)
    const meta = {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: dump.title ?? null,
      description: dump.description ?? '',
    }
    writeFileSync(metaPath, JSON.stringify(meta, null, 2))
    return meta
  }

  if (skipFetch) {
    throw new Error(`Missing cached meta for ${videoId}. Re-run without --skip-fetch.`)
  }

  const ytDlp = findYtDlp()
  const url = `https://www.youtube.com/watch?v=${videoId}`
  console.log(`Fetching ${url} via ${ytDlp}…`)
  const result = spawnSync(
    ytDlp,
    ['--dump-json', '--skip-download', '--no-warnings', url],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    throw new Error(
      `yt-dlp failed for ${videoId}: ${result.stderr || result.stdout || result.error}`,
    )
  }
  const dump = JSON.parse(result.stdout)
  writeFileSync(dumpPath, JSON.stringify(dump))
  const meta = {
    videoId,
    url,
    title: dump.title ?? null,
    description: dump.description ?? '',
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  return meta
}

function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled'
}

function isNoiseLine(line) {
  const t = line.trim()
  if (!t) return true
  if (NOISE_PATTERNS.some((re) => re.test(t))) return true
  // timestamps like 0:00 or 12:34
  if (/^\d{1,2}:\d{2}(?::\d{2})?\b/.test(t)) return true
  return false
}

function expandTitle(title) {
  return EXPAND_TITLES[title] ?? [title]
}

function extractTitles(description) {
  const titles = []
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (isNoiseLine(line)) continue
    // Older lists: "100 Title"; 2000s/2010s lists: "100. Title"
    const match = line.match(/^(\d{1,3})\.?\s+(.+)$/)
    if (!match) continue
    const rank = Number(match[1])
    const title = match[2].replace(/\s+/g, ' ').trim()
    if (!title) continue
    for (const expanded of expandTitle(title)) {
      titles.push({ rank, extractedTitle: expanded, rawLine: title })
    }
  }
  return titles
}

function queryForTitle(title) {
  const corrected = QUERY_CORRECTIONS[title.toLowerCase()]
  return corrected ?? title
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function tmdbSearch(apiKey, query, year) {
  const url = new URL(`${TMDB_API}/search/movie`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('query', query)
  url.searchParams.set('include_adult', 'false')
  if (year != null) url.searchParams.set('year', String(year))
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`TMDB search failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  return data.results ?? []
}

function mergeResults(...lists) {
  const map = new Map()
  for (const list of lists) {
    for (const item of list) {
      if (!map.has(item.id)) map.set(item.id, item)
    }
  }
  return [...map.values()]
}

async function tmdbDirector(apiKey, movieId) {
  const url = new URL(`${TMDB_API}/movie/${movieId}/credits`)
  url.searchParams.set('api_key', apiKey)
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`TMDB credits failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  const directors = (data.crew ?? []).filter((c) => c.job === 'Director')
  return directors[0]?.name ?? null
}

function normalizeTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function yearOf(result) {
  if (!result.release_date) return null
  const y = Number(result.release_date.slice(0, 4))
  return Number.isFinite(y) ? y : null
}

function decadeRangeForVideoIds(videoIds) {
  const ranges = videoIds
    .map((id) => VIDEO_DECADES[id])
    .filter(Boolean)
  if (!ranges.length) return null
  return [
    Math.min(...ranges.map((r) => r[0])),
    Math.max(...ranges.map((r) => r[1])),
  ]
}

function pickBestResult(results, query, yearRange) {
  if (!results.length) return null
  const q = normalizeTitle(query)

  const scored = results.map((r, index) => {
    const title = normalizeTitle(r.title)
    const original = normalizeTitle(r.original_title)
    const year = yearOf(r)
    let score = 0

    if (title === q || original === q) score += 100
    else if (title.startsWith(q) || q.startsWith(title)) score += 40
    else if (title.includes(q) || q.includes(title)) score += 20

    if (yearRange && year != null) {
      const [lo, hi] = yearRange
      if (year >= lo && year <= hi) score += 80
      else if (year >= lo - 2 && year <= hi + 2) score += 40
      else if (year >= lo - 5 && year <= hi + 5) score += 10
      else score -= 50
    }

    // Prefer higher popularity lightly when otherwise tied
    score += Math.min(10, (r.popularity || 0) / 50)
    // Stable tie-break: earlier search rank
    score -= index * 0.01
    return { r, score, year }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].r
}

async function tmdbMovie(apiKey, id) {
  const url = new URL(`${TMDB_API}/movie/${id}`)
  url.searchParams.set('api_key', apiKey)
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`TMDB movie failed (${res.status}): ${body}`)
  }
  return res.json()
}

async function tmdbImdbId(apiKey, movieId) {
  const url = new URL(`${TMDB_API}/movie/${movieId}/external_ids`)
  url.searchParams.set('api_key', apiKey)
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`TMDB external_ids failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  const imdbId = data.imdb_id
  if (typeof imdbId !== 'string') return null
  const trimmed = imdbId.trim()
  return /^tt\d+$/i.test(trimmed) ? trimmed.toLowerCase() : null
}

async function enrichFilm(apiKey, extractedTitle, videoIds = []) {
  const query = queryForTitle(extractedTitle)
  const forced = resolveForce(FORCE_TMDB_IDS[extractedTitle.toLowerCase()])
  if (forced != null) {
    const movie = await tmdbMovie(apiKey, forced.id)
    await sleep(40)
    const director = await tmdbDirector(apiKey, forced.id)
    await sleep(40)
    const imdbId = await tmdbImdbId(apiKey, forced.id)
    await sleep(40)
    const year = movie.release_date
      ? Number(movie.release_date.slice(0, 4)) || null
      : null
    return {
      id: `tmdb-${movie.id}`,
      tmdbId: movie.id,
      imdbId,
      title: forced.title || movie.title,
      year,
      director,
      coverUrl: movie.poster_path ? `${IMAGE_BASE}${movie.poster_path}` : null,
      sourceVideoIds: [],
      _extractedTitle: extractedTitle,
      _query: query,
      _matched: true,
    }
  }
  const yearRange = decadeRangeForVideoIds(videoIds)
  let results = await tmdbSearch(apiKey, query)
  await sleep(40)
  let best = pickBestResult(results, query, yearRange)

  // If the best hit is outside the source decade, retry with a year-filtered search.
  if (best && yearRange) {
    const y = yearOf(best)
    if (y == null || y < yearRange[0] - 3 || y > yearRange[1] + 3) {
      const mid = Math.round((yearRange[0] + yearRange[1]) / 2)
      const extra = await tmdbSearch(apiKey, query, mid)
      await sleep(40)
      results = mergeResults(extra, results)
      best = pickBestResult(results, query, yearRange)
    }
  }

  if (!best) {
    return {
      id: `unmatched-${slugify(extractedTitle)}`,
      tmdbId: null,
      imdbId: null,
      title: extractedTitle,
      year: null,
      director: null,
      coverUrl: null,
      sourceVideoIds: [],
      _extractedTitle: extractedTitle,
      _query: query,
      _matched: false,
    }
  }
  const director = await tmdbDirector(apiKey, best.id)
  await sleep(40)
  const imdbId = await tmdbImdbId(apiKey, best.id)
  await sleep(40)
  const year = best.release_date
    ? Number(best.release_date.slice(0, 4)) || null
    : null
  return {
    id: `tmdb-${best.id}`,
    tmdbId: best.id,
    imdbId,
    title: best.title,
    year,
    director,
    coverUrl: best.poster_path ? `${IMAGE_BASE}${best.poster_path}` : null,
    sourceVideoIds: [],
    _extractedTitle: extractedTitle,
    _query: query,
    _matched: true,
  }
}

function mergeByIdentity(films) {
  /** @type {Map<string, any>} */
  const map = new Map()
  for (const film of films) {
    const key = film.tmdbId != null ? `tmdb:${film.tmdbId}` : `title:${slugify(film.title)}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        ...film,
        sourceVideoIds: [...new Set(film.sourceVideoIds)].sort(),
      })
      continue
    }
    existing.sourceVideoIds = [
      ...new Set([...existing.sourceVideoIds, ...film.sourceVideoIds]),
    ].sort()
  }
  return [...map.values()]
}

function stripInternal(film) {
  const {
    _extractedTitle: _e,
    _query: _q,
    _matched: _m,
    ...rest
  } = film
  return rest
}

async function enrichExistingImdbIds(apiKey) {
  const srcPath = join(SRC_DATA_DIR, 'films.json')
  const dataPath = join(DATA_DIR, 'films.json')
  const path = existsSync(srcPath) ? srcPath : dataPath
  if (!existsSync(path)) {
    throw new Error('No films.json found to enrich. Run a full build first.')
  }
  const payload = readJson(path)
  const films = payload.films ?? []
  let withImdb = 0
  let fetched = 0
  let missing = 0
  let skipped = 0

  console.log(`Enriching IMDb ids for ${films.length} films…`)
  for (let i = 0; i < films.length; i += 1) {
    const film = films[i]
    if (typeof film.imdbId === 'string' && /^tt\d+$/i.test(film.imdbId)) {
      film.imdbId = film.imdbId.toLowerCase()
      withImdb += 1
      skipped += 1
      continue
    }
    if (film.tmdbId == null) {
      film.imdbId = null
      missing += 1
      continue
    }
    process.stdout.write(`  [${i + 1}/${films.length}] ${film.title}… `)
    try {
      const imdbId = await tmdbImdbId(apiKey, film.tmdbId)
      await sleep(40)
      film.imdbId = imdbId
      if (imdbId) {
        withImdb += 1
        fetched += 1
        console.log(imdbId)
      } else {
        missing += 1
        console.log('none')
      }
    } catch (err) {
      console.log('ERROR')
      throw err
    }
  }

  payload.generatedAt = new Date().toISOString()
  writeOutputs(payload)
  console.log(
    `\nDone (imdb-only). films=${films.length} withImdb=${withImdb} fetched=${fetched} skipped=${skipped} missing=${missing}`,
  )
}

async function main() {
  loadEnv()
  mkdirSync(RAW_DIR, { recursive: true })
  mkdirSync(SRC_DATA_DIR, { recursive: true })

  if (imdbOnly) {
    const apiKey = process.env.VITE_TMDB_API_KEY
    if (!apiKey) {
      throw new Error('VITE_TMDB_API_KEY required for --imdb-only')
    }
    await enrichExistingImdbIds(apiKey)
    return
  }

  const sources = []
  /** @type {{ videoId: string, rank: number, extractedTitle: string, rawLine: string }[]} */
  const extracted = []

  for (const videoId of VIDEO_IDS) {
    const meta = fetchVideoMeta(videoId)
    sources.push({
      videoId: meta.videoId,
      url: meta.url,
      title: meta.title,
    })
    for (const item of extractTitles(meta.description)) {
      extracted.push({ videoId, ...item })
    }
    console.log(
      `${videoId}: extracted ${extractTitles(meta.description).length} title entries`,
    )
  }

  const rawPayload = {
    generatedAt: new Date().toISOString(),
    sources,
    titles: extracted.map((t) => ({
      videoId: t.videoId,
      rank: t.rank,
      title: t.extractedTitle,
      rawLine: t.rawLine,
    })),
  }
  writeFileSync(
    join(DATA_DIR, 'films.raw.json'),
    JSON.stringify(rawPayload, null, 2) + '\n',
  )
  console.log(`Wrote data/films.raw.json (${extracted.length} title rows)`)

  const apiKey = process.env.VITE_TMDB_API_KEY
  if (rawOnly || !apiKey) {
    if (!apiKey) {
      console.warn(
        '\nNo VITE_TMDB_API_KEY in .env — writing unmatched stubs to films.json.\n' +
          'Add your TMDB key to .env and re-run: npm run build:films\n',
      )
    }
    const stubFilms = mergeByIdentity(
      extracted.map((t) => ({
        id: `unmatched-${slugify(t.extractedTitle)}`,
        tmdbId: null,
        imdbId: null,
        title: t.extractedTitle,
        year: null,
        director: null,
        coverUrl: null,
        sourceVideoIds: [t.videoId],
      })),
    ).map(stripInternal)

    stubFilms.sort((a, b) => a.title.localeCompare(b.title))
    const payload = {
      generatedAt: new Date().toISOString(),
      sources,
      films: stubFilms,
    }
    writeOutputs(payload)
    console.log(
      `Done (raw/unmatched). films=${stubFilms.length} matched=0 unmatched=${stubFilms.length}`,
    )
    return
  }

  // Deduplicate enrichment work by extracted title (case-insensitive)
  /** @type {Map<string, { title: string, videoIds: Set<string> }>} */
  const unique = new Map()
  for (const t of extracted) {
    const key = t.extractedTitle.toLowerCase()
    const entry = unique.get(key)
    if (!entry) {
      unique.set(key, {
        title: t.extractedTitle,
        videoIds: new Set([t.videoId]),
      })
    } else {
      entry.videoIds.add(t.videoId)
    }
  }

  console.log(`Enriching ${unique.size} unique titles via TMDB…`)
  const enriched = []
  let i = 0
  for (const { title, videoIds } of unique.values()) {
    i += 1
    process.stdout.write(`  [${i}/${unique.size}] ${title}… `)
    try {
      const film = await enrichFilm(apiKey, title, [...videoIds])
      film.sourceVideoIds = [...videoIds].sort()
      enriched.push(film)
      console.log(film._matched ? `뿯↽ ${film.title} (${film.year})` : 'UNMATCHED')
    } catch (err) {
      console.log('ERROR')
      throw err
    }
  }

  const films = mergeByIdentity(enriched)
    .map(stripInternal)
    .sort((a, b) => a.title.localeCompare(b.title))

  const matched = films.filter((f) => f.tmdbId != null).length
  const unmatched = films.filter((f) => f.tmdbId == null)

  const payload = {
    generatedAt: new Date().toISOString(),
    sources,
    films,
  }
  writeOutputs(payload)

  writeFileSync(
    join(DATA_DIR, 'films.unmatched.json'),
    JSON.stringify(
      unmatched.map((f) => f.title),
      null,
      2,
    ) + '\n',
  )

  console.log(
    `\nDone. films=${films.length} matched=${matched} unmatched=${unmatched.length}`,
  )
  if (unmatched.length) {
    console.log('Unmatched titles:')
    for (const f of unmatched) console.log(`  - ${f.title}`)
  }
}

function writeOutputs(payload) {
  const json = JSON.stringify(payload, null, 2) + '\n'
  writeFileSync(join(DATA_DIR, 'films.json'), json)
  writeFileSync(join(SRC_DATA_DIR, 'films.json'), json)
  console.log('Wrote data/films.json')
  console.log('Wrote src/data/films.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
