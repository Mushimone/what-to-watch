// The parts of the list import that read Letterboxd's HTML, kept apart from the
// request handler so they can be tested against a real saved page without a
// network or a Deno runtime. Everything here is pure.

/** A list page holds 100 films; this caps one import at 3,000. */
export const MAX_PAGES = 30;

/**
 * Only public Letterboxd lists and watchlists. Anything else — another host, a
 * private network, a path we don't understand — is refused before a request is
 * made, so this can't be turned into a general-purpose proxy.
 */
export function listUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== 'letterboxd.com' && url.hostname !== 'www.letterboxd.com') return null;

  // A list address carries whatever view the user was looking at when they
  // copied it — /detail/, /by/rating/, /page/3/. Those are the same list, so
  // the tail is read and discarded rather than rejected, and what comes back is
  // always the canonical first page. Letterboxd's robots.txt disallows the
  // sorted views anyway; normalising here means we never request one.
  const match = url.pathname.match(/^\/([\w-]+)\/(list\/[\w-]+|watchlist)(?:\/.*)?$/);
  if (!match) return null;

  return new URL(`https://letterboxd.com/${match[1]}/${match[2]}/`);
}

/**
 * A boxd.it short link — what Letterboxd's own Share button copies, so it is
 * the likeliest thing anyone pastes. It has to be resolved before it can be
 * checked, which needs a request; the handler does that and validates whatever
 * comes back through `listUrl` like any other address.
 */
export function isShortLink(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' && url.hostname.replace(/^www\./, '') === 'boxd.it';
  } catch {
    return false;
  }
}

/**
 * Titles on one page, in list order. Letterboxd puts "Title (Year)" on each
 * grid item as data-item-name, which is everything the matcher needs — no
 * second request per film.
 */
export function itemsOn(html: string): string[] {
  const names: string[] = [];
  for (const match of html.matchAll(/data-item-name="([^"]*)"/g)) {
    const name = decodeEntities(match[1]).trim();
    if (name) names.push(name);
  }
  return names;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Last: an escaped ampersand must not turn an adjacent entity into a live
    // one ("&amp;quot;" is the text &quot;, not a quote mark).
    .replace(/&amp;/g, '&');
}

/** Highest page number in the paginator, or 1 when the list fits on one page. */
export function lastPage(html: string): number {
  const pages = [...html.matchAll(/\/page\/(\d+)\//g)].map((m) => Number(m[1]));
  return pages.length ? Math.min(Math.max(...pages), MAX_PAGES) : 1;
}

export function listName(html: string): string {
  const match = html.match(/<meta property="og:title" content="([^"]*)"/);
  return match ? decodeEntities(match[1]).trim() : '';
}

/** The URL of page N of a list, page 1 being the list's own address. */
export function pageUrl(url: URL, page: number): URL {
  return page === 1 ? url : new URL(`${url.pathname}page/${page}/`, url);
}
