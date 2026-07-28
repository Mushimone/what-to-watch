import { WatchlistItem } from '../../core/models/watchlist-item.model';
import { SharedPoolEntry } from '../../core/models/shared-pool.model';

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
  return `- ${i.title} (${meta}${dir})${rating}${reaction}${overview}`;
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
1. Infer each friend's taste SEPARATELY from their WATCHED list — recurring tones, themes, pacing, eras, directors, and what they rated highly (★). A 👍 means they loved it, 👎 means they disliked it; weight 👍/👎 more heavily than ★ and steer away from what a 👎 represents.
2. Find the ONE candidate BOTH will enjoy — the overlap of the two tastes, not just one person's favourite. Prefer a title marked "★ both lists" when one genuinely fits; only reach past it if none does.
3. Use your real knowledge of each title's plot, tone and atmosphere. Genre tags are rough; year, director, ★ and synopsis are only there to identify the title and gauge taste.
4. Before you name ANY title, open with ONE short line (max 25 words) naming the taste both friends actually share. The pick has to follow from that line — don't decide first and justify after.
5. Then give ONE confident pick on its own line as "**Watch this: Title (Year)**" and a reason that connects to BOTH friends' tastes (name a specific title each has watched when you can). Then offer 1–2 shorter alternates.
6. Recommend ONLY from the CANDIDATES below. Never invent a title or suggest anything outside the pool.

${RECOMMEND_STYLE}

MY TASTE — watched:
${myWatched.map(fmtItem).join('\n') || 'None yet'}

${theirName.toUpperCase()} — watched:
${theirWatched.map(fmtItem).join('\n') || 'None yet'}

CANDIDATES — pick from here:
${pool.map(candidate).join('\n') || 'Nothing here yet'}

Write your ENTIRE reply in the language of locale "${lang}" (e.g. it-* → Italian, en-* → English).
`.trim();
}
