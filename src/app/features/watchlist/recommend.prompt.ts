import { WatchlistItem } from '../../core/models/watchlist-item.model';
import { SharedPoolEntry } from '../../core/models/shared-pool.model';
import { OpenAiMessage } from '../../core/models/openai.models';

/**
 * Prompt building shared by the solo recommender (watchlist-ai-chat) and the
 * group picker (watchlist-shared). Keeping the item formatter and style rules
 * here stops the two prompts from drifting when fields/reactions change.
 */

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/** One watchlist item as a prompt line: title, meta, ★rating, 👍/👎, synopsis. */
export function fmtItem(i: WatchlistItem): string {
  const year = i.release_date?.slice(0, 4);
  const meta = [year, i.type, i.genres.join('/')].filter(Boolean).join(', ');
  const dir = i.director ? `, dir. ${i.director}` : '';
  const rating = i.vote_average ? ` ★${i.vote_average.toFixed(1)}` : '';
  const overview = i.overview ? `\n   ${clip(i.overview, 160)}` : '';
  const reaction = i.reaction === 'liked' ? ' 👍' : i.reaction === 'disliked' ? ' 👎' : '';
  return `- ${i.title} (${meta}${dir})${rating}${reaction}${progress(i)}${overview}`;
}

/** A show started but not finished says "interested" without any button pressed. */
function progress(i: WatchlistItem): string {
  if (i.watched) return '';
  const seasons = i.watched_seasons?.length ?? 0;
  if (seasons && i.season_count) return ` [started: ${seasons}/${i.season_count} seasons]`;
  if (i.watched_episodes && i.episode_count) return ` [started: ${i.watched_episodes}/${i.episode_count} eps]`;
  return '';
}

/**
 * How many titles of each kind go into a prompt. An imported list can run to
 * a thousand rows and the whole prompt is re-sent on every message, so the
 * dump is trimmed to the strongest signal instead of growing with the list.
 */
export const PROMPT_CAP = { watched: 60, candidates: 150 };

/** How often each genre appears in what the user has watched. */
function genreCounts(watched: WatchlistItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const g of watched.flatMap((i) => i.genres)) counts.set(g, (counts.get(g) ?? 0) + 1);
  return counts;
}

const top = (counts: Map<string, number>, n: number, min = 1): [string, number][] =>
  [...counts].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * What the watched list says about taste, counted over ALL of it — the lines
 * shown to the model are a trimmed sample, and most people never press 👍/👎,
 * so the plain fact of what they watched has to carry the profile on its own.
 */
export function tasteProfile(watched: WatchlistItem[], who = ''): string {
  if (!watched.length) return '';
  const genres = top(genreCounts(watched), 6).map(([g, c]) => `${g} ${c}`).join(', ');
  const directors = new Map<string, number>();
  for (const d of watched.map((i) => i.director).filter((d): d is string => !!d)) {
    directors.set(d, (directors.get(d) ?? 0) + 1);
  }
  const repeat = top(directors, 4, 2).map(([d, c]) => `${d} (${c})`).join(', ');
  const films = watched.filter((i) => i.type === 'movie').length;
  const liked = watched.filter((i) => i.reaction === 'liked').length;
  const disliked = watched.filter((i) => i.reaction === 'disliked').length;
  return [
    `PROFILE${who ? ` OF ${who.toUpperCase()}` : ''} (counted over all ${watched.length} watched titles, not just the sample below):`,
    genres && `- Genres watched most: ${genres}`,
    repeat && `- Directors watched more than once: ${repeat}`,
    `- Mix: ${films} films, ${watched.length - films} series/anime`,
    liked + disliked
      ? `- Reactions given: ${liked} 👍, ${disliked} 👎 — the rest have none, which is normal, not a dislike`
      : '- No 👍/👎 given: judge taste from what was watched',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The titles that tell the model the most, when there are too many to show.
 * Watched: 👍 first, 👎 next, then the most recently added (current taste).
 * Candidates (pass `watched`): 👍/👎 don't apply, so rank by how well their
 * genres match what was watched, ★ only as the tiebreak.
 * ponytail: genre affinity is the whole model; add directors/eras if the
 * shortlist starts to feel one-note.
 */
export function topForPrompt(
  items: WatchlistItem[],
  cap: number,
  watched?: WatchlistItem[],
): WatchlistItem[] {
  if (items.length <= cap) return items;
  const weight = (i: WatchlistItem) => (i.reaction === 'liked' ? 2 : i.reaction === 'disliked' ? 1 : 0);
  const counts = watched ? genreCounts(watched) : null;
  const affinity = (i: WatchlistItem) =>
    counts && i.genres.length
      ? i.genres.reduce((n, g) => n + (counts.get(g) ?? 0), 0) / i.genres.length
      : 0;
  return [...items]
    .sort(
      (a, b) =>
        weight(b) - weight(a) ||
        affinity(b) - affinity(a) ||
        (counts
          ? (b.vote_average ?? 0) - (a.vote_average ?? 0)
          : new Date(b.added_at).getTime() - new Date(a.added_at).getTime()),
    )
    .slice(0, cap);
}

/** A capped block of prompt lines, saying so when titles were left out. */
export function promptBlock(
  items: WatchlistItem[],
  cap: number,
  empty: string,
  /** The user's watched list, when `items` are candidates to be ranked against it. */
  watched?: WatchlistItem[],
): string {
  if (!items.length) return empty;
  const lines = topForPrompt(items, cap, watched).map(fmtItem);
  const hidden = items.length - lines.length;
  return hidden > 0 ? [...lines, `(…and ${hidden} more not shown)`].join('\n') : lines.join('\n');
}

/** "Title (Year)" — enough to tell the model what NOT to repeat, at a fraction of the size. */
const compact = (i: WatchlistItem): string => {
  const year = i.release_date?.slice(0, 4);
  return year ? `${i.title} (${year})` : i.title;
};

/** Shared "how to think" half of the solo prompts. */
const METHOD = `
HOW TO RECOMMEND:
1. First infer my taste from the WATCHED list and the PROFILE (counted over everything I've watched; the list itself may be a trimmed sample). That I watched something is a signal of interest in itself — recurring genres, directors, tones, pacing and eras matter most. A 👍 means I loved a title and a 👎 that I disliked it: weight them most when they are there, but many titles have no reaction and that is normal — never read a missing reaction as indifference or dislike. ★ is TMDB's general score, a hint at quality and not my taste. A show marked [started] is one I've begun. Treat all of that as my profile.
2. Work out what I'm actually asking for: a mood/vibe, a time constraint, something similar to a title, help deciding, or just browsing options.
3. Match against BOTH my request and my taste profile, using your real knowledge of each title's plot, tone and atmosphere. Genre tags are rough; the year, director, ★rating and short synopsis are only there to help you identify the exact title and gauge what I like.
4. Before you name ANY title, open with ONE short line (max 25 words): what I'm in the mood for, and the thread in my taste it should match. The pick has to follow from that line — don't decide first and justify after.
5. Then be adaptive and decisive about the shape of your answer:
   - If I'm asking what to watch / for help picking / for a specific mood: ONE confident top pick on its own line as "Watch this: **Title (Year)**" and a reason, then offer 2–3 shorter alternates.
   - If I'm clearly browsing or asking for options/a list: give a ranked shortlist of up to 4, best first.
6. Every reason must connect the pick to what I asked AND, whenever possible, to something specific I've watched (e.g. "you've watched Sicario").
7. If my request is vague, make a sensible assumption and recommend — don't interrogate me with clarifying questions.
8. Never repeat a title you already suggested earlier in this conversation.`.trim();

/** System prompt for "choose something from my own list". */
export function buildListPrompt(items: WatchlistItem[]): string {
  const watched = items.filter((i) => i.watched);
  const unwatched = items.filter((i) => !i.watched);
  return `
You are the recommendation assistant for the "What to Watch" app. I want to choose something from my own watchlist.
Only recommend from the UNWATCHED list unless I explicitly ask for ideas beyond it. If nothing in UNWATCHED genuinely fits, say so honestly, offer the closest option, and you may add one outside idea clearly flagged as not on my list.
Don't mention the words "WATCHED"/"UNWATCHED" — they are just labels for you.

${METHOD}

${RECOMMEND_STYLE}

${tasteProfile(watched)}

WATCHED — infer my taste from this:
${promptBlock(watched, PROMPT_CAP.watched, 'None yet')}

UNWATCHED — recommend from here:
${promptBlock(unwatched, PROMPT_CAP.candidates, 'Nothing here yet', watched)}

${LANGUAGE_RULE}
  `.trim();
}

/** System prompt for "find me something new" — the whole list is the exclusion set. */
export function buildAddPrompt(items: WatchlistItem[]): string {
  const watched = items.filter((i) => i.watched);
  return `
You are the discovery assistant for the "What to Watch" app. I want NEW titles to add — things I haven't seen and don't already have listed.
Only suggest real, well-known, findable titles; never invent one, and never suggest anything already in my list.

${METHOD}

${RECOMMEND_STYLE}

${tasteProfile(watched)}

WATCHED — infer my taste from this:
${promptBlock(watched, PROMPT_CAP.watched, 'None yet')}

ALREADY IN MY LIST — never suggest these:
${items.map(compact).join('; ') || 'Nothing added yet'}

${LANGUAGE_RULE}
  `.trim();
}

/** System + user turns for "More like this" on one title. */
export function buildSimilarMessages(
  it: WatchlistItem,
  owned: WatchlistItem[],
  /** IETF locale of the user (e.g. navigator.language). */
  lang: string,
): OpenAiMessage[] {
  return [
    {
      role: 'system',
      content:
        'You recommend movies and TV shows. Given one title the user likes, suggest exactly 4 ' +
        'similar titles they would enjoy, matching on plot, tone and themes — not just genre ' +
        'labels. Prefer well-known, findable titles.\n' +
        'Open with ONE line of at most 25 words naming the 2–3 specific qualities that make ' +
        'the source title work — its pace, tone, subject, the feeling it leaves. Pick from ' +
        'those qualities, not from the genre label; every suggestion must share at least one.\n' +
        'Then output a markdown bullet list and nothing after it. Each bullet must be ' +
        'exactly: "**Title (Year)** — reason." where the reason names which of those qualities ' +
        'it shares, in at most 15 words. Never repeat the source title or any title in the ' +
        'exclusion list.\n' +
        `Write the whole reply in the language of locale "${lang}" ` +
        '(e.g. it-* → Italian, en-* → English).',
    },
    {
      role: 'user',
      content:
        `Title I like: "${it.title}" (${it.type}` +
        `${it.release_date ? `, ${it.release_date.slice(0, 4)}` : ''}` +
        `${it.genres.length ? `, ${it.genres.join(', ')}` : ''}` +
        `${it.director ? `, directed by ${it.director}` : ''}).` +
        `${it.overview ? `\nFor reference, its plot: ${it.overview.slice(0, 240)}` : ''}\n` +
        `Do not suggest any of these (already in my list): ${owned.map(compact).join('; ') || 'none'}.`,
    },
  ];
}

/**
 * Language rule, kept apart from the rest of the style block so callers can put
 * it LAST in the system prompt: buried mid-prompt the small model loses it
 * behind the watchlist dump and just carries on in the thread's first language.
 */
export const LANGUAGE_RULE =
  'Write your WHOLE reply in the language of my LAST message, whatever language earlier turns or these instructions are in.';

/** Shared output rules — plain text, bold titles. See LANGUAGE_RULE for language. */
export const RECOMMEND_STYLE = `
STYLE:
- Keep it short and friendly, and match my tone — casual, slang, emoji or formal.
- Use ONLY plain text, "-" bullet points and **bold** (bold every title). No headings, tables, links, italics or code blocks — they will not render.
- Never tell me to add a title or take an action — phrase everything as a recommendation.`.trim();

/**
 * System prompt for the two-person "pick something we'll both enjoy" flow.
 * Infers each friend's taste from their watched list and picks ONE title from
 * the shared unwatched pool (never an outside title).
 */
export function buildGroupPickPrompt(
  myWatched: WatchlistItem[],
  theirWatched: WatchlistItem[],
  pool: SharedPoolEntry[],
  theirName: string,
  /** IETF locale of the user driving the pick (e.g. navigator.language). */
  lang: string,
): string {
  const candidate = (e: SharedPoolEntry): string => {
    const tag =
      e.owner === 'both' ? '★ both lists' : e.owner === 'me' ? 'your list' : `${theirName}'s list`;
    return `${fmtItem(e.item)}  [${tag}]`;
  };

  return `
You are picking ONE title for two friends to watch together tonight, from a shared pool of titles neither has seen.

HOW TO PICK:
1. Infer each friend's taste SEPARATELY from their WATCHED list and PROFILE (counted over everything they've watched; the list may be a sample) — recurring genres, tones, themes, pacing, eras, directors. Having watched something is a signal in itself. A 👍 means they loved it, 👎 means they disliked it: weight those most when present, but many titles have no reaction and that is normal — never read a missing one as dislike. ★ is TMDB's general score, not their taste.
2. Find the ONE candidate BOTH will enjoy — the overlap of the two tastes, not just one person's favourite. Prefer a title marked "★ both lists" when one genuinely fits; only reach past it if none does.
3. Use your real knowledge of each title's plot, tone and atmosphere. Genre tags are rough; year, director, ★ and synopsis are only there to identify the title and gauge taste.
4. Before you name ANY title, open with ONE short line (max 25 words) naming the taste both friends actually share. The pick has to follow from that line — don't decide first and justify after.
5. Then give ONE confident pick on its own line as "Watch this: **Title (Year)**" and a reason that connects to BOTH friends' tastes (name a specific title each has watched when you can). Then offer 1–2 shorter alternates.
6. Recommend ONLY from the CANDIDATES below. Never invent a title or suggest anything outside the pool.

${RECOMMEND_STYLE}

${tasteProfile(myWatched, 'me')}
MY TASTE — watched:
${promptBlock(myWatched, PROMPT_CAP.watched, 'None yet')}

${tasteProfile(theirWatched, theirName)}
${theirName.toUpperCase()} — watched:
${promptBlock(theirWatched, PROMPT_CAP.watched, 'None yet')}

CANDIDATES — pick from here:
${pool.map(candidate).join('\n') || 'Nothing here yet'}

Write your ENTIRE reply in the language of locale "${lang}" (e.g. it-* → Italian, en-* → English).
`.trim();
}
