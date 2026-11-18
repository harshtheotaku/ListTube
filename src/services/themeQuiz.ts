export interface ThemeQuizQuestion {
  id: string;
  animeTitle: string;
  prompt: string;
  songTitle: string;
  artist: string;
  audioQuery: string;
  options: string[];
  correctAnswer: string;
}

export interface ThemeAudioTrack {
  previewUrl: string;
  artworkUrl?: string;
  trackName?: string;
  artistName?: string;
}

interface SeedTheme {
  anime: string;
  kind: string;
  song: string;
  artist: string;
}

const ICONIC_THEMES: SeedTheme[] = [
  { anime: 'Tokyo Ghoul', kind: 'OP 1', song: 'Unravel', artist: 'TK from Ling tosite sigure' },
  { anime: 'Attack on Titan', kind: 'OP 1', song: 'Guren no Yumiya', artist: 'Linked Horizon' },
  { anime: 'Demon Slayer', kind: 'OP 1', song: 'Gurenge', artist: 'LiSA' },
  { anime: 'Oshi no Ko', kind: 'OP 1', song: 'Idol', artist: 'YOASOBI' },
  { anime: 'Chainsaw Man', kind: 'OP 1', song: 'KICK BACK', artist: 'Kenshi Yonezu' },
  { anime: 'Neon Genesis Evangelion', kind: 'OP 1', song: 'A Cruel Angel’s Thesis', artist: 'Yoko Takahashi' },
  { anime: 'Cowboy Bebop', kind: 'OP 1', song: 'Tank!', artist: 'The Seatbelts' },
  { anime: 'Fullmetal Alchemist: Brotherhood', kind: 'OP 1', song: 'Again', artist: 'YUI' },
  { anime: 'Naruto Shippuden', kind: 'OP 3', song: 'Blue Bird', artist: 'Ikimonogakari' },
  { anime: 'Jujutsu Kaisen', kind: 'OP 4', song: 'SPECIALZ', artist: 'King Gnu' },
  { anime: 'Frieren: Beyond Journey’s End', kind: 'OP 1', song: 'Yuusha', artist: 'YOASOBI' },
  { anime: 'Steins;Gate', kind: 'OP 1', song: 'Hacking to the Gate', artist: 'Kanako Itou' },
  { anime: 'Fate/stay night: Unlimited Blade Works', kind: 'OP 2', song: 'Brave Shine', artist: 'Aimer' },
  { anime: 'Kaguya-sama: Love is War', kind: 'OP 2', song: 'DADDY! DADDY! DO!', artist: 'Masayuki Suzuki' },
  { anime: 'Death Note', kind: 'OP 1', song: 'the WORLD', artist: 'Nightmare' },
  { anime: 'Mob Psycho 100', kind: 'OP 1', song: '99', artist: 'MOB CHOIR' },
  { anime: 'Hunter x Hunter (2011)', kind: 'OP 1', song: 'Departure!', artist: 'Masatoshi Ono' },
  { anime: 'Solo Leveling', kind: 'OP 1', song: 'LEveL', artist: 'SawanoHiroyuki[nZk]:TOMORROW X TOGETHER' },
];

const HIGH_SCORE_KEY = 'listtube.themeQuiz.best.v1';
const audioCache = new Map<string, ThemeAudioTrack | null>();

export function getQuizHighScore(): number {
  if (typeof localStorage === 'undefined') return 0;
  return Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
}

export function saveQuizHighScore(score: number): void {
  if (typeof localStorage === 'undefined') return;
  const best = getQuizHighScore();
  if (score > best) localStorage.setItem(HIGH_SCORE_KEY, String(score));
}

export async function resolveThemePreviewAudio(q: ThemeQuizQuestion): Promise<ThemeAudioTrack | null> {
  if (audioCache.has(q.id)) return audioCache.get(q.id) ?? null;

  const queries = [
    q.audioQuery,
    `${q.songTitle} ${q.artist.split(':')[0].split('from')[0].trim()}`,
    q.songTitle,
  ];

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
      const match = (json.results ?? []).find((r) => typeof r.previewUrl === 'string' && r.previewUrl.startsWith('https://'));
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
      prompt: `Which anime features ${item.kind}: “${item.song}”?`,
      songTitle: item.song,
      artist: item.artist,
      audioQuery: `${item.song} ${item.artist}`,
      options,
      correctAnswer: item.anime,
    };
  });
}
