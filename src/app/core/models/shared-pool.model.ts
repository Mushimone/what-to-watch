import { WatchlistItem } from './watchlist-item.model';

export type PoolOwner = 'me' | 'them' | 'both';

export interface SharedPoolEntry {
  item: WatchlistItem;
  owner: PoolOwner;
}
