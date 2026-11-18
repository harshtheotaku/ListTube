-- Standalone Tracker upgrades: Scoped API Keys, Episode Check-In Reactions & Community Ranking Indexes
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON public.user_api_keys (user_id, created_at DESC);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own api keys" ON public.user_api_keys;
CREATE POLICY "Users select own api keys" ON public.user_api_keys
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own api keys" ON public.user_api_keys;
CREATE POLICY "Users insert own api keys" ON public.user_api_keys
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users delete own api keys" ON public.user_api_keys;
CREATE POLICY "Users delete own api keys" ON public.user_api_keys
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.episode_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id text NOT NULL,
  episode integer NOT NULL CHECK (episode > 0),
  author_name text NOT NULL,
  author_handle text NOT NULL,
  author_avatar text,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (char_length(body) <= 280),
  is_spoiler boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, anime_id, episode)
);

CREATE INDEX IF NOT EXISTS idx_episode_reactions_lookup ON public.episode_reactions (anime_id, episode, created_at DESC);

ALTER TABLE public.episode_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read episode reactions" ON public.episode_reactions;
CREATE POLICY "Public read episode reactions" ON public.episode_reactions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users insert own episode reactions" ON public.episode_reactions;
CREATE POLICY "Users insert own episode reactions" ON public.episode_reactions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update own episode reactions" ON public.episode_reactions;
CREATE POLICY "Users update own episode reactions" ON public.episode_reactions
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users delete own episode reactions" ON public.episode_reactions;
CREATE POLICY "Users delete own episode reactions" ON public.episode_reactions
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_library_entries_anime_public
  ON public.library_entries (anime_id, status)
  WHERE is_private = false;

CREATE INDEX IF NOT EXISTS idx_media_catalog_ids
  ON public.media_catalog (media_type, anilist_id, mal_id);
