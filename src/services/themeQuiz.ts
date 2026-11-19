import { Anime, ListEntry, MediaType } from '../types';
import { animeStore } from './animeStore';
import { fetchAnimeThemes } from './jikan';

export type JeopardyCellKind =
  | 'audio'
  | 'visual_crop'
  | 'riddle_trivia'
  | 'studio_year'
  | 'emoji_plot'
  | 'quote_match'
  | 'odd_one_out'
  | 'stat_clash';
export type QuizPoolScope = 'all' | 'mylist';
export type QuizDifficultyLevel = 'easy' | 'medium' | 'hard';
export type QuizDifficultyFilter = 'all' | QuizDifficultyLevel;

export interface InfiniteQuizQuestion {
  id: string;
  signature: string;
  kind: JeopardyCellKind;
  difficulty: QuizDifficultyLevel;
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
  difficulty: QuizDifficultyLevel;
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
  {
    anime: 'One Punch Man',
    aliases: ['opm'],
    kind: 'OP 1',
    song: 'THE HERO!!',
    artist: 'JAM Project',
    year: 2015,
    studio: 'Madhouse',
    tier: 'easy',
    clue1: 'Explosive super-hero metal shout starting with "ONE PUUUUNCH!"',
    clue2: 'Bald Caped Baldy bored of ending every monster in a single hit.',
  },
  {
    anime: 'My Hero Academia',
    aliases: ['mha', 'bnha', 'boku no hero academia'],
    kind: 'OP 1',
    song: 'THE DAY',
    artist: 'Porno Graffitti',
    year: 2016,
    studio: 'Bones',
    tier: 'easy',
    clue1: 'Rapid-fire electric guitar sprint backed by UA High hero silhouettes.',
    clue2: 'Quirkless middle schooler eats a hair strand to inherit One For All.',
  },
  {
    anime: 'SPY x FAMILY',
    aliases: ['spy x family', 'spyxfamily', 'sxf'],
    kind: 'OP 1',
    song: 'Mixed Nuts',
    artist: 'Official HIGE DANdism',
    year: 2022,
    studio: 'Wit Studio',
    tier: 'medium',
    clue1: 'Frenetic jazz-piano chaos fitting a fake family hiding double lives.',
    clue2: 'A spy dad, an assassin mom, and a pink-haired peanut-loving telepath.',
  },
  {
    anime: 'Haikyu!!',
    aliases: ['haikyu', 'haikyuu'],
    kind: 'OP 1',
    song: 'Imagination',
    artist: 'SPYAIR',
    year: 2014,
    studio: 'Production I.G',
    tier: 'medium',
    clue1: 'Uplifting stadium rock soaring alongside a quick-attack volleyball toss.',
    clue2: 'Tiny orange-haired decoy Hinata teams up with setter Kageyama at Karasuno.',
  },
  {
    anime: 'Violet Evergarden',
    aliases: ['violet', 've'],
    kind: 'OP 1',
    song: 'Sincerely',
    artist: 'TRUE',
    year: 2018,
    studio: 'Kyoto Animation',
    tier: 'hard',
    clue1: 'Lush orchestral strings and delicate soaring vocals about learning "I love you."',
    clue2: 'Auto Memory Doll with mechanical silver arms writing heartfelt letters.',
  },
  {
    anime: 'Puella Magi Madoka Magica',
    aliases: ['madoka', 'madoka magica', 'pmmm'],
    kind: 'OP 1',
    song: 'Connect',
    artist: 'ClariS',
    year: 2011,
    studio: 'Shaft',
    tier: 'hard',
    clue1: 'Deceptively cheerful idol pop hiding one of anime’s darkest magical girl tragedies.',
    clue2: 'Red-eyed white ferret Kyubey offers wishes in exchange for grief seeds.',
  },
  {
    anime: 'Bakemonogatari',
    aliases: ['monogatari', 'nisemonogatari'],
    kind: 'OP 4',
    song: 'Renai Circulation',
    artist: 'Kana Hanazawa',
    year: 2009,
    studio: 'Shaft',
    tier: 'medium',
    clue1: '"Se-no!" — the internet’s most remixed flute & whisper cute anime opening.',
    clue2: 'Araragi helps Nadeko Sengoku untangle an invisible snake curse.',
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
    anime: 'Death Note',
    aliases: ['dn'],
    tier: 'easy',
    prompt: 'Deduce this cat-and-mouse psychological thriller:',
    clues: [
      'Clue 1: Features dramatic classical choir chants over furious pen strokes.',
      'Clue 2: A barefoot sweet-tooth detective sits crouched in a white chair.',
      'Clue 3: Ryuk drops a black notebook from the Shinigami Realm in Tokyo.',
    ],
    options: ['Death Note', 'Monster', 'Psycho-Pass', 'Code Geass'],
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
    anime: 'Steins;Gate',
    aliases: ['steins gate', 'sg'],
    tier: 'medium',
    prompt: 'Solve this Akihabara time-loop mystery:',
    clues: [
      'Clue 1: A mysterious CRT TV downstairs controls whether experiments work.',
      'Clue 2: Diverges across worldlines measured by a glowing Nixie tube meter.',
      'Clue 3: "I am mad scientist! It’s so cool! Sonuvabitch!" — El Psy Kongroo.',
    ],
    options: ['Steins;Gate', 'ERASED', 'Re:ZERO', 'Link Click'],
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
    anime: 'Re:ZERO -Starting Life in Another World-',
    aliases: ['rezero', 're zero'],
    tier: 'hard',
    prompt: 'Name this brutal isekai suffering loop:',
    clues: [
      'Clue 1: An eerie witch-whisper sound effect plays whenever checkpoints trigger.',
      'Clue 2: Features giant murderous white rabbits and a Mansion full of loops.',
      'Clue 3: Subaru Natsuki resets to an appa fruit stand with Return by Death.',
    ],
    options: ['Re:ZERO -Starting Life in Another World-', 'Konosuba', 'Mushoku Tensei', 'Overlord'],
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

interface CreativePromptItem {
  sig: string;
  kind: 'emoji_plot' | 'quote_match' | 'odd_one_out';
  difficulty: QuizDifficultyLevel;
  animeTitle: string;
  prompt: string;
  clues: [string, string, string];
  options: [string, string, string, string];
  correctAnswer: string;
  aliases?: string[];
}

const CREATIVE_BANK: CreativePromptItem[] = [
  // Emoji Plot Decoders
  {
    sig: 'emoji:deathnote',
    kind: 'emoji_plot',
    difficulty: 'easy',
    animeTitle: 'Death Note',
    prompt: 'Emoji Plot Decoder: 📓 🍎 ✍️ ⚖️',
    clues: ['Genre: Psychological Thriller', 'A notebook drops from another realm.', 'An L vs Kira battle of wits.'],
    options: ['Death Note', 'Code Geass', 'Monster', 'Mirai Nikki'],
    correctAnswer: 'Death Note',
    aliases: ['dn'],
  },
  {
    sig: 'emoji:fmab',
    kind: 'emoji_plot',
    difficulty: 'easy',
    animeTitle: 'Fullmetal Alchemist: Brotherhood',
    prompt: 'Emoji Plot Decoder: 🦾 ⚗️ 🪨 🐕',
    clues: ['Studio: Bones (2009)', 'Law of Equivalent Exchange.', 'Elric brothers hunting a red stone.'],
    options: ['Fullmetal Alchemist: Brotherhood', 'D.Gray-man', 'Blue Exorcist', 'Soul Eater'],
    correctAnswer: 'Fullmetal Alchemist: Brotherhood',
    aliases: ['fmab', 'fma'],
  },
  {
    sig: 'emoji:csm',
    kind: 'emoji_plot',
    difficulty: 'easy',
    animeTitle: 'Chainsaw Man',
    prompt: 'Emoji Plot Decoder: 🪚 😈 🍞 🐕',
    clues: ['Studio: MAPPA', 'Protagonist dreams of jam on toast.', 'Orange dog devil named Pochita.'],
    options: ['Chainsaw Man', 'Jujutsu Kaisen', 'Hell’s Paradise', 'Dorohedoro'],
    correctAnswer: 'Chainsaw Man',
    aliases: ['csm'],
  },
  {
    sig: 'emoji:steins',
    kind: 'emoji_plot',
    difficulty: 'medium',
    animeTitle: 'Steins;Gate',
    prompt: 'Emoji Plot Decoder: 🕰️ 🍌 📡 📱',
    clues: ['2011 White Fox sci-fi masterpiece.', 'Green gelled fruit inside a microwave.', 'Set in Akihabara radio building.'],
    options: ['Steins;Gate', 'ERASED', 'Link Click', 'Vivy'],
    correctAnswer: 'Steins;Gate',
    aliases: ['steins gate', 'sg'],
  },
  {
    sig: 'emoji:frieren',
    kind: 'emoji_plot',
    difficulty: 'medium',
    animeTitle: 'Frieren: Beyond Journey’s End',
    prompt: 'Emoji Plot Decoder: 🧝‍♀️ 🪄 ⌛ 💎',
    clues: ['Begins AFTER defeating the Demon King.', '1,000-year-old elf learns human grief.', 'Studio Madhouse, 2023.'],
    options: ['Frieren: Beyond Journey’s End', 'Mushoku Tensei', 'Delicious in Dungeon', 'Ancient Magus’ Bride'],
    correctAnswer: 'Frieren: Beyond Journey’s End',
    aliases: ['frieren'],
  },
  {
    sig: 'emoji:onk',
    kind: 'emoji_plot',
    difficulty: 'medium',
    animeTitle: 'Oshi no Ko',
    prompt: 'Emoji Plot Decoder: 🌟 👁️ 🎤 🏥',
    clues: ['Theme song "Idol" by YOASOBI.', 'Reincarnation inside Japan’s entertainment industry.', 'Starry eyes hide deadly secrets.'],
    options: ['Oshi no Ko', 'Perfect Blue', 'Zombieland Saga', 'Ya Boy Kongming!'],
    correctAnswer: 'Oshi no Ko',
    aliases: ['onk'],
  },
  {
    sig: 'emoji:dandadan',
    kind: 'emoji_plot',
    difficulty: 'hard',
    animeTitle: 'Dan Da Dan',
    prompt: 'Emoji Plot Decoder: 👽 👻 👵 🏃',
    clues: ['Aliens + Ghosts collide in Episode 1.', 'Science SARU kinetic animation (2024).', 'Watch out for Turbo Granny’s 100 km/h sprint.'],
    options: ['Dan Da Dan', 'Mob Psycho 100', 'FLCL', 'Undead Unluck'],
    correctAnswer: 'Dan Da Dan',
    aliases: ['dandadan'],
  },
  {
    sig: 'emoji:bocchi',
    kind: 'emoji_plot',
    difficulty: 'medium',
    animeTitle: 'Bocchi the Rock!',
    prompt: 'Emoji Plot Decoder: 🎸 📦 🎀 🍺',
    clues: ['CloverWorks music comedy.', 'Introvert shreds guitar inside a ripe mango box.', 'Kessoku Band at STARRY live house.'],
    options: ['Bocchi the Rock!', 'K-On!', 'Girls Band Cry', 'NANA'],
    correctAnswer: 'Bocchi the Rock!',
    aliases: ['bocchi', 'btr'],
  },
  {
    sig: 'emoji:oddtaxi',
    kind: 'emoji_plot',
    difficulty: 'hard',
    animeTitle: 'Odd Taxi',
    prompt: 'Emoji Plot Decoder: 🚕 🦭 🎤 🕵️',
    clues: ['13-episode 2021 mystery thriller.', 'Dialogues during late-night cab fares.', 'Main character is a 41-year-old walrus driver.'],
    options: ['Odd Taxi', 'BEASTARS', 'Baccano!', 'Durarara!!'],
    correctAnswer: 'Odd Taxi',
    aliases: ['oddtaxi'],
  },
  // Famous Anime Quotes
  {
    sig: 'quote:honoredone',
    kind: 'quote_match',
    difficulty: 'easy',
    animeTitle: 'Jujutsu Kaisen',
    prompt: 'Iconic Quote: “Throughout Heaven and Earth, I alone am the honored one.”',
    clues: ['Spoken mid-air above Tokyo Jujutsu High.', 'Studio MAPPA (Hidden Inventory arc).', 'White hair + Limitless Hollow Purple.'],
    options: ['Jujutsu Kaisen', 'Bleach', 'Record of Ragnarok', 'Fate/Zero'],
    correctAnswer: 'Jujutsu Kaisen',
    aliases: ['jjk'],
  },
  {
    sig: 'quote:believeinme',
    kind: 'quote_match',
    difficulty: 'medium',
    animeTitle: 'Gurren Lagann',
    prompt: 'Iconic Quote: “Don’t believe in yourself. Believe in the me that believes in you!”',
    clues: ['2007 Studio Gainax mecha classic.', 'Pointed sunglasses and core drills.', 'Kamina inspiring Simon underground.'],
    options: ['Gurren Lagann', 'Kill la Kill', 'Evangelion', 'Code Geass'],
    correctAnswer: 'Gurren Lagann',
    aliases: ['ttgl'],
  },
  {
    sig: 'quote:noenemies',
    kind: 'quote_match',
    difficulty: 'medium',
    animeTitle: 'Vinland Saga',
    prompt: 'Iconic Quote: “You have no enemies. Nobody in the world is your enemy.”',
    clues: ['Norse historical drama.', 'Thors lecturing young Thorfinn in Iceland.', 'Wit Studio (S1) & MAPPA (S2).'],
    options: ['Vinland Saga', 'Berserk', 'Kingdom', 'Vagabond'],
    correctAnswer: 'Vinland Saga',
    aliases: ['vinland'],
  },
  {
    sig: 'quote:whathappens',
    kind: 'quote_match',
    difficulty: 'hard',
    animeTitle: 'Cowboy Bebop',
    prompt: 'Iconic Quote: “Whatever happens, happens.”',
    clues: ['1998 Sunrise space-western noir.', 'Soundtrack composed by Yoko Kanno.', 'Spike Spiegelaboard the Bebop cruiser.'],
    options: ['Cowboy Bebop', 'Samurai Champloo', 'Trigun', 'Space Dandy'],
    correctAnswer: 'Cowboy Bebop',
    aliases: ['bebop'],
  },
  {
    sig: 'quote:fakevalue',
    kind: 'quote_match',
    difficulty: 'hard',
    animeTitle: 'Bakemonogatari',
    prompt: 'Iconic Quote: “The fake is of far greater value. In its attempt to be real, it’s more real than the real thing.”',
    clues: ['Studio Shaft surrealist dialogue.', 'Kaiki Deishuu speaking on oddities.', 'Features "Renai Circulation".'],
    options: ['Bakemonogatari', 'Oregairu', 'Hyouka', 'Rascal Does Not Dream'],
    correctAnswer: 'Bakemonogatari',
    aliases: ['monogatari', 'nisemonogatari'],
  },
  // Odd One Out Puzzles
  {
    sig: 'odd:mappa',
    kind: 'odd_one_out',
    difficulty: 'medium',
    animeTitle: 'Demon Slayer',
    prompt: 'Odd One Out: Three of these hits were animated by MAPPA. Which one was NOT?',
    clues: ['Look closely at the breathing-style action hit.', 'It was actually animated by ufotable!', 'Its OP "Gurenge" dominated 2019.'],
    options: ['Jujutsu Kaisen', 'Chainsaw Man', 'Hell’s Paradise', 'Demon Slayer'],
    correctAnswer: 'Demon Slayer',
  },
  {
    sig: 'odd:kyoani',
    kind: 'odd_one_out',
    difficulty: 'hard',
    animeTitle: 'Bocchi the Rock!',
    prompt: 'Odd One Out: Which of these anime was NOT produced by Kyoto Animation?',
    clues: ['Three are famous KyoAni masterpieces.', 'Look at the 2022 Shimokitazawa band hit.', 'CloverWorks animated the impostor.'],
    options: ['Violet Evergarden', 'A Silent Voice', 'K-On!', 'Bocchi the Rock!'],
    correctAnswer: 'Bocchi the Rock!',
  },
  {
    sig: 'odd:sawano',
    kind: 'odd_one_out',
    difficulty: 'hard',
    animeTitle: 'Made in Abyss',
    prompt: 'Odd One Out: Three soundtracks were composed by Hiroyuki Sawano. Which one was NOT?',
    clues: ['Kevin Penkin composed the impostor’s orchestral score.', 'All four feature monumental drops or action.', 'Released in 2017 by Kinema Citrus.'],
    options: ['Attack on Titan', 'Solo Leveling', 'Kill la Kill', 'Made in Abyss'],
    correctAnswer: 'Made in Abyss',
  },
  {
    sig: 'odd:yukikaji',
    kind: 'odd_one_out',
    difficulty: 'hard',
    animeTitle: 'Satoru Gojo',
    prompt: 'Voice Actor Twist: Three of these characters are voiced by Yuki Kaji in Japanese. Who is NOT?',
    clues: ['Think about Titans, half-cold heroes & Echoes Stand.', 'One is voiced by Yuichi Nakamura instead!', 'Famous for Infinity & Six Eyes.'],
    options: ['Eren Yeager', 'Shoto Todoroki', 'Koichi Hirose', 'Satoru Gojo'],
    correctAnswer: 'Satoru Gojo',
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
  three_sec: [1, 3, 10, 30],
};

export const SNIPPET_LADDER_BY_DIFFICULTY: Record<QuizDifficultyFilter, number[]> = {
  all: [1, 3, 10, 30],
  easy: [1, 3, 10, 30],
  medium: [1, 3, 10, 30],
  hard: [1, 3, 10, 30],
};

export const DIFFICULTY_META: Record<
  QuizDifficultyLevel,
  { label: string; multiplier: number; starterSec: number; blurPx: [number, number, number] }
> = {
  easy: { label: 'Easy', multiplier: 1.0, starterSec: 1, blurPx: [10, 4, 1] },
  medium: { label: 'Medium', multiplier: 1.25, starterSec: 1, blurPx: [14, 6, 2] },
  hard: { label: 'Hard', multiplier: 1.75, starterSec: 1, blurPx: [18, 9, 3] },
};

export function normalizeTierToDifficulty(
  tier: 'easy' | 'medium' | 'hard' | 'impossible' | undefined
): QuizDifficultyLevel {
  if (tier === 'easy') return 'easy';
  if (tier === 'medium') return 'medium';
  return 'hard';
}

function classifyAnimeDifficulty(anime: Anime): QuizDifficultyLevel {
  const pop = anime.popularity ?? 0;
  if (pop >= 220_000) return 'easy';
  if (pop >= 65_000) return 'medium';
  return 'hard';
}

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

  // Category 1: OP/ED Audio Blitz (1s -> 3s -> 10s -> 30s)
  const tiers: Array<{ tier: SeedTheme['tier']; points: number; clipSec: number }> = [
    { tier: 'easy', points: 100, clipSec: 1 },
    { tier: 'medium', points: 200, clipSec: 1 },
    { tier: 'hard', points: 400, clipSec: 1 },
    { tier: 'impossible', points: 600, clipSec: 1 },
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
      difficulty: normalizeTierToDifficulty(tier),
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
      difficulty: idx === 0 ? 'easy' : idx === 1 ? 'medium' : 'hard',
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
    const poolByTier = HERALEN_RIDDLES.filter((r) => r.tier === tier);
    const pick =
      poolByTier[Math.floor(Math.random() * poolByTier.length)] ??
      HERALEN_RIDDLES[idx % HERALEN_RIDDLES.length];
    return {
      id: `jp-riddle-${riddlePoints[idx]}-${pick.anime}`,
      categoryId: 'riddle',
      points: riddlePoints[idx],
      difficulty: normalizeTierToDifficulty(tier),
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
    const diff: QuizDifficultyLevel = idx === 0 ? 'easy' : idx === 1 ? 'medium' : 'hard';
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
        difficulty: diff,
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
      difficulty: diff,
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
      subtitle: '1s → 30s Audio',
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
  difficulty?: QuizDifficultyFilter;
}): InfiniteQuizQuestion {
  const seen = getSeenQuizKeys();
  const exclude = opts.sessionExclude ?? new Set<string>();
  const wantedDiff = opts.difficulty && opts.difficulty !== 'all' ? opts.difficulty : null;
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

  // Build candidate question generators (curated audio, curated riddles + dynamic catalog items)
  const candidates: InfiniteQuizQuestion[] = [];

  for (const theme of ICONIC_THEMES) {
    if (opts.preferKind && opts.preferKind !== 'audio') continue;
    const matchesMyList =
      listItems.length > 0 &&
      listItems.some(
        (m) =>
          m.title.toLowerCase().includes(theme.anime.toLowerCase()) ||
          theme.anime.toLowerCase().includes(m.title.toLowerCase())
      );
    if (opts.scope === 'mylist' && listItems.length >= 2 && !matchesMyList) continue;

    const diff = normalizeTierToDifficulty(theme.tier);
    const sig = `audio:${theme.song.toLowerCase()}`;
    if (exclude.has(sig)) continue;
    const starterSec = DIFFICULTY_META[diff].starterSec;
    candidates.push({
      id: `${sig}-${Math.random().toString(36).slice(2, 7)}`,
      signature: sig,
      kind: 'audio',
      difficulty: diff,
      animeTitle: theme.anime,
      prompt: `${starterSec}s Audio Blitz — which anime features ${theme.kind}: “${theme.song}”?`,
      clues: [
        `Premiere: ${theme.year} · Studio: ${theme.studio}`,
        theme.clue1,
        theme.clue2,
      ],
      songTitle: theme.song,
      artist: theme.artist,
      audioQuery: `${theme.song} ${theme.artist}`,
      initialClipSec: starterSec,
      options: buildOptionsForTitle(theme.anime, distractorTitles),
      correctAnswer: theme.anime,
      aliases: theme.aliases,
      fromMyList: matchesMyList,
    });
  }

  for (const riddle of HERALEN_RIDDLES) {
    if (opts.preferKind && opts.preferKind !== 'riddle_trivia') continue;
    if (opts.scope === 'mylist') continue;
    const diff = normalizeTierToDifficulty(riddle.tier);
    const sig = `riddle:${riddle.anime.toLowerCase()}`;
    if (exclude.has(sig)) continue;
    candidates.push({
      id: `${sig}-${Math.random().toString(36).slice(2, 7)}`,
      signature: sig,
      kind: 'riddle_trivia',
      difficulty: diff,
      animeTitle: riddle.anime,
      prompt: riddle.prompt,
      clues: [...riddle.clues],
      options: [...riddle.options].sort(() => Math.random() - 0.5),
      correctAnswer: riddle.anime,
      aliases: riddle.aliases,
      fromMyList: false,
    });
  }

  // Dynamic questions across hundreds of catalog / user list titles
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5).slice(0, 75);
  for (const anime of shuffledPool) {
    const isInList = Boolean(opts.entries?.[anime.id]);
    const diff = classifyAnimeDifficulty(anime);
    const starterSec = DIFFICULTY_META[diff].starterSec;
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
    if (opts.preferKind && chosenKind !== opts.preferKind) continue;

    const sig = `${chosenKind}:${anime.id}`;
    if (exclude.has(sig)) continue;

    if (chosenKind === 'audio' && anime.malId) {
      candidates.push({
        id: `${sig}-${Math.random().toString(36).slice(2, 7)}`,
        signature: sig,
        kind: 'audio',
        difficulty: diff,
        animeTitle: anime.title,
        malId: anime.malId,
        prompt: `Mystery ${starterSec}s Opening/Ending — identify this series!`,
        clues: [
          `Genres: ${(anime.genres ?? []).slice(0, 3).join(', ') || 'Anime'}`,
          `${studio ? `Studio: ${studio}` : 'Series'}${yearStr ? ` (${yearStr})` : ''}`,
          synopsisHint || `${anime.episodes ?? '?'} episodes`,
        ],
        initialClipSec: starterSec,
        options: buildOptionsForTitle(anime.title, distractorTitles),
        correctAnswer: anime.title,
        fromMyList: isInList,
      });
    } else if (chosenKind === 'visual_crop') {
      candidates.push({
        id: `${sig}-${Math.random().toString(36).slice(2, 7)}`,
        signature: sig,
        kind: 'visual_crop',
        difficulty: diff,
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
        difficulty: diff,
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
        difficulty: diff,
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

  // Creative Bank: Emoji Plot Decoders, Famous Quotes, Odd One Out
  for (const item of CREATIVE_BANK) {
    if (opts.preferKind && opts.preferKind !== item.kind) continue;
    if (exclude.has(item.sig)) continue;
    candidates.push({
      id: `${item.sig}-${Math.random().toString(36).slice(2, 7)}`,
      signature: item.sig,
      kind: item.kind,
      difficulty: item.difficulty,
      animeTitle: item.animeTitle,
      prompt: item.prompt,
      clues: [...item.clues],
      options: [...item.options].sort(() => Math.random() - 0.5),
      correctAnswer: item.correctAnswer,
      aliases: item.aliases,
      fromMyList: false,
    });
  }

  // Dynamic Stat Clash questions (highest rated / earliest premiere / longest run across 4 anime)
  if (!opts.preferKind || opts.preferKind === 'stat_clash') {
    const statPool = allCatalog
      .filter((a) => (a.score ?? 0) > 5 && (a.year ?? 0) > 1985 && (a.episodes ?? 0) > 0)
      .sort(() => Math.random() - 0.5)
      .slice(0, 16);
    const clashSource =
      statPool.length >= 4
        ? statPool
        : FALLBACK_DUEL_CATALOG.map((d) => ({
            id: d.id,
            title: d.title,
            score: d.score,
            year: d.year,
            episodes: d.episodes,
            studios: d.studio ? [d.studio] : [],
          }));
    const four = [...clashSource].sort(() => Math.random() - 0.5).slice(0, 4);
    if (four.length === 4) {
      const modeRoll = Math.floor(Math.random() * 3);
      if (modeRoll === 0) {
        const winner = [...four].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
        candidates.push({
          id: `stat-score-${winner.id}-${Math.random().toString(36).slice(2, 6)}`,
          signature: `stat_clash:score:${four.map((f) => f.id).sort().join(',')}`,
          kind: 'stat_clash',
          difficulty: 'medium',
          animeTitle: winner.title,
          prompt: `Stat Clash: Which of these 4 anime has the HIGHEST AniList community score?`,
          clues: [
            `Score spread: ${Math.min(...four.map((x) => x.score ?? 0)).toFixed(1)}★ to ${Math.max(...four.map((x) => x.score ?? 0)).toFixed(1)}★`,
            `Animated by ${winner.studios?.[0] || 'a major Japanese studio'}`,
            `Premiered in ${winner.year ?? 'the modern era'}`,
          ],
          options: four.map((f) => f.title).sort(() => Math.random() - 0.5),
          correctAnswer: winner.title,
        });
      } else if (modeRoll === 1) {
        const winner = [...four].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))[0];
        candidates.push({
          id: `stat-year-${winner.id}-${Math.random().toString(36).slice(2, 6)}`,
          signature: `stat_clash:year:${four.map((f) => f.id).sort().join(',')}`,
          kind: 'stat_clash',
          difficulty: 'easy',
          animeTitle: winner.title,
          prompt: `Time Capsule: Which of these 4 series premiered EARLIEST?`,
          clues: [
            `Oldest premiered in ${winner.year ?? 2000}`,
            `Studio behind the classic: ${winner.studios?.[0] || 'Classic Studio'}`,
            `Ran for ${winner.episodes ?? '?'} episodes`,
          ],
          options: four.map((f) => f.title).sort(() => Math.random() - 0.5),
          correctAnswer: winner.title,
        });
      } else {
        const winner = [...four].sort((a, b) => (b.episodes ?? 0) - (a.episodes ?? 0))[0];
        candidates.push({
          id: `stat-eps-${winner.id}-${Math.random().toString(36).slice(2, 6)}`,
          signature: `stat_clash:eps:${four.map((f) => f.id).sort().join(',')}`,
          kind: 'stat_clash',
          difficulty: 'hard',
          animeTitle: winner.title,
          prompt: `Episode Marathon: Which of these 4 anime ran for the MOST episodes?`,
          clues: [
            `Winner total: ${winner.episodes ?? '?'} episodes`,
            `Aired ${winner.year ?? 'originally'}`,
            `Studio: ${winner.studios?.[0] || 'Japan'}`,
          ],
          options: four.map((f) => f.title).sort(() => Math.random() - 0.5),
          correctAnswer: winner.title,
        });
      }
    }
  }

  // When difficulty isn't explicitly forced, randomly pick Easy / Medium / Hard so questions keep surprising the player!
  const rolledDiff: QuizDifficultyLevel = wantedDiff
    ? wantedDiff
    : (() => {
        const r = Math.random();
        return r < 0.34 ? 'easy' : r < 0.72 ? 'medium' : 'hard';
      })();
  const diffFiltered = candidates.filter((c) => c.difficulty === rolledDiff);
  const scopedPool = diffFiltered.length > 0 ? diffFiltered : candidates;

  // Strictly prioritize never-before-seen questions first!
  const unseen = scopedPool.filter((c) => !seen.has(c.signature));
  const preferredList = unseen.length > 0 ? unseen : scopedPool;
  const finalPool = preferredList.length > 0 ? preferredList : [candidates[0]].filter(Boolean);

  if (finalPool.length > 0) {
    return finalPool[Math.floor(Math.random() * finalPool.length)];
  }

  // Guaranteed safe fallback matching difficulty when possible
  const themedPool = wantedDiff
    ? ICONIC_THEMES.filter((t) => normalizeTierToDifficulty(t.tier) === wantedDiff)
    : ICONIC_THEMES;
  const src = themedPool.length > 0 ? themedPool : ICONIC_THEMES;
  const t = src[Math.floor(Math.random() * src.length)];
  const diff = normalizeTierToDifficulty(t.tier);
  return {
    id: `fallback-${Date.now()}`,
    signature: `audio:${t.song.toLowerCase()}`,
    kind: 'audio',
    difficulty: diff,
    animeTitle: t.anime,
    prompt: `${DIFFICULTY_META[diff].starterSec}s Audio Blitz — which anime features ${t.kind}: “${t.song}”?`,
    clues: [`${t.year} · ${t.studio}`, t.clue1, t.clue2],
    songTitle: t.song,
    artist: t.artist,
    audioQuery: `${t.song} ${t.artist}`,
    initialClipSec: DIFFICULTY_META[diff].starterSec,
    options: buildOptionsForTitle(t.anime, fallbackTitles),
    correctAnswer: t.anime,
    aliases: t.aliases,
  };
}

// =========================================================================
// Creative Expansion 1: Daily 10 Seeded Gauntlet + Emoji Share Result
// =========================================================================

const DAILY_STATE_KEY = 'listtube.quiz.daily.v1';

export interface DailyQuizResult {
  dateKey: string;
  score: number;
  correctCount: number;
  total: number;
  outcomes: ('hit' | 'miss')[];
  completedAt: number;
}

export function getTodayDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function seededPrng(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildDailyTenRound(dateKey = getTodayDateKey()): InfiniteQuizQuestion[] {
  const rand = seededPrng(`listtube-daily-${dateKey}`);
  const allTitles = ICONIC_THEMES.map((t) => t.anime);
  const shuffledThemes = seededShuffle(ICONIC_THEMES, rand);
  const shuffledRiddles = seededShuffle(HERALEN_RIDDLES, rand);
  const out: InfiniteQuizQuestion[] = [];

  // 5 Seeded OP/ED Audio questions
  for (let i = 0; i < 5 && i < shuffledThemes.length; i += 1) {
    const theme = shuffledThemes[i];
    const diff = normalizeTierToDifficulty(theme.tier);
    const distractors = seededShuffle(
      allTitles.filter((t) => t !== theme.anime),
      rand
    ).slice(0, 3);
    out.push({
      id: `daily-${dateKey}-audio-${i}-${theme.song}`,
      signature: `daily:${dateKey}:audio:${theme.song}`,
      kind: 'audio',
      difficulty: diff,
      animeTitle: theme.anime,
      prompt: `Daily OP/ED #${out.length + 1} (${theme.kind}) — identify the anime from audio:`,
      clues: [`Premiere: ${theme.year} · Studio: ${theme.studio}`, theme.clue1, theme.clue2],
      songTitle: theme.song,
      artist: theme.artist,
      audioQuery: `${theme.song} ${theme.artist}`,
      initialClipSec: DIFFICULTY_META[diff].starterSec,
      options: seededShuffle([theme.anime, ...distractors], rand),
      correctAnswer: theme.anime,
      aliases: theme.aliases,
    });
  }

  // 3 Seeded Lore Riddles
  for (let i = 0; i < 3 && i < shuffledRiddles.length; i += 1) {
    const r = shuffledRiddles[i];
    const diff = normalizeTierToDifficulty(r.tier);
    out.push({
      id: `daily-${dateKey}-riddle-${i}-${r.anime}`,
      signature: `daily:${dateKey}:riddle:${r.anime}`,
      kind: 'riddle_trivia',
      difficulty: diff,
      animeTitle: r.anime,
      prompt: r.prompt,
      clues: [...r.clues],
      options: seededShuffle([...r.options], rand),
      correctAnswer: r.anime,
      aliases: r.aliases,
    });
  }

  // 2 Seeded Studio / Year Meta questions
  const metaPicks = shuffledThemes.slice(5, 7);
  metaPicks.forEach((item, idx) => {
    const diff = idx === 0 ? 'medium' : 'hard';
    if (idx % 2 === 0) {
      const studios = Array.from(
        new Set([item.studio, 'MAPPA', 'Madhouse', 'Bones', 'ufotable', 'Wit Studio', 'Pierrot'])
      );
      const dist = seededShuffle(studios.filter((s) => s !== item.studio), rand).slice(0, 3);
      out.push({
        id: `daily-${dateKey}-studio-${item.anime}`,
        signature: `daily:${dateKey}:studio:${item.anime}`,
        kind: 'studio_year',
        difficulty: diff,
        animeTitle: item.anime,
        prompt: `Studio Challenge: Who animated ${item.anime} (${item.year})?`,
        clues: [`Theme: "${item.song}" by ${item.artist}`, item.clue1, item.clue2],
        options: seededShuffle([item.studio, ...dist], rand),
        correctAnswer: item.studio,
      });
    } else {
      const years = seededShuffle(
        [String(item.year), String(item.year - 2), String(item.year + 2), String(item.year - 4)],
        rand
      );
      out.push({
        id: `daily-${dateKey}-year-${item.anime}`,
        signature: `daily:${dateKey}:year:${item.anime}`,
        kind: 'studio_year',
        difficulty: diff,
        animeTitle: item.anime,
        prompt: `Premiere Year: When did ${item.anime} first air?`,
        clues: [`Studio: ${item.studio}`, `Theme: "${item.song}"`, item.clue2],
        options: years,
        correctAnswer: String(item.year),
      });
    }
  });

  return out;
}

export function getDailyQuizResult(dateKey = getTodayDateKey()): DailyQuizResult | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DAILY_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyQuizResult;
    return parsed?.dateKey === dateKey ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDailyQuizResult(result: DailyQuizResult): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DAILY_STATE_KEY, JSON.stringify(result));
  } catch {
    /* ignore */
  }
}

// =========================================================================
// Creative Expansion 2: Live Catalog Higher / Lower Duel
// =========================================================================

export type DuelMetric = 'score' | 'popularity' | 'year' | 'episodes';

export interface DuelCardItem {
  id: string;
  title: string;
  cover?: string;
  genres: string[];
  studio?: string;
  score: number;
  popularity: number;
  year: number;
  episodes: number;
}

export interface DuelMatchup {
  id: string;
  metric: DuelMetric;
  question: string;
  unitLabel: string;
  left: DuelCardItem;
  right: DuelCardItem;
  winner: 'left' | 'right';
}

const DUEL_BEST_KEY = 'listtube.duel.best.v1';

const FALLBACK_DUEL_CATALOG: DuelCardItem[] = [
  { id: 'd-fmab', title: 'Fullmetal Alchemist: Brotherhood', genres: ['Action', 'Adventure'], studio: 'Bones', score: 9.0, popularity: 340000, year: 2009, episodes: 64 },
  { id: 'd-frieren', title: 'Frieren: Beyond Journey’s End', genres: ['Adventure', 'Fantasy'], studio: 'Madhouse', score: 9.1, popularity: 260000, year: 2023, episodes: 28 },
  { id: 'd-aot', title: 'Attack on Titan', genres: ['Action', 'Drama'], studio: 'Wit Studio', score: 8.5, popularity: 410000, year: 2013, episodes: 25 },
  { id: 'd-steins', title: 'Steins;Gate', genres: ['Sci-Fi', 'Thriller'], studio: 'White Fox', score: 8.9, popularity: 250000, year: 2011, episodes: 24 },
  { id: 'd-hxh', title: 'Hunter x Hunter (2011)', genres: ['Action', 'Adventure'], studio: 'Madhouse', score: 8.9, popularity: 310000, year: 2011, episodes: 148 },
  { id: 'd-deathnote', title: 'Death Note', genres: ['Mystery', 'Thriller'], studio: 'Madhouse', score: 8.4, popularity: 395000, year: 2006, episodes: 37 },
  { id: 'd-bebop', title: 'Cowboy Bebop', genres: ['Action', 'Sci-Fi'], studio: 'Sunrise', score: 8.6, popularity: 195000, year: 1998, episodes: 26 },
  { id: 'd-eva', title: 'Neon Genesis Evangelion', genres: ['Drama', 'Mecha'], studio: 'Gainax', score: 8.3, popularity: 215000, year: 1995, episodes: 26 },
  { id: 'd-jjk', title: 'Jujutsu Kaisen', genres: ['Action', 'Supernatural'], studio: 'MAPPA', score: 8.5, popularity: 380000, year: 2020, episodes: 24 },
  { id: 'd-csm', title: 'Chainsaw Man', genres: ['Action', 'Horror'], studio: 'MAPPA', score: 8.4, popularity: 325000, year: 2022, episodes: 12 },
  { id: 'd-kny', title: 'Demon Slayer', genres: ['Action', 'Fantasy'], studio: 'ufotable', score: 8.2, popularity: 405000, year: 2019, episodes: 26 },
  { id: 'd-vinland', title: 'Vinland Saga', genres: ['Action', 'Drama'], studio: 'Wit Studio', score: 8.7, popularity: 220000, year: 2019, episodes: 24 },
  { id: 'd-naruto', title: 'Naruto Shippuden', genres: ['Action', 'Adventure'], studio: 'Pierrot', score: 8.2, popularity: 350000, year: 2007, episodes: 500 },
  { id: 'd-bocchi', title: 'Bocchi the Rock!', genres: ['Comedy', 'Music'], studio: 'CloverWorks', score: 8.7, popularity: 165000, year: 2022, episodes: 12 },
];

export function getDuelHighStreak(): number {
  if (typeof localStorage === 'undefined') return 0;
  return Number(localStorage.getItem(DUEL_BEST_KEY) || 0);
}

export function saveDuelHighStreak(streak: number): void {
  if (typeof localStorage === 'undefined') return;
  if (streak > getDuelHighStreak()) localStorage.setItem(DUEL_BEST_KEY, String(streak));
}

export function buildDuelMatchup(preferMetric?: DuelMetric): DuelMatchup {
  const live = animeStore
    .all()
    .filter(
      (a) =>
        (a.mediaType ?? 'ANIME') === 'ANIME' &&
        Boolean(a.title) &&
        (a.score ?? 0) > 4 &&
        (a.popularity ?? 0) > 5000 &&
        (a.year ?? 0) > 1980 &&
        (a.episodes ?? 0) > 0
    )
    .slice(0, 120)
    .map<DuelCardItem>((a) => ({
      id: a.id,
      title: a.title,
      cover: a.cover,
      genres: (a.genres ?? []).slice(0, 2),
      studio: a.studios?.[0],
      score: Number((a.score ?? 7.5).toFixed(1)),
      popularity: a.popularity ?? 50_000,
      year: a.year ?? 2015,
      episodes: a.episodes ?? 12,
    }));

  const pool = live.length >= 8 ? live : FALLBACK_DUEL_CATALOG;
  const metrics: DuelMetric[] = ['score', 'popularity', 'year', 'episodes'];
  const metric = preferMetric ?? metrics[Math.floor(Math.random() * metrics.length)];

  let left = pool[0];
  let right = pool[1];
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const a = pool[Math.floor(Math.random() * pool.length)];
    const b = pool[Math.floor(Math.random() * pool.length)];
    if (!a || !b || a.id === b.id) continue;
    if (Math.abs(a[metric] - b[metric]) > (metric === 'score' ? 0.15 : 0)) {
      left = a;
      right = b;
      break;
    }
  }

  // In 'year' duel, ask which aired EARLIER (older classical vs newer); in others, ask HIGHER
  const isYear = metric === 'year';
  const winner: 'left' | 'right' = isYear
    ? left.year <= right.year
      ? 'left'
      : 'right'
    : left[metric] >= right[metric]
      ? 'left'
      : 'right';

  const copyMap: Record<DuelMetric, { question: string; unitLabel: string }> = {
    score: { question: 'Which anime holds the HIGHER community score?', unitLabel: 'Score' },
    popularity: { question: 'Which series has MORE community members?', unitLabel: 'Fans' },
    year: { question: 'Which anime premiered EARLIER on TV?', unitLabel: 'Premiere' },
    episodes: { question: 'Which series ran for MORE episodes?', unitLabel: 'Episodes' },
  };

  return {
    id: `duel-${metric}-${left.id}-${right.id}-${Date.now()}`,
    metric,
    question: copyMap[metric].question,
    unitLabel: copyMap[metric].unitLabel,
    left,
    right,
    winner,
  };
}

// =========================================================================
// Creative Expansion 3: Otaku Rank Tier Progression
// =========================================================================

export interface QuizRankInfo {
  title: string;
  nextTitle: string | null;
  progressPct: number;
}

const RANK_THRESHOLDS = [
  { min: 0, title: 'Academy Student' },
  { min: 400, title: 'Genin Tracker' },
  { min: 1200, title: 'Chunin OP Sleuth' },
  { min: 2500, title: 'Jonin Trivia Master' },
  { min: 5000, title: 'ANBU Frame Reader' },
  { min: 9000, title: 'Kage Lore Champion' },
  { min: 15000, title: 'Grandmaster Otaku' },
];

export function getQuizRankInfo(bestScore: number, seenCount: number): QuizRankInfo {
  const power = Math.max(bestScore, seenCount * 95);
  let idx = 0;
  for (let i = 0; i < RANK_THRESHOLDS.length; i += 1) {
    if (power >= RANK_THRESHOLDS[i].min) idx = i;
  }
  const current = RANK_THRESHOLDS[idx];
  const next = RANK_THRESHOLDS[idx + 1] ?? null;
  const progressPct = next
    ? Math.min(100, Math.max(4, Math.round(((power - current.min) / (next.min - current.min)) * 100)))
    : 100;
  return {
    title: current.title,
    nextTitle: next?.title ?? null,
    progressPct,
  };
}
