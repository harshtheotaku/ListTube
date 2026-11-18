// Lightweight video-completion & title watcher for ListTube Auto-Tracker Companion
(() => {
  const detectFromPage = () => {
    const title = document.title.replace(/\s*[-–|].*$/, '').trim();
    const epMatch = document.title.match(/\b(?:Ep(?:isode)?\.?\s*|E)(\d{1,4})\b/i);
    if (!title) return;
    chrome.storage?.local?.set({
      lastDetected: {
        title,
        episode: epMatch ? Number(epMatch[1]) : 1,
        url: location.href,
        detectedAt: Date.now(),
      },
    });
  };
  detectFromPage();
  setInterval(detectFromPage, 15000);
})();
