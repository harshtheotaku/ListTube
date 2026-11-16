import React, { useState } from 'react';
import { Bell, Check, MoreVertical, Play, Star } from 'lucide-react';
import { Anime, ListStatus, statusLabel } from '../types';
import { franchiseNameOf } from '../services/franchise';

interface AnimeCardProps {
  anime: Anime;
  onOpen: (anime: Anime) => void;
  onOpenChannel?: (anime: Anime) => void;
  status?: ListStatus;
  reason?: string;
  progress?: { watched: number; total?: number };
  onQuickAdd?: (anime: Anime) => void;
  priority?: boolean;
}

function formatMembers(popularity?: number): string | null {
  if (!popularity) return null;
  if (popularity >= 1_000_000) return `${(popularity / 1_000_000).toFixed(1)}M fans`;
  if (popularity >= 1_000) return `${Math.round(popularity / 1_000)}K fans`;
  return `${popularity} fans`;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({
  anime,
  onOpen,
  onOpenChannel,
  status,
  reason,
  progress,
  onQuickAdd,
  priority,
}) => {
  const [bannerFailed, setBannerFailed] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const isSubscribed = Boolean(status);
  const isManga = anime.mediaType === 'MANGA';
  const total = progress?.total ?? (isManga ? anime.chapters ?? 0 : anime.episodes ?? 0);
  const percent = progress && total > 0 ? Math.min(100, (progress.watched / total) * 100) : 0;

  // Channel name is the Anime/Manga Franchise Name (not studio)
  const channelTitle = franchiseNameOf(anime.title);

  // Strictly prefer official wide AniList bannerImage for Anime; Manga uses crisp 4:5 portrait covers!
  const officialWideBanner =
    !isManga &&
    !bannerFailed &&
    anime.hasOfficialBanner &&
    anime.banner &&
    anime.banner !== anime.cover
      ? anime.banner
      : null;

  const badgeDuration = isManga
    ? anime.chapters
      ? `${anime.chapters} ch`
      : anime.format || 'MANGA'
    : anime.episodes
    ? `${anime.episodes} ep`
    : anime.format || 'TV';

  const statsLine = [
    anime.score ? `${anime.score.toFixed(1)}★` : null,
    formatMembers(anime.popularity),
    anime.year ? String(anime.year) : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const openChannel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenChannel) onOpenChannel(anime);
    else onOpen(anime);
  };

  return (
    <div className="group relative flex w-full flex-col">
      {/* Thumbnail Container: 4:5 Portrait for Manga, 16:9 Landscape for Anime */}
      <div
        className={`relative w-full overflow-hidden rounded-xl bg-[#141418] ${
          isManga ? 'aspect-[4/5]' : 'aspect-video'
        }`}
      >
        {isManga ? (
          <img
            src={anime.cover}
            alt={anime.title}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : officialWideBanner ? (
          <img
            src={officialWideBanner}
            alt={anime.title}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setBannerFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 overflow-hidden bg-[#121216]">
            {!coverFailed && anime.cover && (
              <>
                <img
                  src={anime.cover}
                  alt=""
                  aria-hidden="true"
                  loading="eager"
                  className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-2xl"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/15 to-black/75" />
                <div className="absolute inset-0 z-[1] flex items-center justify-center">
                  <img
                    src={anime.cover}
                    alt={anime.title}
                    loading={priority ? 'eager' : 'lazy'}
                    decoding="async"
                    onError={() => setCoverFailed(true)}
                    className="h-full w-auto max-w-[70%] object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.9)] transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-70 transition-opacity group-hover:opacity-90" />

        <button
          type="button"
          onClick={() => onOpen(anime)}
          aria-label={`${anime.title}. Open watch page`}
          className="absolute inset-0 z-[2] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF0000]"
        />

        {!isManga && anime.trailerYoutubeId && (
          <span className="pointer-events-none absolute left-2 top-2 z-[3] flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            <Play className="h-2.5 w-2.5 fill-white" />
            Trailer
          </span>
        )}

        {status && (
          <span
            className={`pointer-events-none absolute right-2 top-2 z-[3] flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide backdrop-blur-md ${
              status === 'watching' ? 'bg-[#FF0000] text-white' : 'bg-black/80 text-neutral-200'
            }`}
          >
            {status === 'watching' ? (
              <Bell className="h-2.5 w-2.5 fill-current" />
            ) : (
              <Check className="h-2.5 w-2.5" />
            )}
            {statusLabel(status, anime.mediaType)}
          </span>
        )}

        <span className="pointer-events-none absolute bottom-2 right-2 z-[3] rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-semibold tracking-tight text-white">
          {badgeDuration}
        </span>

        {anime.score ? (
          <span className="pointer-events-none absolute bottom-2 left-2 z-[3] flex items-center gap-0.5 rounded bg-black/80 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-300">
            <Star className="h-2.5 w-2.5 fill-current" />
            {anime.score.toFixed(1)}
          </span>
        ) : null}

        {progress && percent > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-[3.5px] bg-white/25">
            <div className="h-full bg-[#FF0000]" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      {/* Metadata Row Below Thumbnail */}
      <div className="mt-2.5 flex items-start gap-2.5">
        {/* Clickable Channel Avatar (Anime/Manga Franchise Channel) */}
        <button
          type="button"
          onClick={openChannel}
          className="shrink-0 overflow-hidden rounded-full bg-[#272727] transition hover:ring-2 hover:ring-white/40 focus:outline-none"
          aria-label={`Open ${channelTitle} channel`}
          title={`Open ${channelTitle} channel`}
        >
          <img
            src={anime.cover}
            alt={channelTitle}
            loading="lazy"
            className="h-8 w-8 rounded-full object-cover sm:h-9 sm:w-9"
          />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen(anime)}
            className="w-full text-left focus:outline-none"
          >
            <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-[1.35] text-[#F1F1F1] group-hover:text-white sm:text-[14px]">
              {anime.title}
            </h3>
          </button>

          {/* Clickable Anime Franchise Channel Name */}
          <button
            type="button"
            onClick={openChannel}
            className="mt-0.5 flex max-w-full items-center gap-1 text-left text-[11.5px] text-[#AAAAAA] hover:text-white sm:text-[12px]"
          >
            <span className="truncate font-medium">{channelTitle}</span>
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#AAAAAA]/25 text-[8px] font-bold text-[#AAAAAA]"
              title="Franchise Channel"
            >
              ✓
            </span>
          </button>

          {statsLine && (
            <p className="truncate text-[11px] text-[#AAAAAA] sm:text-[12px]">{statsLine}</p>
          )}
          {reason && (
            <p className="mt-1 inline-flex max-w-full items-center truncate rounded bg-[#272727] px-1.5 py-0.5 text-[10px] font-medium text-neutral-200 sm:text-[10.5px]">
              {reason}
            </p>
          )}
        </div>

        {onQuickAdd && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onQuickAdd(anime);
            }}
            aria-label={
              isSubscribed
                ? `Manage subscription: ${statusLabel(status!, anime.mediaType)}`
                : 'Subscribe / Add to list'
            }
            title="Subscribe / Add to list"
            className={`shrink-0 rounded-full p-1 transition ${
              isSubscribed
                ? 'text-[#FF0000] hover:bg-white/10'
                : 'text-[#AAAAAA] hover:bg-white/10 hover:text-white'
            }`}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
