import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { SharedPoolEntry } from '../../../core/models/shared-pool.model';
import { Profile } from '../../../core/models/profile.model';

/** One row of the friend list: the profile plus the real overlap it carries. */
export interface RosterEntry {
  friend: Profile;
  /** Unwatched titles on their list */
  total: number;
  /** Unwatched titles you both want */
  both: number;
  /** Up to 3 posters from the overlap — the card's proof, not decoration */
  peek: string[];
}

export function keyOf(item: WatchlistItem): string {
  return `${item.external_source}:${item.external_id}`;
}

/**
 * Merge two unwatched lists into one deduped pool. Titles present in both are
 * tagged 'both' (the highlighted overlap); the current user's row instance wins
 * when a title is in both, so the entry carries the user's own WatchlistItem.
 */
export function mergeWatchlists(
  mine: WatchlistItem[],
  theirs: WatchlistItem[],
): SharedPoolEntry[] {
  const theirsKeys = new Set(theirs.map(keyOf));
  const entries: SharedPoolEntry[] = [];
  const seen = new Set<string>();

  for (const item of mine) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ item, owner: theirsKeys.has(key) ? 'both' : 'me' });
  }
  for (const item of theirs) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ item, owner: 'them' });
  }
  const rank: Record<SharedPoolEntry['owner'], number> = { both: 0, me: 1, them: 2 };
  return entries.sort((a, b) => rank[a.owner] - rank[b.owner]);
}

/**
 * Friend-list rows: for each friend, how much of their unwatched list you already
 * share. `theirsAll` is every friend's rows in one batch — split by user_id here.
 * Sorted by overlap, so the friend you agree with most is the first choice.
 */
export function buildRoster(
  friends: Profile[],
  mine: WatchlistItem[],
  theirsAll: WatchlistItem[],
): RosterEntry[] {
  const mineKeys = new Set(mine.filter((i) => !i.watched).map(keyOf));
  return friends
    .map((friend) => {
      const theirs = theirsAll.filter((i) => i.user_id === friend.id && !i.watched);
      const shared = theirs.filter((i) => mineKeys.has(keyOf(i)));
      return {
        friend,
        total: theirs.length,
        both: shared.length,
        peek: shared.map((i) => i.poster_url).filter((u): u is string => !!u).slice(0, 3),
      };
    })
    .sort((a, b) => b.both - a.both);
}

export function overlapOnly(pool: SharedPoolEntry[]): SharedPoolEntry[] {
  return pool.filter((e) => e.owner === 'both');
}
