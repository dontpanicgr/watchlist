#!/usr/bin/env node
/**
 * Validate local films.json against YouTube Top-100 description lists.
 * Read-only: does not modify films.json.
 *
 * Usage:
 *   node scripts/validate-films-db.mjs
 *   node scripts/validate-films-db.mjs --fresh   # re-fetch via yt-dlp
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data')
const RAW_DIR = join(DATA_DIR, 'raw')
const SRC_DATA = join(ROOT, 'src', 'data', 'films.json')
const DATA_FILMS = join(DATA_DIR, 'films.json')

const VIDEO_IDS = ['GPU9TvX5ZTg', 'If_8e6URJCI', 'Tvi1usBu7m0']

const EXPAND_TITLES = {
  'The Godfather I & II': ['The Godfather', 'The Godfather Part II'],
  'Three Colors: Blue/Red/White': [
    'Three Colors: Blue',
    'Three Colors: Red',
    'Three Colors: White',
  ],
}

const QUERY_CORRECTIONS = {
  'aguire, the wrath of god': 'Aguirre, the Wrath of God',
  'dont look now': "Don't Look Now",
  'kramer v kramer': 'Kramer vs. Kramer',
  'french connection': 'The French Connection',
  'jeanne dielman, 32 quai des commerce': 'Jeanne Dielman',
  fittzcaraldo: 'Fitzcarraldo',
  'the killer': 'The Killer',
  'my dinner with andre': 'My Dinner with Andre',
  nausicaa: 'Nausicaä of the Valley of the Wind',
  "where is the friend's house": "Where Is the Friend's House?",
  'bill and ted': "Bill & Ted's Excellent Adventure",
  bettlejuice: 'Beetlejuice',
  mishima: 'Mishima: A Life in Four Chapters',
  rambo: 'First Blood',
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
  santantango: 'Sátántangó',
  'la confidential': 'L.A. Confidential',
  '10 things i hate about you': '10 Things I Hate About You',
  'sixth sense': 'The Sixth Sense',
  'leon the professional': 'Léon: The Professional',
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
  "dead poet's society": 'Dead Poets Society',
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
  goodfellas: 'GoodFellas',
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
  'the english patient': 'The English Patient',
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
}

const NOISE_PATTERNS = [
  /^make sure to follow/i,
  /^the definitive top/i,
  /^this list was compiled/i,
  /instagram|tiktok|subscribe|sponsor|patreon|http/i,
  /^@\w+/,
]

const fresh = process.argv.includes('--fresh')

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function findYtDlp() {
  const local = join(ROOT, 'tools', 'yt-dlp.exe')
  if (existsSync(local)) return local
  const localBin = join(ROOT, 'tools', 'yt-dlp')
  if (existsSync(localBin)) return localBin
  return 'yt-dlp'
}

function loadDescription(videoId) {
  const candidates = [
    join(RAW_DIR, `${videoId}.validate.json`),
    join(RAW_DIR, `${videoId}.meta.json`),
    join(RAW_DIR, `${videoId}.json`),
  ]

  if (fresh) {
    const ytDlp = findYtDlp()
    const url = `https://www.youtube.com/watch?v=${videoId}`
    console.error(`Fetching ${url}…`)
    const result = spawnSync(
      ytDlp,
      ['--dump-json', '--skip-download', '--no-warnings', url],
      { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
    )
    if (result.status !== 0) {
      throw new Error(`yt-dlp failed for ${videoId}: ${result.stderr || result.stdout}`)
    }
    const dump = JSON.parse(result.stdout)
    writeFileSync(join(RAW_DIR, `${videoId}.validate.json`), JSON.stringify(dump))
    return {
      videoId,
      title: dump.title ?? null,
      description: dump.description ?? '',
      sourcePath: join(RAW_DIR, `${videoId}.validate.json`),
    }
  }

  for (const path of candidates) {
    if (!existsSync(path)) continue
    const dump = readJson(path)
    return {
      videoId,
      title: dump.title ?? null,
      description: dump.description ?? '',
      sourcePath: path,
    }
  }
  throw new Error(`No cached description for ${videoId}`)
}

function isNoiseLine(line) {
  const t = line.trim()
  if (!t) return true
  if (NOISE_PATTERNS.some((re) => re.test(t))) return true
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

function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function queryForTitle(title) {
  return QUERY_CORRECTIONS[title.toLowerCase()] ?? title
}

function filmMatchKeys(film) {
  const keys = new Set()
  keys.add(norm(film.title))
  if (film.imdbId) keys.add(`imdb:${film.imdbId.toLowerCase()}`)
  if (film.tmdbId != null) keys.add(`tmdb:${film.tmdbId}`)
  return keys
}

function main() {
  const filmsPath = existsSync(SRC_DATA) ? SRC_DATA : DATA_FILMS
  const dataPath = DATA_FILMS
  const payload = readJson(filmsPath)
  const films = payload.films ?? []

  const dataSame =
    existsSync(dataPath) &&
    readFileSync(filmsPath, 'utf8') === readFileSync(dataPath, 'utf8')

  console.log('=== Films DB validation ===')
  console.log(`Checked: ${filmsPath}`)
  console.log(`Also:    ${dataPath} (${dataSame ? 'identical' : 'DIFFERS'})`)
  console.log(`DB films: ${films.length}`)
  console.log(`Intentional expansions: ${Object.keys(EXPAND_TITLES).join('; ')}`)
  console.log('')

  let overallPass = true
  const reports = []

  for (const videoId of VIDEO_IDS) {
    const meta = loadDescription(videoId)
    const extracted = extractTitles(meta.description)
    const dbForSource = films.filter((f) => (f.sourceVideoIds ?? []).includes(videoId))

    // Build lookup from DB titles for this source
    const dbByNorm = new Map()
    for (const film of dbForSource) {
      for (const key of filmMatchKeys(film)) {
        if (!dbByNorm.has(key)) dbByNorm.set(key, [])
        dbByNorm.get(key).push(film)
      }
      // also index corrected query forms that might equal film title
      dbByNorm.set(norm(film.title), [...(dbByNorm.get(norm(film.title)) ?? []), film])
    }

    const missing = []
    const matched = []
    for (const item of extracted) {
      const keys = [norm(item.extractedTitle), norm(queryForTitle(item.extractedTitle))]
      let hit = null
      for (const k of keys) {
        const candidates = dbByNorm.get(k)
        if (candidates?.length) {
          hit = candidates[0]
          break
        }
      }
      // Fuzzy: any DB film title that contains / is contained
      if (!hit) {
        const n = norm(item.extractedTitle)
        const q = norm(queryForTitle(item.extractedTitle))
        hit =
          dbForSource.find((f) => {
            const ft = norm(f.title)
            return (
              ft === n ||
              ft === q ||
              (n.length > 4 && (ft.includes(n) || n.includes(ft))) ||
              (q.length > 4 && (ft.includes(q) || q.includes(ft)))
            )
          }) ?? null
      }
      if (hit) matched.push({ ...item, dbTitle: hit.title, dbId: hit.id })
      else missing.push(item)
    }

    // Unexpected extras: DB attributed to this source but not matching any extracted title
    const matchedDbIds = new Set(matched.map((m) => m.dbId))
    const unexpected = dbForSource.filter((f) => !matchedDbIds.has(f.id))

    // Raw ranked lines before expansion
    const rawRanks = new Set(extracted.map((t) => t.rank))
    const expansionDelta = extracted.length - rawRanks.size

    const pass =
      missing.length === 0 &&
      unexpected.length === 0 &&
      rawRanks.size >= 95 &&
      rawRanks.size <= 100

    if (!pass) overallPass = false

    reports.push({
      videoId,
      videoTitle: meta.title,
      descriptionSource: meta.sourcePath,
      extractedEntries: extracted.length,
      uniqueRanks: rawRanks.size,
      expansionDelta,
      dbAttributed: dbForSource.length,
      matched: matched.length,
      missing,
      unexpected,
      pass,
    })

    console.log(`--- ${videoId} ---`)
    console.log(`Video: ${meta.title}`)
    console.log(`Description from: ${meta.sourcePath}`)
    console.log(
      `Extracted: ${extracted.length} entries (${rawRanks.size} ranks` +
        (expansionDelta ? `, +${expansionDelta} from expansions` : '') +
        `)`,
    )
    console.log(`DB attributed to source: ${dbForSource.length}`)
    console.log(`Matched: ${matched.length}`)
    console.log(`Missing from DB: ${missing.length}`)
    if (missing.length) {
      for (const m of missing) {
        console.log(`  - #${m.rank} ${m.extractedTitle} (raw: ${m.rawLine})`)
      }
    }
    console.log(`Unexpected extras in DB: ${unexpected.length}`)
    if (unexpected.length) {
      for (const f of unexpected) {
        console.log(`  - ${f.title} (${f.year ?? '?'}) [${f.id}]`)
      }
    }
    console.log(`Verdict: ${pass ? 'PASS' : 'FAIL'}`)
    console.log('')
  }

  console.log('=== Overall ===')
  console.log(overallPass ? 'PASS' : 'FAIL')
  console.log(
    JSON.stringify(
      {
        overall: overallPass ? 'PASS' : 'FAIL',
        filesChecked: [filmsPath, dataPath],
        filesIdentical: dataSame,
        perVideo: reports.map((r) => ({
          videoId: r.videoId,
          title: r.videoTitle,
          extracted: r.extractedEntries,
          uniqueRanks: r.uniqueRanks,
          expansionDelta: r.expansionDelta,
          dbAttributed: r.dbAttributed,
          matched: r.matched,
          missingCount: r.missing.length,
          unexpectedCount: r.unexpected.length,
          missing: r.missing.map((m) => `#${m.rank} ${m.extractedTitle}`),
          unexpected: r.unexpected.map((f) => f.title),
          pass: r.pass,
        })),
      },
      null,
      2,
    ),
  )
}

main()
