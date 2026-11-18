import { Anime, ListEntry, MediaType } from '../types';
import { animeStore } from './animeStore';
import { fetchAnimeThemes } from './jikan';

export type JeopardyCellKind = 'audio' | 'visual_crop' | 'riddle_trivia' | 'studio_year';
export type QuizPoolScope = 'all' | 'mylist';

export interface InfiniteQuizQuestion {
  id: string;
  signature: string;
  kind: JeopardyCellKind;
  animeTitle: string;
  malId?: number;
  prompt: string;
  clues: string[];
  imageUrl?: string;
  songTitle?: string;
  artist?: string;
  audioQuery?: string;
  initialClipSec?: number;
  options: string[];
  correctAnswer: string;
  aliases?: string[];
  fromMyList?: boolean;
}

export interface ThemeQuizQuestion {
  id: string;
  animeTitle: string;
  prompt: string;
  songTitle: string;
  artist: string;
  audioQuery: string;
  options: string[];
  correctAnswer: string;
  aliases?: string[];
  clues?: string[];
  difficulty?: 'easy' | 'medium' | 'hard' | 'impossible';
}

export interface JeopardyCell {
  id: string;
  categoryId: string;
  points: number;
  kind: JeopardyCellKind;
  prompt: string;
  clues: string[];
  imageUrl?: string;
  songTitle?: string;
  artist?: string;
  audioQuery?: string;
  initialClipSec?: number;
  options: string[];
  correctAnswer: string;
  aliases?: string[];
  isDailyDouble?: boolean;
}

export interface JeopardyCategory {
  id: string;
  title: string;
  subtitle: string;
  cells: JeopardyCell[];
}

export interface ThemeAudioTrack {
  previewUrl: string;
  artworkUrl?: string;
  trackName?: string;
  artistName?: string;
}

interface SeedTheme {
  anime: string;
  aliases?: string[];
  kind: string;
  song: string;
  artist: string;
  year: number;
  studio: string;
  tier: 'easy' | 'medium' | 'hard' | 'impossible';
  clue1: string;
  clue2: string;
}

const ICONIC_THEMES: SeedTheme[] = [
  {
    anime: 'Tokyo Ghoul',
    aliases: ['tg'],
    kind: 'OP 1',
    song: 'Unravel',
    artist: 'TK from Ling tosite sigure',
    year: 2014,
    studio: 'Pierrot',
    tier: 'easy',
    clue1: 'An iconic acoustic whisper explodes into screaming math-rock falsetto.',
    clue2: 'Black-and-white hair transformation over Anteiku cafe coffee.',
  },
  {
    anime: 'Attack on Titan',
    aliases: ['aot', 'snk', 'shingeki no kyojin'],
    kind: 'OP 1',
    song: 'Guren no Yumiya',
    artist: 'Linked Horizon',
    year: 2013,
    studio: 'Wit Studio',
    tier: 'easy',
    clue1: 'German choral chanting bursts into brass-heavy marching battle energy.',
    clue2: 'Red crimson bow & arrow against towering humanity walls.',
  },
  {
    anime: 'Demon Slayer',
    aliases: ['kny', 'kimetsu no yaiba'],
    kind: 'OP 1',
    song: 'Gurenge',
    artist: 'LiSA',
    year: 2019,
    studio: 'ufotable',
    tier: 'easy',
    clue1: 'Water dragon brushstrokes swirl around a Nichirin blade in snow.',
    clue2: 'Taisho-era brother carrying his demon-turned sister in a wooden box.',
  },
  {
    anime: 'Oshi no Ko',
    aliases: ['onk'],
    kind: 'OP 1',
    song: 'Idol',
    artist: 'YOASOBI',
    year: 2023,
    studio: 'Doga Kobo',
    tier: 'easy',
    clue1: 'Gothic trap beat, choir chants, and pitch-shifted hyper-pop BPM.',
    clue2: 'Twin stars in the eyes & an unforgettable 85-minute Episode 1 twist.',
  },
  {
    anime: 'Chainsaw Man',
    aliases: ['csm'],
    kind: 'OP 1',
    song: 'KICK BACK',
    artist: 'Kenshi Yonezu',
    year: 2022,
    studio: 'MAPPA',
    tier: 'medium',
    clue1: 'Slap bass groove paying homage to Pulp Fiction, Fight Club, and Texas Chainsaw.',
    clue2: 'Orange dog mascot named Pochita + toast with every kind of jam.',
  },
  {
    anime: 'Neon Genesis Evangelion',
    aliases: ['nge', 'eva', 'evangelion'],
    kind: 'OP 1',
    song: 'A Cruel Angel’s Thesis',
    artist: 'Yoko Takahashi',
    year: 1995,
    studio: 'Gainax',
    tier: 'easy',
    clue1: '1995 synth-brass legend followed by a flash-cut montage of religious iconography.',
    clue2: 'Get in the purple biological robot, Shinji.',
  },
  {
    anime: 'Cowboy Bebop',
    aliases: ['bebop'],
    kind: 'OP 1',
    song: 'Tank!',
    artist: 'The Seatbelts',
    year: 1998,
    studio: 'Sunrise',
    tier: 'easy',
    clue1: 'Big-band jazz bongos & alto sax screaming "3, 2, 1, let’s jam."',
    clue2: 'Bounty hunters drifting aboard the Red Tail & Swordfish II.',
  },
  {
    anime: 'Fullmetal Alchemist: Brotherhood',
    aliases: ['fmab', 'fma'],
    kind: 'OP 1',
    song: 'Again',
    artist: 'YUI',
    year: 2009,
    studio: 'Bones',
    tier: 'easy',
    clue1: 'Fast-spitting acoustic guitar verse slamming into emotional 2009 chorus.',
    clue2: 'Equivalent exchange, an automail arm, and a hollow suit of armor.',
  },
  {
    anime: 'Naruto Shippuden',
    aliases: ['naruto'],
    kind: 'OP 3',
    song: 'Blue Bird',
    artist: 'Ikimonogakari',
    year: 2008,
    studio: 'Pierrot',
    tier: 'medium',
    clue1: 'Harmonica intro bursting into "Habataitara modoranai to itte..."',
    clue2: 'Twelve Guardian Ninja arc featuring Asuma & Sora.',
  },
  {
    anime: 'Jujutsu Kaisen',
    aliases: ['jjk'],
    kind: 'OP 4',
    song: 'SPECIALZ',
    artist: 'King Gnu',
    year: 2023,
    studio: 'MAPPA',
    tier: 'medium',
    clue1: 'Distorted sirens and creepy monotone groove over October 31st chaos.',
    clue2: 'Shibuya Incident curtain drop — "You are my special."',
  },
  {
    anime: 'Frieren: Beyond Journey’s End',
    aliases: ['frieren', 'sousou no frieren'],
    kind: 'OP 1',
    song: 'Yuusha',
    artist: 'YOASOBI',
    year: 2023,
    studio: 'Madhouse',
    tier: 'medium',
    clue1: 'Piano chime & high-tempo synth celebrating memories after the Demon King fell.',
    clue2: 'An elf mage realizes how short human lifespans are 50 years too late.',
  },
  {
    anime: 'Steins;Gate',
    aliases: ['steins gate', 'sg'],
    kind: 'OP 1',
    song: 'Hacking to the Gate',
    artist: 'Kanako Itou',
    year: 2011,
    studio: 'White Fox',
    tier: 'medium',
    clue1: 'Clock gears ticking over melancholic electro-rock strings.',
    clue2: 'Gel-bananas, a microwave, and "El Psy Kongroo."',
  },
  {
    anime: 'Fate/stay night: Unlimited Blade Works',
    aliases: ['fate', 'ubw', 'fate ubw'],
    kind: 'OP 2',
    song: 'Brave Shine',
    artist: 'Aimer',
    year: 2015,
    studio: 'ufotable',
    tier: 'hard',
    clue1: 'Husky powerhouse vocals backed by ufotable particle explosions.',
    clue2: 'Archer vs Shirou inside a sky full of rusted swords.',
  },
  {
    anime: 'Kaguya-sama: Love is War',
    aliases: ['kaguya', 'kaguya sama', 'love is war'],
    kind: 'OP 2',
    song: 'DADDY! DADDY! DO!',
    artist: 'Masayuki Suzuki',
    year: 2020,
    studio: 'A-1 Pictures',
    tier: 'medium',
    clue1: 'Showa-era funk king crooning with trumpets over student council warfare.',
    clue2: 'Two geniuses refusing to confess first.',
  },
  {
    anime: 'Death Note',
    aliases: ['dn'],
    kind: 'OP 1',
    song: 'the WORLD',
    artist: 'Nightmare',
    year: 2006,
    studio: 'Madhouse',
    tier: 'medium',
    clue1: '2006 visual-kei rock anthem with dramatic red apples & gothic wings.',
    clue2: 'Take a potato chip… and eat it!',
  },
  {
    anime: 'Mob Psycho 100',
    aliases: ['mob', 'mp100'],
    kind: 'OP 1',
    song: '99',
    artist: 'MOB CHOIR',
    year: 2016,
    studio: 'Bones',
    tier: 'hard',
    clue1: 'Chanted countdown rising by integers until 100% explosion.',
    clue2: 'Salt splash scam mentor Reigen Arataka and an esper middle-schooler.',
  },
  {
    anime: 'Hunter x Hunter (2011)',
    aliases: ['hxh', 'hunter x hunter', 'hunterxhunter'],
    kind: 'OP 1',
    song: 'Departure!',
    artist: 'Masatoshi Ono',
    year: 2011,
    studio: 'Madhouse',
    tier: 'easy',
    clue1: 'Same single opening melody kept for all 148 episodes with lyric swaps.',
    clue2: 'Fishing rod boy looking for his deadbeat hunter dad.',
  },
  {
    anime: 'Solo Leveling',
    aliases: ['sl'],
    kind: 'OP 1',
    song: 'LEveL',
    artist: 'SawanoHiroyuki[nZk]:TOMORROW X TOGETHER',
    year: 2024,
    studio: 'A-1 Pictures',
    tier: 'hard',
    clue1: 'Hiroyuki Sawano electronic drop mixed with K-pop vocals.',
    clue2: 'E-rank hunter survives the double dungeon statue smile.',
  },
  {
    anime: 'Vinland Saga',
    aliases: ['vinland'],
    kind: 'OP 1',
    song: 'Mukanjyo',
    artist: 'Survive Said The Prophet',
    year: 2019,
    studio: 'Wit Studio',
    tier: 'hard',
    clue1: 'Screamo post-hardcore English vocals screaming over icy Viking ships.',
    clue2: 'Thorfinn chases Askeladd for a duel after his father’s murder.',
  },
  {
    anime: 'Cyberpunk: Edgerunners',
    aliases: ['edgerunners', 'cyberpunk'],
    kind: 'ED / Insert',
    song: 'I Really Want to Stay at Your House',
    artist: 'Rosa Walton',
    year: 2022,
    studio: 'Studio Trigger',
    tier: 'medium',
    clue1: '80s synthwave heartbreak anthem that destroys viewers after Episode 10.',
    clue2: 'David & Lucy sitting on a virtual moon crater in Night City.',
  },
  {
    anime: 'Gurren Lagann',
    aliases: ['ttgl', 'tengen toppa gurren lagann'],
    kind: 'OP 1',
    song: 'Sorairo Days',
    artist: 'Shoko Nakagawa',
    year: 2007,
    studio: 'Gainax',
    tier: 'hard',
    clue1: 'High-octane 2007 anime rock screaming to pierce the heavens.',
    clue2: 'Kamina sunglasses & a core drill growing larger than galaxies.',
  },
  {
    anime: 'Bocchi the Rock!',
    aliases: ['bocchi', 'btr'],
    kind: 'OP 1',
    song: 'Seishun Complex',
    artist: 'Kessoku Band',
    year: 2022,
    studio: 'CloverWorks',
    tier: 'hard',
    clue1: 'Tight indie alt-rock guitar riff mixed with extreme social anxiety.',
    clue2: 'Pink-haired guitarist hiding in a ripe mango cardboard box.',
  },
  {
    anime: 'Dan Da Dan',
    aliases: ['dandadan'],
    kind: 'OP 1',
    song: 'Otonoke',
    artist: 'Creepy Nuts',
    year: 2024,
    studio: 'Science SARU',
    tier: 'impossible',
    clue1: 'Hypnotic rapid-fire rap chant sampling creepy haunted radio static.',
    clue2: 'Occult nerd loses something precious to Turbo Granny while fighting aliens.',
  },
  {
    anime: 'Code Geass',
    aliases: ['geass', 'code geass lelouch'],
    kind: 'OP 1',
    song: 'COLORS',
    artist: 'FLOW',
    year: 2006,
    studio: 'Sunrise',
    tier: 'impossible',
    clue1: '"JIBUN WO!" reverberating through 2006 anime clubs worldwide.',
    clue2: 'Chess prodigy obtains absolute obedience in his left eye.',
  },
  {
    anime: 'JoJo’s Bizarre Adventure',
    aliases: ['jojo', 'jjba'],
    kind: 'ED 1',
    song: 'Roundabout',
    artist: 'Yes',
    year: 2012,
    studio: 'David Production',
    tier: 'impossible',
    clue1: '1971 acoustic guitar riff freezing mid-cliffhanger into sepia tones.',
    clue2: '"To Be Continued ->"',
  },
  {
    anime: 'Bleach',
    aliases: ['bleach tybw'],
    kind: 'OP 1',
    song: 'Asterisk',
    artist: 'ORANGE RANGE',
    year: 2004,
    studio: 'Pierrot',
    tier: 'impossible',
    clue1: '2004 graffiti hip-hop rock flashing pink street fashion over Soul Reapers.',
    clue2: 'Strawberry-haired substitute Shinigami & Kon the plush lion.',
  },
];

interface SeedRiddle {
  anime: string;
  aliases?: string[];
  tier: 'easy' | 'medium' | 'hard' | 'impossible';
  prompt: string;
  clues: [string, string, string];
  options: [string, string, string, string];
}

const HERALEN_RIDDLES: SeedRiddle[] = [
  {
    anime: 'Code Geass',
    aliases: ['geass', 'code geass'],
    tier: 'easy',
    prompt: 'Name this 2006 Sunrise classic using the 3-clue ladder:',
    clues: [
      'Clue 1: Funded heavily by Pizza Hut product placement inside the anime.',
      'Clue 2: The protagonist plays high-stakes chess wearing a dramatic mask.',
      'Clue 3: Lelouch vi Britannia commands enemies with the power of Geass.',
    ],
    options: ['Code Geass', 'Death Note', 'Guilty Crown', '86 EIGHTY-SIX'],
  },
  {
    anime: 'Gintama',
    aliases: ['gintama'],
    tier: 'medium',
    prompt: 'Identify this chaotic shonen satire before Clue 3:',
    clues: [
      'Clue 1: Episode 1 & 2 were weird filler mocking its own TV time-slot promotion.',
      'Clue 2: Features an alien-invaded Edo where samurai carry wooden swords & read JUMP.',
      'Clue 3: Gintoki runs Odd Jobs Yorozuya fueled by strawberry milk & parfaits.',
    ],
    options: ['Gintama', 'Saiki K.', 'Sket Dance', 'Samurai Champloo'],
  },
  {
    anime: 'Made in Abyss',
    aliases: ['mia', 'made in abyss'],
    tier: 'hard',
    prompt: 'Guess the series behind this deceptively cute art style:',
    clues: [
      'Clue 1: Directed with Kevin Penkin’s haunting orchestral score.',
      'Clue 2: Ascending just 10 meters causes hallucinations, bleeding, or worse.',
      'Clue 3: Riko & robot boy Reg descend toward the 7th layer in search of Lyza.',
    ],
    options: ['Made in Abyss', 'The Promised Neverland', 'Madoka Magica', 'Somali and the Forest Spirit'],
  },
  {
    anime: 'Odd Taxi',
    aliases: ['oddtaxi'],
    tier: 'impossible',
    prompt: 'Impossible Mystery Tier: guess the acclaimed 13-episode thriller:',
    clues: [
      'Clue 1: Almost the entire cast speaks casually during mundane late-night rides.',
      'Clue 2: Every character looks like an anthropomorphic animal — until the finale twist.',
      'Clue 3: Odokawa the 41-year-old walrus cab driver gets tangled in a missing idol case.',
    ],
    options: ['Odd Taxi', 'BEASTARS', 'Aggretsuko', 'BNA'],
  },
];

const HIGH_SCORE_KEY = 'listtube.themeQuiz.best.v1';
const JEOPARDY_HIGH_SCORE_KEY = 'listtube.jeopardy.best.v1';
const SEEN_QUESTIONS_KEY = 'listtube.quiz.seen.v1';
const audioCache = new Map<string, ThemeAudioTrack | null>();

export function getSeenQuizKeys(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(SEEN_QUESTIONS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function getSeenQuizCount(): number {
  return getSeenQuizKeys().size;
}

export function markQuizQuestionSeen(signature: string): void {
  if (typeof localStorage === 'undefined' || !signature) return;
  try {
    const set = getSeenQuizKeys();
    set.add(signature);
    const trimmed = Array.from(set).slice(-3500);
    localStorage.setItem(SEEN_QUESTIONS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota errors */
  }
}

export function resetSeenQuizHistory(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SEEN_QUESTIONS_KEY);
  } catch {
    /* ignore */
  }
}

export async function discoverDynamicAnimeTheme(malId?: number): Promise<{
  songTitle: string;
  artist: string;
  audioQuery: string;
} | null> {
  if (!malId || malId <= 0) return null;
  try {
    const themes = await fetchAnimeThemes(malId);
    const list = [...(themes.openings ?? []), ...(themes.endings ?? [])];
    const first = list[0];
    if (!first?.title) return null;
    const songTitle = first.title.trim();
    const artist = (first.artists ?? '').trim();
    return {
      songTitle,
      artist: artist || 'Theme Song',
      audioQuery: `${songTitle} ${artist}`.trim(),
    };
  } catch {
    return null;
  }
}

export type QuizDifficultyTier = 'three_sec';
export const SNIPPET_LADDER: Record<QuizDifficultyTier, number[]> = {
  three_sec: [3, 7, 15, 28],
};

export function getQuizHighScore(): number {
  if (typeof localStorage === 'undefined') return 0;
  return Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
}

export function saveQuizHighScore(score: number): void {
  if (typeof localStorage === 'undefined') return;
  const best = getQuizHighScore();
  if (score > best) localStorage.setItem(HIGH_SCORE_KEY, String(score));
}

export function getJeopardyHighScore(): number {
  if (typeof localStorage === 'undefined') return 0;
  return Number(localStorage.getItem(JEOPARDY_HIGH_SCORE_KEY) || 0);
}

export function saveJeopardyHighScore(score: number): void {
  if (typeof localStorage === 'undefined') return;
  const best = getJeopardyHighScore();
  if (score > best) localStorage.setItem(JEOPARDY_HIGH_SCORE_KEY, String(score));
}

function normalizeGuess(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’`":;,.!?()-]/g, ' ')
    .replace(/\b(the|a|an|season|part|shippuden|brotherhood|2011)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function doesTypedGuessMatch(
  guess: string,
  target: string,
  aliases: string[] = []
): boolean {
  const g = normalizeGuess(guess);
  if (g.length < 2) return false;
  const candidates = [target, ...aliases].map(normalizeGuess).filter(Boolean);
  for (const cand of candidates) {
    if (g === cand) return true;
    if (cand.length >= 4 && g.includes(cand)) return true;
    if (g.length >= 4 && cand.includes(g)) return true;
  }
  const targetTokens = normalizeGuess(target).split(' ').filter((w) => w.length >= 3);
  const guessTokens = new Set(g.split(' '));
  if (targetTokens.length >= 2) {
    const matched = targetTokens.filter((w) => guessTokens.has(w)).length;
    if (matched / targetTokens.length >= 0.7) return true;
  }
  return false;
}

export async function resolveThemePreviewAudio(q: {
  id: string;
  audioQuery?: string;
  songTitle?: string;
  artist?: string;
}): Promise<ThemeAudioTrack | null> {
  if (!q.audioQuery && !q.songTitle) return null;
  if (audioCache.has(q.id)) return audioCache.get(q.id) ?? null;

  const queries = [
    q.audioQuery,
    q.songTitle && q.artist ? `${q.songTitle} ${q.artist.split(':')[0].split('from')[0].trim()}` : undefined,
    q.songTitle,
  ].filter((v): v is string => Boolean(v && v.trim()));

  for (const term of queries) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=5`
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        results?: {
          previewUrl?: string;
          artworkUrl100?: string;
          trackName?: string;
          artistName?: string;
        }[];
      };
      const match = (json.results ?? []).find(
        (r) => typeof r.previewUrl === 'string' && r.previewUrl.startsWith('https://')
      );
      if (match?.previewUrl) {
        const track: ThemeAudioTrack = {
          previewUrl: match.previewUrl,
          artworkUrl: match.artworkUrl100?.replace('100x100', '200x200'),
          trackName: match.trackName,
          artistName: match.artistName,
        };
        audioCache.set(q.id, track);
        return track;
      }
    } catch {
      /* try next query */
    }
  }

  audioCache.set(q.id, null);
  return null;
}

export function buildThemeQuizRound(count = 8): ThemeQuizQuestion[] {
  const pool = [...ICONIC_THEMES].sort(() => Math.random() - 0.5);
  const selected = pool.slice(0, Math.min(count, pool.length));
  const allTitles = ICONIC_THEMES.map((t) => t.anime);

  return selected.map((item, idx) => {
    const distractors = allTitles
      .filter((t) => t !== item.anime)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const options = [item.anime, ...distractors].sort(() => Math.random() - 0.5);

    return {
      id: `q-${idx}-${item.song}`,
      animeTitle: item.anime,
      prompt: `Guess the anime from ${item.kind}: “${item.song}”`,
      songTitle: item.song,
      artist: item.artist,
      audioQuery: `${item.song} ${item.artist}`,
      options,
      correctAnswer: item.anime,
      aliases: item.aliases,
      clues: [
        `Aired ${item.year} · Studio: ${item.studio}`,
        item.clue1,
        item.clue2,
      ],
      difficulty: item.tier,
    };
  });
}

function buildOptionsForTitle(targetTitle: string, poolTitles: string[]): string[] {
  const others = poolTitles
    .filter((t) => t.toLowerCase() !== targetTitle.toLowerCase())
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  return [targetTitle, ...others].sort(() => Math.random() - 0.5);
}

/**
 * Generates an interactive 4x4 Anime Jeopardy Board across
 * OP/ED Blitz (3s–12s), Cursed Visual Crop, 3-Clue Riddles, and Studio & Year Trivia.
 */
export function buildJeopardyBoard(catalogInput?: Anime[]): JeopardyCategory[] {
  const storeCatalog = (catalogInput ?? animeStore.all()).filter(
    (a) => (a.mediaType ?? 'ANIME') === 'ANIME' && a.cover && a.title
  );
  const fallbackTitles = ICONIC_THEMES.map((t) => t.anime);
  const allTitles = Array.from(
    new Set([...storeCatalog.slice(0, 80).map((a) => a.title), ...fallbackTitles])
  );

  // Category 1: OP/ED Audio Blitz (10s -> 6s -> 3s)
  const tiers: Array<{ tier: SeedTheme['tier']; points: number; clipSec: number }> = [
    { tier: 'easy', points: 100, clipSec: 10 },
    { tier: 'medium', points: 200, clipSec: 6 },
    { tier: 'hard', points: 400, clipSec: 3 },
    { tier: 'impossible', points: 600, clipSec: 3 },
  ];

  const usedSongs = new Set<string>();
  const audioCells: JeopardyCell[] = tiers.map(({ tier, points, clipSec }) => {
    const candidates = ICONIC_THEMES.filter((t) => t.tier === tier && !usedSongs.has(t.song));
    const pick =
      candidates[Math.floor(Math.random() * candidates.length)] ??
      ICONIC_THEMES.find((t) => !usedSongs.has(t.song)) ??
      ICONIC_THEMES[0];
    usedSongs.add(pick.song);
    return {
      id: `jp-audio-${points}-${pick.song}`,
      categoryId: 'audio',
      points,
      kind: 'audio',
      prompt: `Listen to this ${clipSec}s theme snippet (${pick.kind}) — name the anime!`,
      clues: [
        `Clue 1 (${clipSec}s audio): Aired in ${pick.year} (${pick.kind})`,
        `Clue 2: Animated by ${pick.studio} — ${pick.clue1}`,
        `Clue 3: ${pick.clue2}`,
      ],
      songTitle: pick.song,
      artist: pick.artist,
      audioQuery: `${pick.song} ${pick.artist}`,
      initialClipSec: clipSec,
      options: buildOptionsForTitle(pick.anime, allTitles),
      correctAnswer: pick.anime,
      aliases: pick.aliases,
    };
  });

  // Category 2: Cursed Visual Crop (from live anime catalog covers, sorted popular -> obscure!)
  const popularSorted = [...storeCatalog]
    .filter((a) => (a.popularity ?? 0) > 1000 && a.title.length <= 42)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  const visualSlices =
    popularSorted.length >= 16
      ? [
          popularSorted[Math.floor(Math.random() * 8)],
          popularSorted[12 + Math.floor(Math.random() * 14)],
          popularSorted[30 + Math.floor(Math.random() * Math.max(1, Math.min(25, popularSorted.length - 30)))],
          popularSorted[Math.max(0, popularSorted.length - 1 - Math.floor(Math.random() * 20))],
        ]
      : ICONIC_THEMES.slice(0, 4).map((t, i) => ({
          id: `fallback-vis-${i}`,
          title: t.anime,
          cover: '',
          genres: ['Action'],
          studios: [t.studio],
          year: t.year,
          score: 8.5,
          episodes: 24,
        }));

  const visualCells: JeopardyCell[] = [100, 200, 400, 600].map((points, idx) => {
    const show = visualSlices[idx] ?? visualSlices[0];
    const extraGenres = (show as Anime).genres?.slice(0, 2).join(', ') || 'Anime';
    const studio = (show as Anime).studios?.[0] || 'Japanese Animation Studio';
    return {
      id: `jp-vis-${points}-${show.id}`,
      categoryId: 'visual',
      points,
      kind: 'visual_crop',
      prompt: `Cursed Frame (${points} pts): Can you tell which anime this blurred poster belongs to?`,
      clues: [
        `Clue 1: Genres — ${extraGenres}`,
        `Clue 2: Studio — ${studio}${show.year ? ` (${show.year})` : ''}`,
        `Clue 3: ${(show as Anime).episodes ? `${(show as Anime).episodes} episodes` : 'Iconic series'}`,
      ],
      imageUrl: show.cover || undefined,
      options: buildOptionsForTitle(show.title, allTitles),
      correctAnswer: show.title,
    };
  });

  // Category 3: 3-Clue Riddles
  const riddleOrder: SeedRiddle['tier'][] = ['easy', 'medium', 'hard', 'impossible'];
  const riddlePoints = [100, 200, 400, 600];
  const riddleCells: JeopardyCell[] = riddleOrder.map((tier, idx) => {
    const pick = HERALEN_RIDDLES.find((r) => r.tier === tier) ?? HERALEN_RIDDLES[idx % HERALEN_RIDDLES.length];
    return {
      id: `jp-riddle-${riddlePoints[idx]}-${pick.anime}`,
      categoryId: 'riddle',
      points: riddlePoints[idx],
      kind: 'riddle_trivia',
      prompt: pick.prompt,
      clues: [...pick.clues],
      options: [...pick.options].sort(() => Math.random() - 0.5),
      correctAnswer: pick.anime,
      aliases: pick.aliases,
    };
  });

  // Category 4: Studio, Year & Meta Trivia (dynamically built + fallback)
  const studioPool = ICONIC_THEMES.slice().sort(() => Math.random() - 0.5).slice(0, 4);
  const studioCells: JeopardyCell[] = [100, 200, 400, 600].map((points, idx) => {
    const item = studioPool[idx];
    const mode = idx % 2;
    if (mode === 0) {
      const studioChoices = Array.from(
        new Set([item.studio, 'MAPPA', 'Madhouse', 'Bones', 'ufotable', 'Wit Studio', 'Gainax'])
      );
      const distractors = studioChoices.filter((s) => s !== item.studio).slice(0, 3);
      return {
        id: `jp-meta-${points}-${item.anime}`,
        categoryId: 'meta',
        points,
        kind: 'studio_year',
        prompt: `Which animation studio produced ${item.anime} (${item.year})?`,
        clues: [
          `Clue 1: Released in ${item.year}`,
          `Clue 2: Features ${item.kind} "${item.song}"`,
          `Clue 3: ${item.clue2}`,
        ],
        options: [item.studio, ...distractors].sort(() => Math.random() - 0.5),
        correctAnswer: item.studio,
      };
    }
    const yearChoices = [
      String(item.year),
      String(item.year - 2),
      String(item.year + 2),
      String(item.year - 5),
    ].sort(() => Math.random() - 0.5);
    return {
      id: `jp-meta-${points}-yr-${item.anime}`,
      categoryId: 'meta',
      points,
      kind: 'studio_year',
      prompt: `What year did ${item.anime} premiere on TV?`,
      clues: [
        `Clue 1: Studio ${item.studio}`,
        `Clue 2: Theme song "${item.song}"`,
        `Clue 3: ${item.clue1}`,
      ],
      options: yearChoices,
      correctAnswer: String(item.year),
    };
  });

  // Award 1 secret Daily Double on a 200–600 tile
  const ddCandidates = [...audioCells.slice(1), ...visualCells.slice(1), ...riddleCells.slice(1), ...studioCells.slice(1)];
  const ddPick = ddCandidates[Math.floor(Math.random() * ddCandidates.length)];
  if (ddPick) ddPick.isDailyDouble = true;

  return [
    {
      id: 'audio',
      title: 'OP/ED Blitz',
      subtitle: '3s–10s Audio',
      cells: audioCells,
    },
    {
      id: 'visual',
      title: 'Cursed Crop',
      subtitle: 'Blurred Frames',
      cells: visualCells,
    },
    {
      id: 'riddle',
      title: '3-Clue Riddle',
      subtitle: 'Anime Lore',
      cells: riddleCells,
    },
    {
      id: 'meta',
      title: 'Studio & Year',
      subtitle: 'Deep Cuts',
      cells: studioCells,
    },
  ];
}

function maskTitleWords(text: string, title: string): string {
  if (!text) return '';
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = title
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length >= 4)
    .slice(0, 4);
  let out = clean;
  for (const w of words) {
    out = out.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '███');
  }
  return out.length > 150 ? `${out.slice(0, 147)}…` : out;
}

/**
 * Generates an endless, non-repeating quiz question across Audio OPs/EDs,
 * Cursed Crops, 3-Clue Riddles, and Studio/Year trivia. Supports filtering strictly
 * to the user's own Anime/Manga Watchlist (`scope: 'mylist'`).
 */
export function buildNextInfiniteQuestion(opts: {
  scope: QuizPoolScope;
  entries?: Record<string, ListEntry>;
  mediaType?: MediaType;
  sessionExclude?: Set<string>;
  preferKind?: JeopardyCellKind;
}): InfiniteQuizQuestion {
  const seen = getSeenQuizKeys();
  const exclude = opts.sessionExclude ?? new Set<string>();
  const allCatalog = animeStore
    .all()
    .filter((a) => a.cover && a.title && a.title.length <= 52);

  const listItems: Anime[] = opts.entries
    ? Object.values(opts.entries)
        .map((e) => animeStore.get(e.animeId))
        .filter((a): a is Anime => Boolean(a && a.cover && a.title))
    : [];

  const pool =
    opts.scope === 'mylist' && listItems.length >= 2
      ? listItems
      : allCatalog.filter((a) => (opts.mediaType ? a.mediaType === opts.mediaType : true));

  const fallbackTitles = ICONIC_THEMES.map((t) => t.anime);
  const distractorTitles = Array.from(
    new Set([
      ...allCatalog.slice(0, 140).map((a) => a.title),
      ...fallbackTitles,
    ])
  );

  // Build candidate question generators (curated audio + dynamic catalog items)
  const candidates: InfiniteQuizQuestion[] = [];

  for (const theme of ICONIC_THEMES) {
    const matchesMyList =
      listItems.length > 0 &&
      listItems.some(
        (m) =>
          m.title.toLowerCase().includes(theme.anime.toLowerCase()) ||
          theme.anime.toLowerCase().includes(m.title.toLowerCase())
      );
    if (opts.scope === 'mylist' && listItems.length >= 2 && !matchesMyList) continue;

    const sig = `audio:${theme.song.toLowerCase()}`;
    if (exclude.has(sig)) continue;
    candidates.push({
      id: `${sig}-${Math.random().toString(36).slice(2, 7)}`,
      signature: sig,
      kind: 'audio',
      animeTitle: theme.anime,
      prompt: `3s Audio Blitz — which anime features ${theme.kind}: “${theme.song}”?`,
      clues: [
        `Premiere: ${theme.year} · Studio: ${theme.studio}`,
        theme.clue1,
        theme.clue2,
      ],
      songTitle: theme.song,
      artist: theme.artist,
      audioQuery: `${theme.song} ${theme.artist}`,
      initialClipSec: 3,
      options: buildOptionsForTitle(theme.anime, distractorTitles),
      correctAnswer: theme.anime,
      aliases: theme.aliases,
      fromMyList: matchesMyList,
    });
  }

  // Dynamic questions across hundreds of catalog / user list titles
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5).slice(0, 60);
  for (const anime of shuffledPool) {
    const isInList = Boolean(opts.entries?.[anime.id]);
    const yearStr = anime.year ? String(anime.year) : undefined;
    const studio = anime.studios?.[0];
    const synopsisHint = maskTitleWords(anime.description ?? '', anime.title);
    const kindPool: JeopardyCellKind[] = [];
    if (anime.cover) kindPool.push('visual_crop');
    if (synopsisHint.length >= 25 || studio) kindPool.push('riddle_trivia');
    if (studio || yearStr) kindPool.push('studio_year');
    if ((anime.mediaType ?? 'ANIME') === 'ANIME' && anime.malId) kindPool.push('audio');

    const chosenKind =
      opts.preferKind && kindPool.includes(opts.preferKind)
        ? opts.preferKind
        : kindPool[Math.floor(Math.random() * kindPool.length)] ?? 'visual_crop';

    const sig = `${chosenKind}:${anime.id}`;
    if (exclude.has(sig)) continue;

    if (chosenKind === 'audio' && anime.malId) {
      candidates.push({
        id: `${sig}-${Math.random().toString(36).slice(2, 7)}`,
        signature: sig,
        kind: 'audio',
        animeTitle: anime.title,
        malId: anime.malId,
        prompt: `Mystery 3s Opening/Ending — identify this series!`,
        clues: [
          `Genres: ${(anime.genres ?? []).slice(0, 3).join(', ') || 'Anime'}`,
          `${studio ? `Studio: ${studio}` : 'Series'}${yearStr ? ` (${yearStr})` : ''}`,
          synopsisHint || `${anime.episodes ?? '?'} episodes`,
        ],
        initialClipSec: 3,
        options: buildOptionsForTitle(anime.title, distractorTitles),
        correctAnswer: anime.title,
        fromMyList: isInList,
      });
    } else if (chosenKind === 'visual_crop') {
      candidates.push({
        id: `${sig}-${Math.random().toString(36).slice(2, 7)}`,
        signature: sig,
        kind: 'visual_crop',
        animeTitle: anime.title,
        prompt: `Blurred Poster Frame — which ${anime.mediaType === 'MANGA' ? 'manga' : 'anime'} is this?`,
        clues: [
          `Genres: ${(anime.genres ?? []).slice(0, 3).join(', ') || 'Action'}`,
          `${studio ? `Studio: ${studio}` : anime.format ?? 'Series'}${yearStr ? ` · ${yearStr}` : ''}`,
          synopsisHint || `Score ${anime.score ? anime.score.toFixed(1) : 'N/A'}★`,
        ],
        imageUrl: anime.cover,
        options: buildOptionsForTitle(anime.title, distractorTitles),
        correctAnswer: anime.title,
        fromMyList: isInList,
      });
    } else if (chosenKind === 'riddle_trivia') {
      candidates.push({
        id: `${sig}-${Math.random().toString(36).slice(2, 7)}`,
        signature: sig,
        kind: 'riddle_trivia',
        animeTitle: anime.title,
        prompt: `3-Clue Lore Challenge — name this title!`,
        clues: [
          `Clue 1: Genres — ${(anime.genres ?? []).slice(0, 3).join(', ') || 'Mystery'}`,
          `Clue 2: ${studio ? `Animated by ${studio}` : 'Released'}${yearStr ? ` in ${yearStr}` : ''}`,
          `Clue 3: ${synopsisHint || `${anime.episodes ?? '?'} episodes`}`,
        ],
        options: buildOptionsForTitle(anime.title, distractorTitles),
        correctAnswer: anime.title,
        fromMyList: isInList,
      });
    } else if (studio) {
      const studioChoices = Array.from(
        new Set([studio, 'MAPPA', 'Madhouse', 'Bones', 'ufotable', 'Wit Studio', 'Pierrot', 'A-1 Pictures', 'Kyoto Animation'])
      )
        .filter((s) => s !== studio)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      candidates.push({
        id: `${sig}-${Math.random().toString(36).slice(2, 7)}`,
        signature: sig,
        kind: 'studio_year',
        animeTitle: anime.title,
        prompt: `Which studio produced ${anime.title}${yearStr ? ` (${yearStr})` : ''}?`,
        clues: [
          `Genres: ${(anime.genres ?? []).slice(0, 3).join(', ')}`,
          `Format: ${anime.format ?? 'TV'} (${anime.episodes ?? '?'} ep)`,
          synopsisHint || `Community score ${anime.score ? anime.score.toFixed(1) : '8.0'}★`,
        ],
        options: [studio, ...studioChoices].sort(() => Math.random() - 0.5),
        correctAnswer: studio,
        fromMyList: isInList,
      });
    }
  }

  // Strictly prioritize never-before-seen questions first!
  const unseen = candidates.filter((c) => !seen.has(c.signature));
  const preferredList = unseen.length > 0 ? unseen : candidates;
  const finalPool = preferredList.length > 0 ? preferredList : [candidates[0]].filter(Boolean);

  if (finalPool.length > 0) {
    return finalPool[Math.floor(Math.random() * finalPool.length)];
  }

  // Guaranteed safe fallback if catalog hasn't hydrated yet
  const t = ICONIC_THEMES[Math.floor(Math.random() * ICONIC_THEMES.length)];
  return {
    id: `fallback-${Date.now()}`,
    signature: `audio:${t.song.toLowerCase()}`,
    kind: 'audio',
    animeTitle: t.anime,
    prompt: `3s Audio Blitz — which anime features ${t.kind}: “${t.song}”?`,
    clues: [`${t.year} · ${t.studio}`, t.clue1, t.clue2],
    songTitle: t.song,
    artist: t.artist,
    audioQuery: `${t.song} ${t.artist}`,
    initialClipSec: 3,
    options: buildOptionsForTitle(t.anime, fallbackTitles),
    correctAnswer: t.anime,
    aliases: t.aliases,
  };
}
