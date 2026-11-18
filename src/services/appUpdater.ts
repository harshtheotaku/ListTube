export const APP_VERSION = '1.2.0';
export const GITHUB_RELEASES_API =
  'https://api.github.com/repos/harshtheotaku/ListTube/releases/latest';
export const GITHUB_LATEST_APK_URL =
  'https://github.com/harshtheotaku/ListTube/releases/latest/download/ListTube-android.apk';

const LAST_CHECK_KEY = 'listtube.updater.lastAt.v1';
const DISMISSED_TAG_KEY = 'listtube.updater.dismissedTag.v1';

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  apkUrl: string;
  releaseUrl: string;
  publishedAt?: string;
}

function parseVersionParts(raw: string): { nums: number[]; isPre: boolean } {
  const cleaned = raw.trim().replace(/^v/i, '');
  const [core, pre] = cleaned.split('-', 2);
  const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
  while (nums.length < 3) nums.push(0);
  return { nums, isPre: Boolean(pre && pre.length > 0) };
}

/**
 * Returns > 0 when candidate is newer than baseline, 0 if equal, < 0 if older.
 */
export function compareSemver(candidate: string, baseline: string): number {
  const a = parseVersionParts(candidate);
  const b = parseVersionParts(baseline);
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i += 1) {
    const diff = (a.nums[i] ?? 0) - (b.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (a.isPre !== b.isPre) return a.isPre ? -1 : 1;
  return 0;
}

export async function checkForGitHubUpdate(force = false): Promise<AppUpdateInfo | null> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return null;
  }

  try {
    if (!force) {
      const lastAt = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
      if (Date.now() - lastAt < 12 * 3_600_000) return null;
    }
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    /* ignore storage limits */
  }

  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      published_at?: string;
      assets?: { name?: string; browser_download_url?: string }[];
    };
    const tag = (data.tag_name ?? '').trim();
    if (!tag) return null;

    const apkAsset = (data.assets ?? []).find(
      (a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk')
    );

    const updateAvailable = compareSemver(tag, APP_VERSION) > 0;
    return {
      currentVersion: APP_VERSION,
      latestVersion: tag.replace(/^v/i, ''),
      updateAvailable,
      apkUrl: apkAsset?.browser_download_url || GITHUB_LATEST_APK_URL,
      releaseUrl: data.html_url || 'https://github.com/harshtheotaku/ListTube/releases/latest',
      publishedAt: data.published_at,
    };
  } catch {
    return null;
  }
}

export function isUpdateBannerDismissed(version: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DISMISSED_TAG_KEY) === version;
}

export function dismissUpdateBanner(version: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DISMISSED_TAG_KEY, version);
  } catch {
    /* ignore */
  }
}
