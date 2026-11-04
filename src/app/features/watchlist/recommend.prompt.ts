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
  return `- ${i.title} (${meta}${dir})${rating}${reaction}${overview}`;
}

/**
 * How many titles of each kind go into a prompt. An imported list can run to
 * a thousand rows and the whole prompt is re-sent on every message, so the
 * dump is trimmed to the strongest signal instead of growing with the list.
 */
export const PROMPT_CAP = { watched: 60, candidates: 150 };

/**
 * The titles that tell the model the most: 👍 first, then 👎, then by ★.
 * ponytail: rating-only ordering for the unwatched pool favours well-known
 * titles; shuffle or weight by genre if that starts to show in the picks.
 */
export function topForPrompt(items: WatchlistItem[], cap: number): WatchlistItem[] {
  if (items.length <= cap) return items;
  const weight = (i: WatchlistItem) => (i.reaction === 'liked' ? 2 : i.reaction === 'disliked' ? 1 : 0);
  return [...items]
    .sort((a, b) => weight(b) - weight(a) || (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, cap);
}

/** A capped block of prompt lines, saying so when titles were left out. */
export function promptBlock(items: WatchlistItem[], cap: number, empty: string): string {
  if (!items.length) return empty;
  const lines = topForPrompt(items, cap).map(fmtItem);
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
1. First infer my taste from the WATCHED list — recurring tones, themes, pacing, eras, directors, and what I rated highly (★). A 👍 means I loved that title and 👎 means I disliked it; weight my 👍/👎 more heavily than ★, and steer away from what a 👎 represents. Treat that as my profile.
2. Work out what I'm actually asking for: a mood/vibe, a time constraint, something similar to a title, help deciding, or just browsing options.
3. Match against BOTH my request and my taste profile, using your real knowledge of each title's plot, tone and atmosphere. Genre tags are rough; the year, director, ★rating and short synopsis are only there to help you identify the exact title and gauge what I like.
4. Before you name ANY title, open with ONE short line (max 25 words): what I'm in the mood for, and the thread in my taste it should match. The pick has to follow from that line — don't decide first and justify after.
5. Then be adaptive and decisive about the shape of your answer:
   - If I'm asking what to watch / for help picking / for a specific mood: ONE confident top pick on its own line as "**Watch this: Title (Year)**" and a reason, then offer 2–3 shorter alternates.
   - If I'm clearly browsing or asking for options/a list: give a ranked shortlist of up to 4, best first.
6. Every reason must connect the pick to what I asked AND, whenever possible, to something specific I've watched (e.g. "you rated Sicario highly").
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

WATCHED — infer my taste from this:
${promptBlock(watched, PROMPT_CAP.watched, 'None yet')}

UNWATCHED — recommend from here:
${promptBlock(unwatched, PROMPT_CAP.candidates, 'Nothing here yet')}

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
1. Infer each friend's taste SEPARATELY from their WATCHED list — recurring tones, themes, pacing, eras, directors, and what they rated highly (★). A 👍 means they loved it, 👎 means they disliked it; weight 👍/👎 more heavily than ★ and steer away from what a 👎 represents.
2. Find the ONE candidate BOTH will enjoy — the overlap of the two tastes, not just one person's favourite. Prefer a title marked "★ both lists" when one genuinely fits; only reach past it if none does.
3. Use your real knowledge of each title's plot, tone and atmosphere. Genre tags are rough; year, director, ★ and synopsis are only there to identify the title and gauge taste.
4. Before you name ANY title, open with ONE short line (max 25 words) naming the taste both friends actually share. The pick has to follow from that line — don't decide first and justify after.
5. Then give ONE confident pick on its own line as "**Watch this: Title (Year)**" and a reason that connects to BOTH friends' tastes (name a specific title each has watched when you can). Then offer 1–2 shorter alternates.
6. Recommend ONLY from the CANDIDATES below. Never invent a title or suggest anything outside the pool.

${RECOMMEND_STYLE}

MY TASTE — watched:
${promptBlock(myWatched, PROMPT_CAP.watched, 'None yet')}

${theirName.toUpperCase()} — watched:
${promptBlock(theirWatched, PROMPT_CAP.watched, 'None yet')}

CANDIDATES — pick from here:
${pool.map(candidate).join('\n') || 'Nothing here yet'}

Write your ENTIRE reply in the language of locale "${lang}" (e.g. it-* → Italian, en-* → English).
`.trim();
}
