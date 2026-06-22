import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { SharedPoolEntry } from '../../../core/models/shared-pool.model';

function keyOf(item: WatchlistItem): string {
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
  return entries;
}

export function overlapOnly(pool: SharedPoolEntry[]): SharedPoolEntry[] {
  return pool.filter((e) => e.owner === 'both');
}
