import { Anime, MediaType, RelatedTitle } from '../types';

export interface WatchOrderStep {
  step: number;
  id?: string;
  title: string;
  cover?: string;
  badge: string;
  note: string;
  essential: boolean;
  mediaType?: MediaType;
  isCurrent?: boolean;
}

export interface WatchOrderGuide {
  franchiseName: string;
  steps: WatchOrderStep[];
  curated: boolean;
}

interface CuratedFranchise {
  match: RegExp;
  franchiseName: string;
  steps: Omit<WatchOrderStep, 'step'>[];
}

const CURATED_FRANCHISES: CuratedFranchise[] = [
  {
    match: /fate\/(stay night|zero|unlimited blade|heaven)/i,
    franchiseName: 'Fate / Stay Night (Type-Moon Core)',
    steps: [
      { id: 'anilist:19603', title: 'Fate/stay night: Unlimited Blade Works', badge: 'Start #1', note: 'Best spoiler-free anime entry by ufotable', essential: true },
      { id: 'anilist:20792', title: 'Fate/stay night: Heaven’s Feel I–III Movies', badge: 'Route #2', note: 'Darker 3rd route movie trilogy', essential: true },
      { id: 'anilist:10087', title: 'Fate/Zero', badge: 'Prequel #3', note: 'Watch AFTER UBW/HF to preserve plot twists', essential: true },
      { id: 'anilist:108007', title: 'Fate/Grand Order: Babylonia', badge: 'Spin-Off', note: 'Standalone Singularity adaptation', essential: false },
    ],
  },
  {
    match: /(bakemonogatari|monogatari series|kizumonogatari|nisemonogatari)/i,
    franchiseName: 'Monogatari Series (Shaft Release / Novel Order)',
    steps: [
      { id: 'anilist:5081', title: 'Bakemonogatari (15 eps)', badge: 'Start #1', note: 'Classic mystery-supernatural introduction', essential: true },
      { id: 'anilist:9260', title: 'Kizumonogatari Movies I–III', badge: 'Prequel #2', note: 'Origin story movie trilogy', essential: true },
      { id: 'anilist:11597', title: 'Nisemonogatari', badge: 'Arc #3', note: 'Direct continuation after Bake', essential: true },
      { id: 'anilist:17074', title: 'Monogatari Series: Second Season', badge: 'Arc #4', note: 'Peak ensemble payoff across core arcs', essential: true },
      { id: 'anilist:21262', title: 'Owarimonogatari I & II', badge: 'Finale', note: 'Resolves the main Araragi storyline', essential: true },
    ],
  },
  {
    match: /steins;?gate/i,
    franchiseName: 'Steins;Gate (Recommended Broadcast Flow)',
    steps: [
      { id: 'anilist:9253', title: 'Steins;Gate (Ep 1–24)', badge: 'Start #1', note: 'Watch complete original series first', essential: true },
      { id: 'anilist:10863', title: 'Steins;Gate: Egoistic Poriomania (OVA)', badge: 'Epilogue', note: 'Lighthearted aftermath episode 25', essential: false },
      { id: 'anilist:21127', title: 'Steins;Gate 0', badge: 'Midquel #2', note: 'Alternate worldline path leading to the true ending', essential: true },
    ],
  },
  {
    match: /(a certain magical index|toaru|certain scientific railgun)/i,
    franchiseName: 'Toaru / Raildex Universe',
    steps: [
      { id: 'anilist:6213', title: 'A Certain Scientific Railgun', badge: 'Start #1', note: 'Best-paced Academy City entry point', essential: true },
      { id: 'anilist:4654', title: 'A Certain Magical Index', badge: 'Main #2', note: 'Magic side lore & Touma protagonist', essential: true },
      { id: 'anilist:16049', title: 'A Certain Scientific Railgun S', badge: 'Peak #3', note: 'Sisters Arc in full detail', essential: true },
      { id: 'anilist:104462', title: 'A Certain Scientific Railgun T', badge: 'Arc #4', note: 'Daihasei Festival & Dream Ranker', essential: false },
    ],
  },
  {
    match: /jojo'?s bizarre adventure/i,
    franchiseName: "JoJo's Bizarre Adventure (Chronological Parts)",
    steps: [
      { id: 'anilist:14719', title: 'Part 1 & 2: Phantom Blood / Battle Tendency', badge: 'Parts 1–2', note: 'Hamon origins & Joestar bloodline start', essential: true },
      { id: 'anilist:20474', title: 'Part 3: Stardust Crusaders', badge: 'Part 3', note: 'Introduces Stands (watch Egypt arc right after)', essential: true },
      { id: 'anilist:21450', title: 'Part 4: Diamond is Unbreakable', badge: 'Part 4', note: 'Morioh slice-of-mystery thriller', essential: true },
      { id: 'anilist:102883', title: 'Part 5: Golden Wind', badge: 'Part 5', note: 'Italy gang-star saga', essential: true },
      { id: 'anilist:131942', title: 'Part 6: Stone Ocean', badge: 'Part 6', note: 'Original universe conclusion', essential: true },
    ],
  },
  {
    match: /attack on titan|shingeki no kyojin/i,
    franchiseName: 'Attack on Titan (Main Continuity)',
    steps: [
      { id: 'anilist:16498', title: 'Attack on Titan Season 1', badge: 'Start #1', note: 'Episodes 1–25', essential: true },
      { id: 'anilist:20958', title: 'Attack on Titan Season 2', badge: 'Step #2', note: 'Season 2 (plus No Regrets OVA optional)', essential: true },
      { id: 'anilist:99147', title: 'Attack on Titan Season 3 (Part 1 & 2)', badge: 'Step #3', note: 'Uprising & Return to Shiganshina', essential: true },
      { id: 'anilist:110277', title: 'Attack on Titan: The Final Season (Parts 1–3)', badge: 'Finale #4', note: 'Final Marley & Rumbling conclusion', essential: true },
    ],
  },
];

const RELATION_ORDER_WEIGHT: Record<string, number> = {
  SOURCE: 1,
  PARENT: 2,
  PREQUEL: 3,
  SEQUEL: 5,
  ADAPTATION: 6,
  SIDE_STORY: 7,
  SPIN_OFF: 8,
  ALTERNATIVE: 9,
  SUMMARY: 10,
};

export function buildWatchOrderGuide(
  anime: Pick<Anime, 'id' | 'title' | 'titleRomaji' | 'cover' | 'mediaType' | 'similar'>
): WatchOrderGuide | null {
  const names = [anime.title, anime.titleRomaji].filter((x): x is string => Boolean(x));
  for (const name of names) {
    const preset = CURATED_FRANCHISES.find((f) => f.match.test(name));
    if (preset) {
      return {
        franchiseName: preset.franchiseName,
        curated: true,
        steps: preset.steps.map((s, i) => ({
          ...s,
          step: i + 1,
          isCurrent: s.id === anime.id,
        })),
      };
    }
  }

  const rels = (anime.similar ?? []).filter(
    (r): r is RelatedTitle => Boolean(r.relation && r.relation !== 'Recommendation')
  );
  if (rels.length === 0) return null;

  const prequels = rels.filter((r) => ['SOURCE', 'PARENT', 'PREQUEL'].includes(r.relation ?? ''));
  const sequels = rels.filter((r) => r.relation === 'SEQUEL');
  const extras = rels.filter((r) =>
    ['ADAPTATION', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE'].includes(r.relation ?? '')
  );

  prequels.sort(
    (a, b) =>
      (RELATION_ORDER_WEIGHT[a.relation ?? ''] ?? 9) -
      (RELATION_ORDER_WEIGHT[b.relation ?? ''] ?? 9)
  );

  const steps: Omit<WatchOrderStep, 'step'>[] = [
    ...prequels.slice(0, 3).map((r) => ({
      id: r.id,
      title: r.title,
      cover: r.cover,
      badge: r.relation === 'SOURCE' ? 'Original Source' : r.relation === 'PREQUEL' ? 'Watch Before' : 'Parent Story',
      note: r.relation === 'SOURCE' ? 'Manga / Light Novel origin' : 'Earlier timeline / story arc',
      essential: r.relation === 'PREQUEL' || r.relation === 'PARENT',
      mediaType: r.mediaType,
    })),
    {
      id: anime.id,
      title: anime.title,
      cover: anime.cover,
      badge: 'Current',
      note: 'Title you are viewing now',
      essential: true,
      mediaType: anime.mediaType,
      isCurrent: true,
    },
    ...sequels.slice(0, 3).map((r) => ({
      id: r.id,
      title: r.title,
      cover: r.cover,
      badge: 'Watch Next',
      note: 'Direct continuation / next season',
      essential: true,
      mediaType: r.mediaType,
    })),
    ...extras.slice(0, 3).map((r) => ({
      id: r.id,
      title: r.title,
      cover: r.cover,
      badge: (r.relation ?? 'Extra').replace(/_/g, ' '),
      note: r.relation === 'SIDE_STORY' ? 'Optional side story / OVA' : 'Companion / spin-off',
      essential: false,
      mediaType: r.mediaType,
    })),
  ];

  if (steps.length <= 1) return null;

  return {
    franchiseName: `${anime.title.split(':')[0]} Timeline`,
    curated: false,
    steps: steps.map((s, idx) => ({ ...s, step: idx + 1 })),
  };
}
