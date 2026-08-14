// Reads a public Letterboxd list and hands back the titles on it.
//
// The browser can't do this itself: letterboxd.com sends no CORS headers, so a
// fetch from the page is blocked before it starts. That is the only reason this
// function exists — it does no matching and touches no database. It returns the
// raw "Title (Year)" strings off the list page and the client resolves them
// against TMDB, which is what keeps the import's progress bar honest.
//
// IMDb is deliberately not supported here. Every imdb.com page answers a
// server-side fetch with an AWS WAF challenge instead of HTML, and their
// robots.txt prohibits automated collection outright. Getting round either
// would mean defeating a countermeasure the site put up on purpose. IMDb lists
// come in through the CSV export instead, which is exact and sanctioned.
//
// The HTML reading lives in ./parse.ts so it can be tested against a saved page.
//
// Deploy with:  supabase functions deploy import-list

import { MAX_PAGES, isShortLink, itemsOn, lastPage, listName, listUrl, pageUrl } from './parse.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Pages fetched at once. Letterboxd is someone else's server — stay polite. */
const PAGE_CONCURRENCY = 3;

const UA = 'WhatToWatch/1.0 (list import for a signed-in user; +https://what-to-watch.vercel.app)';

async function fetchPage(url: URL, page: number): Promise<string | null> {
  const res = await fetch(pageUrl(url, page), {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) return null;
  return await res.text();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid-body' }, 400);
  }

  // A boxd.it link is read, not followed: taking the Location header means the
  // only host this function ever fetches is one it has already approved.
  let target = (body.url ?? '').trim();
  if (isShortLink(target)) {
    const hop = await fetch(target, { headers: { 'User-Agent': UA }, redirect: 'manual' });
    target = hop.headers.get('location') ?? '';
  }

  const url = listUrl(target);
  if (!url) return json({ error: 'unsupported-url' }, 400);

  const first = await fetchPage(url, 1);
  // Letterboxd answers 404 for a list that is private, renamed or gone. From
  // out here those are the same thing, and the client says so in those words.
  if (first === null) return json({ error: 'not-public' }, 404);

  const total = lastPage(first);
  const items = itemsOn(first);

  // Pages 2..N in small batches, in order, so the list arrives as the owner
  // arranged it. A page that fails is skipped rather than failing the import —
  // the client reports the count it got and the user can see if it's short.
  for (let page = 2; page <= total; page += PAGE_CONCURRENCY) {
    const batch = [];
    for (let i = page; i < page + PAGE_CONCURRENCY && i <= total; i++) {
      batch.push(fetchPage(url, i));
    }
    for (const html of await Promise.all(batch)) {
      if (html) items.push(...itemsOn(html));
    }
  }

  return json({ name: listName(first), items, pages: total, truncated: total >= MAX_PAGES });
});
