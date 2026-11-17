const EDGE_SHARE_URL = 'https://kypafzhjdwnhsiyltndw.supabase.co/functions/v1/listtube-api/share';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const bot = url.searchParams.get('bot') || '1';
  const res = await fetch(
    `${EDGE_SHARE_URL}?id=${encodeURIComponent(id)}&origin=${encodeURIComponent('https://listtube.vercel.app')}&bot=${encodeURIComponent(bot)}`
  );
  const html = await res.text();
  return new Response(html, {
    status: res.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
