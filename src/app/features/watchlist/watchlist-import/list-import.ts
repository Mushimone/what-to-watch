import { SearchResult, WatchlistItem } from '../../../core/models/watchlist-item.model';
import { normalise } from '../../../shared/normalise';

/**
 * Everything about reading an exported list that doesn't need the network, kept
 * pure so it can be tested without one. The dialog owns the HTTP and the
 * progress; this file owns "what is in the file" and "is this the right title".
 */

/** One line of the export, before TMDB knows anything about it. */
export interface ImportEntry {
  name: string;
  /** Release year from the export — the strongest matching signal after an id. */
  year: number | null;
  /** IMDb `tt…` const, when the export carries one. Exact match, no guessing. */
  imdbId: string | null;
  /** Letterboxd rating in half-stars (2 = ½★ … 10 = 5★) — a member films page only. */
  rating?: number | null;
  /** The member's heart on the film — a member films page only. */
  liked?: boolean;
}

export type ImportSource = 'imdb' | 'letterboxd' | 'generic';

/**
 * RFC 4180 enough for the two exports we accept: quoted fields, doubled quotes
 * inside them, commas and newlines inside quotes. Returns rows keyed by the
 * header row, lowercased — IMDb has renamed its columns' casing before now.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  // Strip a UTF-8 BOM: Excel adds one and it would poison the first header.
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (src[i + 1] === '"') (field += '"'), i++;
      else quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Close the row on the first of a \r\n pair, skip the second.
      if (char === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((cell) => cell.trim()));
  if (!header) return [];
  const keys = header.map((key) => key.trim().toLowerCase());
  return body.map((cells) =>
    Object.fromEntries(keys.map((key, i) => [key, (cells[i] ?? '').trim()])),
  );
}

/**
 * Which export we're holding, from the columns alone. IMDb is the only one that
 * ships a `const`; Letterboxd names its title column `name`. Anything else with
 * a title-ish column is read generically — title and year is all we need.
 */
export function detectSource(rows: Record<string, string>[]): ImportSource | null {
  const keys = new Set(Object.keys(rows[0] ?? {}));
  if (keys.has('const')) return 'imdb';
  if (keys.has('name') && (keys.has('letterboxd uri') || keys.has('year'))) return 'letterboxd';
  if (keys.has('title') || keys.has('name')) return 'generic';
  return null;
}

const TCONST = /^tt\d{6,10}$/i;

/** Rows the resolver can work with. Rows without a usable title are dropped. */
export function toEntries(rows: Record<string, string>[]): ImportEntry[] {
  const entries = rows.map((row) => {
    const id = row['const'] ?? '';
    const year = Number.parseInt(row['year'] ?? '', 10);
    return {
      name: row['title'] || row['name'] || row['original title'] || '',
      year: Number.isFinite(year) && year > 1870 ? year : null,
      imdbId: TCONST.test(id) ? id.toLowerCase() : null,
    };
  });

  // A list can legitimately hold the same film twice (IMDb lets you re-add).
  // Keep the first: position order is the order the user arranged.
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.name) return false;
    const key = entry.imdbId ?? `${normalise(entry.name)}|${entry.year}`;
    return seen.has(key) ? false : !!seen.add(key);
  });
}

export type Reaction = 'liked' | 'disliked' | null;

/**
 * What a member's Letterboxd rating and heart say in this app's two-word
 * vocabulary. The heart wins over a low rating — hearting a film you rated
 * 2★ is the member saying they love it for the wrong reasons, and that is
 * still love. Four stars or more reads as liked; two or fewer as disliked;
 * anything in between (or no rating at all) says nothing, and stays unset
 * rather than guessing, since a missing reaction is not a dislike.
 * ponytail: fixed thresholds; make them a setting if people's scales differ.
 */
export function reactionFrom(rating: number | null | undefined, liked: boolean | undefined): Reaction {
  if (liked) return 'liked';
  if (rating == null) return null;
  if (rating >= 8) return 'liked';
  if (rating <= 4) return 'disliked';
  return null;
}

export type UrlKind = 'letterboxd' | 'imdb' | 'unknown';

/**
 * What a pasted link is, before anything is fetched. IMDb is recognised so the
 * sheet can explain itself rather than fail — its pages answer a server fetch
 * with a bot challenge, so those lists come in through the CSV export instead.
 */
export function classifyUrl(raw: string): UrlKind {
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return 'unknown';
  let host: string;
  try {
    host = new URL(text).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
  if (host === 'letterboxd.com' || host === 'boxd.it') return 'letterboxd';
  if (host === 'imdb.com' || host === 'm.imdb.com') return 'imdb';
  return 'unknown';
}

/**
 * "The Cabinet of Dr. Caligari (1920)" — the shape Letterboxd hangs on every
 * grid item — into the same entry a CSV row produces, so both ways in share one
 * matcher. A title ending in its own parenthesis ("Am I Being Selfish? (2018)")
 * is fine; only a trailing four-digit year is taken.
 */
export function entriesFromItemNames(items: string[]): ImportEntry[] {
  return toEntries(
    items.map((item) => {
      const match = item.trim().match(/^(.*\S)\s+\((\d{4})\)$/);
      return match ? { name: match[1], year: match[2] } : { name: item.trim(), year: '' };
    }),
  );
}

/**
 * A member's films, with what they gave each — the same "Title (Year)" strings
 * as a list, plus the rating and heart that came back alongside by index.
 * A film listed twice keeps its first appearance, as in `toEntries`.
 */
export function entriesFromFilms(
  items: string[],
  viewing: { rating: number | null; liked: boolean }[] = [],
): ImportEntry[] {
  const seen = new Set<string>();
  const entries: ImportEntry[] = [];
  items.forEach((item, i) => {
    const match = item.trim().match(/^(.*\S)\s+\((\d{4})\)$/);
    const name = match ? match[1] : item.trim();
    const year = match ? Number.parseInt(match[2], 10) : null;
    if (!name) return;
    const dedupe = `${normalise(name)}|${year}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    entries.push({
      name,
      year: year !== null && year > 1870 ? year : null,
      imdbId: null,
      rating: viewing[i]?.rating ?? null,
      liked: viewing[i]?.liked ?? false,
    });
  });
  return entries;
}

export { normalise };

export type MatchStatus = 'matched' | 'ambiguous' | 'not-found';

export interface Match {
  status: MatchStatus;
  result: SearchResult | null;
  /** Populated on `ambiguous` only — what the user picks between. */
  candidates: SearchResult[];
}

/**
 * Picks the title an entry meant out of a TMDB response.
 *
 * The question the sheet asks the user has to be one they can actually answer.
 * Two films sharing a title AND a year are indistinguishable in a list of rows
 * — asking there just moves the guess. So the year decides between same-titled
 * films, and within one year TMDB's own popularity order decides; the user
 * still sees every pick, checked, with its poster and year, and can uncheck it.
 *
 * What does get handed back is a real question: candidates whose years don't
 * fit the export at all, or a title TMDB doesn't carry under that name.
 */
export function pickMatch(entry: ImportEntry, candidates: SearchResult[]): Match {
  if (!candidates.length) return { status: 'not-found', result: null, candidates: [] };

  const wanted = normalise(entry.name);
  const exact = candidates.filter((c) => normalise(c.title) === wanted);
  if (exact.length === 1) return { status: 'matched', result: exact[0], candidates: [] };

  if (entry.year) {
    const sameYear = exact.filter((c) => yearOf(c) === entry.year);
    if (sameYear.length) return { status: 'matched', result: sameYear[0], candidates: [] };

    // Festival premiere in one year, release in the next: the two databases
    // routinely disagree by one on the same film (Demolition, Into the Forest).
    // Wider than that is a different film.
    const near = exact.filter((c) => withinAYear(c, entry.year!));
    if (near.length) return { status: 'matched', result: near[0], candidates: [] };

    // They also disagree on articles and franchise prefixes for the same film:
    // "School of Rock" is TMDB's "The School of Rock", "The Meaning of Life" is
    // "Monty Python's The Meaning of Life".
    //
    // Containment is the loosest rule here and it earns the tightest guard: the
    // year has to agree as well, and the title has to be several words long. A
    // one-word title lands inside unrelated films constantly — "Escape" (2012)
    // matched "Escape Fire" before this line existed, silently and wrongly.
    if (wanted.split(' ').length >= 3) {
      const near = candidates.filter((c) => withinAYear(c, entry.year!) && contains(c.title, wanted));
      if (near.length) return { status: 'matched', result: near[0], candidates: [] };
    }
  }

  if (exact.length > 1) return { status: 'ambiguous', result: null, candidates: exact.slice(0, 3) };
  if (candidates.length === 1) return { status: 'matched', result: candidates[0], candidates: [] };
  return { status: 'ambiguous', result: null, candidates: candidates.slice(0, 3) };
}

function withinAYear(result: SearchResult, year: number): boolean {
  const found = yearOf(result);
  return found !== null && Math.abs(found - year) <= 1;
}

/** `wanted` appearing in `title` on word boundaries, both already normalised. */
function contains(title: string, wanted: string): boolean {
  return ` ${normalise(title)} `.includes(` ${wanted} `);
}


/**
 * A row's fate in the sheet. `failed` is the only retryable one — the others
 * are answers, not errors, and each gets its own way out. `update` is a films-page
 * row that is already on the list but unwatched (or has no reaction to carry over):
 * it is brought up to date rather than skipped.
 */
export type RowStatus = 'matched' | 'update' | 'duplicate' | 'ambiguous' | 'not-found' | 'failed';

export interface ImportRow {
  entry: ImportEntry;
  status: RowStatus;
  result: SearchResult | null;
  /** Populated on `ambiguous` — the user picks one and the row resolves. */
  candidates: SearchResult[];
  /** Only meaningful while `matched`; duplicates and failures are never sent. */
  selected: boolean;
}

export function key(item: { external_source: string; external_id: string | number }): string {
  return `${item.external_source}:${item.external_id}`;
}

/**
 * Folds "you already have this" into the match — the one place the import
 * checks against the existing watchlist. A duplicate is shown, not hidden, and
 * never pre-selected: the point of the sheet is that you can see what a file
 * would do before it does it.
 */
export function toRow(
  entry: ImportEntry,
  match: Match,
  saved: Set<string>,
  /**
   * Films-page imports only: the rows already on the list. A title there is not a
   * duplicate if the import has something to add — it was never marked watched,
   * or it has no reaction and the member gave one.
   */
  existing?: Map<string, Pick<WatchlistItem, 'watched' | 'reaction'>>,
): ImportRow {
  const found = !!match.result && saved.has(key(match.result));
  const current = found && existing ? existing.get(key(match.result!)) : undefined;
  const upgrade =
    !!current &&
    (!current.watched || (!current.reaction && !!reactionFrom(entry.rating, entry.liked)));
  const duplicate = found && !upgrade;
  return {
    entry,
    status: upgrade ? 'update' : duplicate ? 'duplicate' : match.status,
    result: match.result,
    candidates: match.candidates,
    selected: upgrade || (!duplicate && match.status === 'matched'),
  };
}

export function yearOf(result: SearchResult): number | null {
  const year = Number.parseInt(result.release_date?.slice(0, 4) ?? '', 10);
  return Number.isFinite(year) ? year : null;
}

/**
 * Runs `worker` over the entries a few at a time. TMDB tolerates far more, but
 * a wide-open Promise.all on a 500-row list is a burst worth not sending, and a
 * steady pool is what makes the progress counter move smoothly.
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onDone: (completed: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let completed = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
        onDone(++completed);
      }
    }),
  );
  return results;
}
