import React, { useEffect, useState } from 'react';
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import { LibraryState, NewsItem } from '../types';
import { fetchOfficialNewsFeed } from '../services/news';

interface NewsViewProps {
  libraryState: LibraryState;
}

export const NewsView: React.FC<NewsViewProps> = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const items = await fetchOfficialNewsFeed();
      setNews(items);
    } catch {
      setNews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6 bg-[#0F0F0F] px-4 pb-24 pt-5 text-white sm:px-6 lg:px-8 lg:pb-16 min-h-screen">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-black tracking-tight text-white">
            <Newspaper className="h-5 w-5 text-[#FF0000]" />
            Anime &amp; Manga News
          </h1>
          <p className="mt-0.5 text-[12px] text-[#AAAAAA]">
            Official announcements &amp; updates curated from MyAnimeList &amp; trending series
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          className="rounded-full border border-white/[0.12] bg-[#272727] p-2 text-white hover:bg-[#383838]"
          aria-label="Refresh news"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Quick Official Industry Feeds */}
      <div className="flex flex-wrap gap-2">
        {[
          { name: 'Anime News Network', url: 'https://www.animenewsnetwork.com/' },
          { name: 'Crunchyroll News', url: 'https://www.crunchyroll.com/news' },
          { name: 'MyAnimeList News', url: 'https://myanimelist.net/news' },
          { name: 'Natalie Comic', url: 'https://natalie.mu/comic' },
        ].map((outlet) => (
          <a
            key={outlet.name}
            href={outlet.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#272727] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:border-[#FF0000] hover:bg-[#383838]"
          >
            <span>{outlet.name}</span>
            <ExternalLink className="h-3 w-3 text-[#FF0000]" />
          </a>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl bg-[#1A1A1A]" />
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-10 text-center text-[#AAAAAA]">
          <p className="text-[13px] font-semibold">No recent articles fetched. Try refreshing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex gap-4 rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-4 transition hover:border-white/[0.18] hover:bg-[#222222]"
            >
              <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-[#121216] sm:w-44">
                {item.image ? (
                  <>
                    <img
                      src={item.image}
                      alt=""
                      className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-md"
                    />
                    <img
                      src={item.image}
                      alt={item.title}
                      loading="lazy"
                      className="relative z-[1] mx-auto h-full w-auto max-w-full object-contain"
                    />
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FF0000]/20 to-[#1F1F1F]">
                    <Newspaper className="h-8 w-8 text-[#FF0000]/70" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-[#AAAAAA]">
                  <span className="text-[#FF0000]">{item.sourceName}</span>
                  <span>•</span>
                  <span>
                    {Number.isNaN(new Date(item.date).getTime())
                      ? item.date
                      : new Date(item.date).toLocaleDateString()}
                  </span>
                  {item.author && (
                    <>
                      <span>•</span>
                      <span>by {item.author}</span>
                    </>
                  )}
                </div>
                <h2 className="mt-1 line-clamp-2 text-[15px] font-bold text-white group-hover:text-rose-300">
                  {item.title}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-[12px] text-[#AAAAAA]">
                  {item.excerpt}
                </p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-[#AAAAAA] group-hover:text-white" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
