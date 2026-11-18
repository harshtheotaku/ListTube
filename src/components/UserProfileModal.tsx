import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  MapPin,
  Sparkles,
  Star,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { LibraryState, ListEntry, PublicUserSummary, statusLabel } from '../types';
import { animeStore } from '../services/animeStore';
import {
  fetchFollowCounts,
  fetchFollowingIds,
  fetchPublicUserLibrary,
  fetchPublicUserProfile,
  toggleFollowUser,
} from '../services/community';
import { useCloudSync } from '../services/cloudSync';
import { computeTasteAffinity, formatUserScore } from '../services/scoring';
import { useSettings } from '../services/settings';
import { toast } from './Toast';

interface UserProfileViewProps {
  userIdOrHandle: string;
  myLibrary: LibraryState;
  onOpenAnime: (animeId: string) => void;
  onClose: () => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  userIdOrHandle,
  myLibrary,
  onOpenAnime,
  onClose,
}) => {
  const cloud = useCloudSync();
  const settings = useSettings();
  const [user, setUser] = useState<PublicUserSummary | null>(null);
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [listFilter, setListFilter] = useState<'ANIME' | 'MANGA'>('ANIME');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void fetchPublicUserProfile(userIdOrHandle).then(async (prof) => {
      if (cancelled) return;
      setUser(prof);
      if (!prof) {
        setLoading(false);
        return;
      }
      const [libRows, followCounts, myFollowing] = await Promise.all([
        fetchPublicUserLibrary(prof.id),
        fetchFollowCounts(prof.id),
        cloud.userId ? fetchFollowingIds(cloud.userId) : Promise.resolve([] as string[]),
      ]);
      if (cancelled) return;
      setEntries(libRows);
      setCounts(followCounts);
      setIsFollowing(myFollowing.includes(prof.id));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userIdOrHandle, cloud.userId]);

  const affinity = useMemo(
    () => computeTasteAffinity(myLibrary.entries, entries),
    [myLibrary.entries, entries]
  );

  const filteredEntries = useMemo(
    () => entries.filter((e) => (e.mediaType ?? 'ANIME') === listFilter),
    [entries, listFilter]
  );

  const favMedia = useMemo(
    () =>
      [...(user?.favoriteAnimeIds ?? []), ...(user?.favoriteMangaIds ?? [])]
        .map((id) => animeStore.get(id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a)),
    [user?.favoriteAnimeIds, user?.favoriteMangaIds]
  );

  const handleToggleFollow = async () => {
    if (!cloud.userId) {
      toast('Sign in with AniList or MyAnimeList to follow users');
      return;
    }
    if (!user || cloud.userId === user.id) return;
    try {
      const next = await toggleFollowUser(cloud.userId, user.id, isFollowing);
      setIsFollowing(next);
      setCounts((c) => ({
        ...c,
        followers: Math.max(0, c.followers + (next ? 1 : -1)),
      }));
      toast(next ? `Following ${user.displayName}` : `Unfollowed ${user.displayName}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Follow action failed');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8 text-white">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-full bg-[#272727] px-3.5 py-1.5 text-[12px] font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="h-44 animate-pulse rounded-3xl bg-white/10" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center text-white">
        <p className="text-[16px] font-bold">Profile not published yet</p>
        <p className="mt-1 text-[12.5px] text-[#AAAAAA]">
          This handle is a local-only comment or hasn’t connected via AniList / MAL Cloud yet.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-full bg-white px-5 py-2 text-[12px] font-bold text-black"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl space-y-5 bg-[#0F0F0F] px-4 pb-24 pt-4 text-white sm:px-6 lg:px-8 lg:pb-16">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-full bg-[#272727] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#383838]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close profile"
          className="rounded-full bg-[#222222] p-1.5 text-[#AAAAAA] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Public Channel Hero */}
      <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#181818]">
        <div className="relative h-32 w-full bg-[#121212] sm:h-40">
          {user.bannerUrl ? (
            <img src={user.bannerUrl} alt={user.displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-r from-[#FF0000]/25 via-[#181818] to-[#3EA6FF]/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-black/20 to-transparent" />
        </div>

        <div className="relative -mt-12 flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              className="h-24 w-24 shrink-0 rounded-full border-4 border-[#181818] bg-black object-cover shadow-xl"
            />
            <div className="pb-1">
              <h1 className="text-[22px] font-black text-white">{user.displayName}</h1>
              <p className="text-[12.5px] font-semibold text-[#AAAAAA]">
                {user.handle} · {counts.followers} followers · {counts.following} following
              </p>
              {user.location && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#888888]">
                  <MapPin className="h-3 w-3" />
                  {user.location}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!((cloud.userId === user.id ? settings.profileVisibility : user.profileVisibility)?.hideStats) && (
              affinity.affinity !== null ? (
                <div
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-bold ${
                    affinity.affinity >= 50
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : affinity.affinity >= 0
                      ? 'border-[#3EA6FF]/40 bg-[#3EA6FF]/15 text-[#7DD3FC]'
                      : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    {affinity.affinity > 0 ? `+${affinity.affinity}%` : `${affinity.affinity}%`} Taste Affinity
                  </span>
                  <span className="text-[10.5px] font-normal text-[#CCCCCC]">
                    ({affinity.sharedRated} rated shared)
                  </span>
                </div>
              ) : (
                <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-[#AAAAAA]">
                  {affinity.sharedTotal} shared titles
                </span>
              )
            )}

            {cloud.userId !== user.id && (
              <button
                type="button"
                onClick={() => void handleToggleFollow()}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold transition ${
                  isFollowing
                    ? 'bg-[#272727] text-white hover:bg-[#383838]'
                    : 'bg-[#F1F1F1] text-black hover:bg-white'
                }`}
              >
                {isFollowing ? <UserCheck className="h-4 w-4 text-emerald-400" /> : <UserPlus className="h-4 w-4" />}
                <span>{isFollowing ? 'Following' : 'Follow'}</span>
              </button>
            )}
          </div>
        </div>

        {user.bio && (
          <p className="border-t border-white/[0.06] px-5 py-3 text-[13px] text-neutral-300">
            {user.bio}
          </p>
        )}
      </div>

      {/* Favorites Strip */}
      {!((cloud.userId === user.id ? settings.profileVisibility : user.profileVisibility)?.hideFavorites) && (favMedia.length > 0 || user.favoriteCharactersData.length > 0) && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-wider text-white">
            <Heart className="h-4 w-4 fill-rose-400 text-rose-400" />
            Favorites Showcase
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {favMedia.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpenAnime(m.id)}
                className="w-20 shrink-0 text-left"
              >
                <img src={m.cover} alt={m.title} className="aspect-[3/4] w-20 rounded-xl object-cover" />
                <p className="mt-1 line-clamp-1 text-[10.5px] font-semibold text-neutral-200">{m.title}</p>
              </button>
            ))}
            {user.favoriteCharactersData.map((ch) => (
              <div key={ch.id} className="w-20 shrink-0 text-center">
                <img src={ch.image} alt={ch.name} className="mx-auto h-16 w-16 rounded-full object-cover bg-black" />
                <p className="mt-1 line-clamp-1 text-[10.5px] font-semibold text-neutral-200">{ch.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Public List */}
      {(cloud.userId === user.id ? settings.profileVisibility : user.profileVisibility)?.hideLists ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-6 text-center text-[13px] text-[#AAAAAA]">
          Public Library is hidden by this user&apos;s Privacy Settings.
        </div>
      ) : (
      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-white">
            Public Library ({filteredEntries.length})
          </h2>
          <div className="flex rounded-full border border-white/10 bg-[#0F0F0F] p-0.5 text-[11.5px] font-bold">
            {(['ANIME', 'MANGA'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setListFilter(t)}
                className={`rounded-full px-3.5 py-1 transition ${
                  listFilter === t ? 'bg-[#FF0000] text-white' : 'text-[#AAAAAA]'
                }`}
              >
                {t === 'ANIME' ? 'Anime' : 'Manga'}
              </button>
            ))}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-[#AAAAAA]">No public {listFilter.toLowerCase()} entries yet.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {filteredEntries.slice(0, 60).map((e) => {
              const snap = animeStore.get(e.animeId);
              return (
                <button
                  key={e.animeId}
                  type="button"
                  onClick={() => onOpenAnime(e.animeId)}
                  className="flex items-center gap-3 rounded-xl bg-[#222222] p-2.5 text-left transition hover:bg-[#2C2C2C]"
                >
                  {snap?.cover ? (
                    <img src={snap.cover} alt={snap.title} className="h-14 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-14 w-10 shrink-0 rounded-lg bg-white/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-white">
                      {snap?.title || e.animeId}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#AAAAAA]">
                      {statusLabel(e.status, e.mediaType)}
                      {typeof e.progress === 'number' && e.progress > 0 ? ` · ${e.progress} ${listFilter === 'MANGA' ? 'ch' : 'ep'}` : ''}
                    </p>
                  </div>
                  {e.score ? (
                    <span className="flex shrink-0 items-center gap-0.5 text-[12px] font-bold text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {formatUserScore(e.score, settings.scoreFormat)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
};
