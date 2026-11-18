-- Enforce profile visibility preferences server-side across public profiles, libraries, and activity feeds
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_visibility jsonb NOT NULL DEFAULT '{"hideActivity":false,"hideStats":false,"hideLists":false,"hideFavorites":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS notify_comment_likes boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Public library entries readable" ON public.library_entries;
DROP POLICY IF EXISTS "Users read own library" ON public.library_entries;
CREATE POLICY "Users read own or allowed library" ON public.library_entries
  FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    OR (
      is_private = false
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = library_entries.user_id
          AND COALESCE((p.profile_visibility->>'hideLists')::boolean, false) = true
      )
    )
  );

DROP POLICY IF EXISTS "Activities are publicly readable" ON public.activities;
CREATE POLICY "Activities are readable unless hidden" ON public.activities
  FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = activities.user_id
        AND COALESCE((p.profile_visibility->>'hideActivity')::boolean, false) = true
    )
  );
