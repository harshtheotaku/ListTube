const API_BASE = 'https://kypafzhjdwnhsiyltndw.supabase.co/functions/v1/listtube-api/v1';

const apiKeyInput = document.getElementById('apiKey');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('saveBtn');
const syncBtn = document.getElementById('syncBtn');

chrome.storage.local.get(['ltApiKey', 'lastDetected'], (res) => {
  if (res.ltApiKey) apiKeyInput.value = res.ltApiKey;
  if (res.lastDetected) {
    statusEl.textContent = `Last detected: ${res.lastDetected.title} (Ep ${res.lastDetected.episode})`;
  }
});

saveBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith('lt_')) {
    statusEl.textContent = 'Enter a valid lt_... key from ListTube Settings.';
    return;
  }
  await chrome.storage.local.set({ ltApiKey: key });
  statusEl.textContent = 'Verifying key...';
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Verification failed');
    const name = data.profile?.display_name || data.profile?.handle || 'User';
    statusEl.textContent = `Connected as ${name} (${data.trackedCount} tracked titles)`;
  } catch (err) {
    statusEl.textContent = err.message || 'Could not verify API key';
  }
});

syncBtn.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(['ltApiKey', 'lastDetected']);
  if (!stored.ltApiKey) {
    statusEl.textContent = 'Save your API key first.';
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const rawTitle = (tab?.title || '').replace(/\s*[-|].*$/, '').trim();
  const epMatch = (tab?.title || '').match(/\b(?:Ep(?:isode)?\.?\s*|E)(\d{1,4})\b/i);
  const episode = epMatch ? Number(epMatch[1]) : (stored.lastDetected?.episode || 1);
  if (!rawTitle) {
    statusEl.textContent = 'Open an episode tab to scrobble.';
    return;
  }
  statusEl.textContent = `Logging "${rawTitle}" Ep ${episode} via ListTube...`;
  const listRes = await fetch(`${API_BASE}/list?mediaType=ANIME`, {
    headers: { Authorization: `Bearer ${stored.ltApiKey}` },
  });
  const listJson = await listRes.json().catch(() => ({ items: [] }));
  const cleanNeedle = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = (listJson.items || []).find((x) => {
    const t = String(x.media_snapshot?.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return t && (t.includes(cleanNeedle) || cleanNeedle.includes(t));
  });
  if (!match) {
    statusEl.textContent = `Could not match "${rawTitle}" in your Watching list yet.`;
    return;
  }
  const progRes = await fetch(`${API_BASE}/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${stored.ltApiKey}`,
    },
    body: JSON.stringify({
      animeId: match.anime_id,
      progress: episode,
      status: 'watching',
    }),
  });
  statusEl.textContent = progRes.ok
    ? `Synced ${match.media_snapshot?.title || rawTitle} → Ep ${episode}!`
    : 'Progress update failed.';
});
