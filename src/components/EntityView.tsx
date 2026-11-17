import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  ExternalLink,
  Heart,
  Sparkles,
  Star,
  User,
} from 'lucide-react';
import {
  CharacterDetailExtra,
  MediaType,
  PersonCreditWork,
  StaffPersonDetail,
  StudioDetail,
  WikipediaSummary,
} from '../types';
import {
  fetchCharacterExtra,
  fetchStaffPersonDetail,
  fetchStudioDetail,
  fetchWikipediaSummary,
} from '../services/anilist';

export type EntityRouteTarget =
  | { kind: 'person'; idOrName: string }
  | { kind: 'character'; idOrName: string }
  | { kind: 'studio'; idOrName: string };

interface EntityViewProps {
  target: EntityRouteTarget;
  onBack: () => void;
  onOpenAnimeId: (animeId: string) => void;
}

type MediaFilter = 'ALL' | MediaType;
type WorkSort = 'popularity' | 'score' | 'year';

export const EntityView: React.FC<EntityViewProps> = ({
  target,
  onBack,
  onOpenAnimeId,
}) => {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffPersonDetail | null>(null);
  const [character, setCharacter] = useState<CharacterDetailExtra | null>(null);
  const [studio, setStudio] = useState<StudioDetail | null>(null);
  const [wiki, setWiki] = useState<WikipediaSummary | null>(null);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('ALL');
  const [sortBy, setSortBy] = useState<WorkSort>('popularity');
  const [staffPage, setStaffPage] = useState(1);
  const [loadingMoreStaff, setLoadingMoreStaff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStaff(null);
    setCharacter(null);
    setStudio(null);
    setWiki(null);
    setStaffPage(1);

    const run = async () => {
      let wikiQuery = '';
      try {
        if (target.kind === 'person') {
          const res = await fetchStaffPersonDetail(Number(target.idOrName));
          if (!cancelled) setStaff(res);
          wikiQuery = res?.name ?? '';
        } else if (target.kind === 'character') {
          const res = await fetchCharacterExtra(Number(target.idOrName));
          if (!cancelled) setCharacter(res);
          wikiQuery = res?.name ?? '';
        } else {
          const name = decodeURIComponent(target.idOrName);
          const res = await fetchStudioDetail(name);
          if (!cancelled) setStudio(res);
          wikiQuery = `${res?.name || name} animation studio`;
        }
      } catch {
        /* render graceful fallback if upstream fails */
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (wikiQuery) {
        const summary = await fetchWikipediaSummary(wikiQuery).catch(() => null);
        if (!cancelled) setWiki(summary);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [target.kind, target.idOrName]);

  const title =
    staff?.name ||
    character?.name ||
    studio?.name ||
    (target.kind === 'studio' ? decodeURIComponent(target.idOrName) : `#${target.idOrName}`);

  const nativeName = staff?.nativeName || character?.nativeName;
  const image = staff?.image || character?.image || studio?.works[0]?.cover;
  const rawBio = staff?.description || character?.description;
  const bio = rawBio
    ? rawBio
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/__|(\*\*)/g, '')
        .replace(/~!([\s\S]*?)!~/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : undefined;
  const externalAniList =
    staff?.siteUrl ||
    character?.siteUrl ||
    studio?.siteUrl ||
    (target.kind === 'person'
      ? `https://anilist.co/staff/${target.idOrName}`
      : target.kind === 'character'
      ? `https://anilist.co/character/${target.idOrName}`
      : undefined);

  const normalizedWorks: PersonCreditWork[] = useMemo(() => {
    if (staff) return staff.works;
    if (character) return character.appearances;
    if (studio) {
      return studio.works.map((w) => ({
        id: w.id,
        title: w.title,
        cover: w.cover,
        mediaType: w.mediaType,
        role: w.format || 'Production',
        year: w.year,
        score: w.score,
        popularity: w.popularity,
      }));
    }
    return [];
  }, [staff, character, studio]);

  const filteredWorks = useMemo(() => {
    const base = normalizedWorks.filter((w) =>
      mediaFilter === 'ALL' ? true : w.mediaType === mediaFilter
    );
    return [...base].sort((a, b) => {
      if (sortBy === 'score') return (b.score ?? 0) - (a.score ?? 0);
      if (sortBy === 'year') return (b.year ?? 0) - (a.year ?? 0);
      return (b.popularity ?? 0) - (a.popularity ?? 0);
    });
  }, [normalizedWorks, mediaFilter, sortBy]);

  return (
    <div className="mx-auto min-h-screen max-w-6xl space-y-6 bg-[#0F0F0F] px-4 pb-24 pt-5 text-white sm:px-6 lg:px-8 lg:pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#272727] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#383838]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          {externalAniList && (
            <a
              href={externalAniList}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-full bg-[#02A9FF]/20 px-3 py-1 font-bold text-[#7DD3FC] hover:bg-[#02A9FF]/35"
            >
              AniList <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <a
            href={`https://myanimelist.net/search/all?q=${encodeURIComponent(title)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-full bg-[#2E51A2]/25 px-3 py-1 font-bold text-[#93C5FD] hover:bg-[#2E51A2]/45"
          >
            MyAnimeList <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={`https://anime.fandom.com/wiki/Special:Search?query=${encodeURIComponent(title)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 font-bold text-amber-300 hover:bg-amber-500/25"
          >
            <BookOpen className="h-3 w-3" />
            Anime Wiki <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-44 animate-pulse rounded-3xl bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/[0.06]" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Hero Bio Card */}
          <div className="rounded-3xl border border-white/[0.1] bg-[#181818] p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {image ? (
                <img
                  src={image}
                  alt={title}
                  className="h-44 w-32 shrink-0 self-center rounded-2xl object-cover bg-[#121212] ring-1 ring-white/10 sm:self-start"
                />
              ) : (
                <div className="flex h-44 w-32 shrink-0 items-center justify-center rounded-2xl bg-[#242424] text-[#AAAAAA]">
                  {target.kind === 'studio' ? <Building2 className="h-10 w-10" /> : <User className="h-10 w-10" />}
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#FF0000]/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-300">
                    {target.kind === 'studio' ? 'Studio' : target.kind === 'character' ? 'Character' : 'Voice Actor / Staff'}
                  </span>
                  {(staff?.favourites || character?.favourites || studio?.favourites) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-pink-300">
                      <Heart className="h-3 w-3 fill-current" />
                      {(staff?.favourites || character?.favourites || studio?.favourites || 0).toLocaleString()} fans
                    </span>
                  )}
                </div>

                <div>
                  <h1 className="text-[24px] font-black tracking-tight text-white">{title}</h1>
                  {nativeName && <p className="text-[13px] text-[#AAAAAA]">{nativeName}</p>}
                </div>

                <div className="flex flex-wrap gap-2 text-[11.5px] text-neutral-300">
                  {staff?.primaryOccupations?.map((occ) => (
                    <span key={occ} className="rounded-lg bg-[#242424] px-2.5 py-1 font-semibold">
                      {occ}
                    </span>
                  ))}
                  {staff?.homeTown && (
                    <span className="rounded-lg bg-[#242424] px-2.5 py-1">From {staff.homeTown}</span>
                  )}
                  {(staff?.age || character?.age) && (
                    <span className="rounded-lg bg-[#242424] px-2.5 py-1">
                      Age: {staff?.age ?? character?.age}
                    </span>
                  )}
                  {staff?.yearsActive && staff.yearsActive.length > 0 && (
                    <span className="rounded-lg bg-[#242424] px-2.5 py-1">
                      Active: {staff.yearsActive.join('–')}
                    </span>
                  )}
                </div>

                {bio && (
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-[#CCCCCC]">
                    {bio}
                  </p>
                )}
              </div>
            </div>

            {/* Inline Wikipedia Reference Card (No Tab Switching Required) */}
            {wiki && (
              <div className="mt-5 rounded-2xl border border-white/[0.08] bg-[#121212] p-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#3EA6FF]">
                    <BookOpen className="h-3.5 w-3.5" />
                    Wikipedia Knowledge Panel · {wiki.title}
                  </span>
                  <a
                    href={wiki.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3EA6FF] hover:underline"
                  >
                    Read Full Article <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="text-[12.5px] leading-relaxed text-neutral-300">{wiki.extract}</p>
              </div>
            )}
          </div>

          {/* Sortable & Filterable Works Grid */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[17px] font-extrabold text-white">
                <Sparkles className="h-4 w-4 text-[#FF0000]" />
                {target.kind === 'studio'
                  ? `Catalog & Productions (${filteredWorks.length})`
                  : target.kind === 'character'
                  ? `Series Appearances (${filteredWorks.length})`
                  : `Filmography & Credits (${filteredWorks.length})`}
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                {target.kind !== 'studio' && (
                  <div className="flex items-center rounded-full border border-white/[0.1] bg-[#181818] p-0.5 text-[11.5px] font-bold">
                    {(['ALL', 'ANIME', 'MANGA'] as MediaFilter[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setMediaFilter(f)}
                        className={`rounded-full px-3 py-1 transition ${
                          mediaFilter === f ? 'bg-[#F1F1F1] text-black' : 'text-[#AAAAAA] hover:text-white'
                        }`}
                      >
                        {f === 'ALL' ? 'All' : f === 'ANIME' ? 'Anime' : 'Manga'}
                      </button>
                    ))}
                  </div>
                )}

                <select
                  aria-label="Sort credits"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as WorkSort)}
                  className="h-8 rounded-lg border border-white/[0.12] bg-[#181818] px-2.5 text-[11.5px] font-semibold text-white outline-none"
                >
                  <option value="popularity">Sort: Popularity</option>
                  <option value="score">Sort: Highest Rated</option>
                  <option value="year">Sort: Newest Year</option>
                </select>
              </div>
            </div>

            {filteredWorks.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-8 text-center text-[13px] text-[#AAAAAA]">
                No credits found for this filter.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {filteredWorks.map((work) => (
                  <button
                    key={`${work.id}-${work.role ?? ''}`}
                    type="button"
                    onClick={() => onOpenAnimeId(work.id)}
                    className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#181818] text-left transition hover:border-white/25 hover:bg-[#222222]"
                  >
                    <div className="relative aspect-[2/3] w-full overflow-hidden bg-black">
                      {work.cover && (
                        <img
                          src={work.cover}
                          alt={work.title}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      )}
                      {work.score && (
                        <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur-sm">
                          <Star className="h-2.5 w-2.5 fill-current" />
                          {work.score}
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-2 text-[12.5px] font-bold text-white">{work.title}</p>
                      <p className="mt-1 line-clamp-1 text-[10.5px] text-[#AAAAAA]">
                        {[work.role, work.year].filter(Boolean).join(' · ') || work.mediaType}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {target.kind === 'person' && staff?.hasMoreWorks && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={loadingMoreStaff}
                  onClick={async () => {
                    if (loadingMoreStaff) return;
                    const nextPage = staffPage + 1;
                    setLoadingMoreStaff(true);
                    try {
                      const more = await fetchStaffPersonDetail(Number(target.idOrName), nextPage);
                      if (more) {
                        setStaff((prev) => {
                          if (!prev) return more;
                          const seenIds = new Set(prev.works.map((w) => `${w.id}-${w.role ?? ''}`));
                          const appended = more.works.filter(
                            (w) => !seenIds.has(`${w.id}-${w.role ?? ''}`)
                          );
                          return {
                            ...prev,
                            works: [...prev.works, ...appended],
                            hasMoreWorks: more.hasMoreWorks,
                            totalWorks: more.totalWorks ?? prev.totalWorks,
                          };
                        });
                        setStaffPage(nextPage);
                      }
                    } finally {
                      setLoadingMoreStaff(false);
                    }
                  }}
                  className="rounded-full border border-white/[0.14] bg-[#272727] px-6 py-2.5 text-[12.5px] font-bold text-white transition hover:bg-[#383838] disabled:opacity-50"
                >
                  {loadingMoreStaff ? 'Loading more credits…' : 'Load More Credits'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
