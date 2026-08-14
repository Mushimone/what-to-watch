import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WatchlistItem } from '../models/watchlist-item.model';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class WatchlistService {
  constructor(private supabase: SupabaseService) {}

  private watchlistItemsSubject = new BehaviorSubject<WatchlistItem[]>([]);
  watchlistItems$ = this.watchlistItemsSubject.asObservable();

  /** User the cached list belongs to — null until the first successful load. */
  private loadedFor: string | null = null;

  /**
   * Cached after the first load: every mutation below keeps the subject in sync,
   * so re-entering a view doesn't need another round-trip. Pass `force` to refetch.
   */
  public async getWatchlist(force = false) {
    const userId = this.supabase.getCurrentUser()?.id;
    if (!force && userId && this.loadedFor === userId) return this.watchlistItemsSubject.value;
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('watchlist_items')
      .select('*')
      .eq('user_id', userId)
      .order('added_at', { ascending: false });
    if (error) {
      console.error('Error fetching watchlist:', error);
      return [];
    }
    this.loadedFor = userId ?? null;
    this.watchlistItemsSubject.next(data);
    return data;
  }

  public async addToWatchlist(item: Omit<WatchlistItem, 'id' | 'user_id' | 'added_at'>) {
    const { data, error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .insert({
        ...item,
        user_id: this.supabase.getCurrentUser()?.id,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return 'duplicate' as const;
      }
      console.error('Error adding to watchlist:', error);
      return null;
    }
    this.watchlistItemsSubject.next(
      data ? [...this.watchlistItemsSubject.value, data] : this.watchlistItemsSubject.value,
    );
    return data;
  }

  /**
   * Adds a batch in one round-trip — an imported list is dozens of titles, and
   * one insert per title would be dozens of requests for a single user action.
   *
   * Upsert rather than insert so a title already saved is skipped instead of
   * failing the whole batch: the caller filters known duplicates out first, but
   * its cache can be stale (another device, another tab), and losing 90 titles
   * to one collision is not a trade worth making. Returns the rows actually
   * written, so the caller can report what landed.
   */
  public async addMany(items: Omit<WatchlistItem, 'id' | 'user_id' | 'added_at'>[]) {
    if (!items.length) return [];
    const userId = this.supabase.getCurrentUser()?.id;
    const { data, error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .upsert(
        items.map((item) => ({ ...item, user_id: userId })),
        { onConflict: 'user_id,external_id,external_source', ignoreDuplicates: true },
      )
      .select();
    if (error) {
      console.error('Error adding titles to watchlist:', error);
      return null;
    }
    const added = data ?? [];
    if (added.length) this.watchlistItemsSubject.next([...this.watchlistItemsSubject.value, ...added]);
    return added;
  }

  public async removeFromWatchlist(id: string) {
    const { error } = await this.supabase.getClient().from('watchlist_items').delete().eq('id', id);
    if (error) {
      console.error('Error removing from watchlist:', error);
      return false;
    }
    this.watchlistItemsSubject.next(
      this.watchlistItemsSubject.value.filter((item) => item.id !== id),
    );
    return true;
  }

  /**
   * Backfills enrichment fields (runtime/director/overview) for items added
   * before they were fetched, so they display fully and become duration-sortable.
   */
  public async updateDetails(
    id: string,
    details: Partial<
      Pick<WatchlistItem, 'duration_minutes' | 'director' | 'overview' | 'season_count' | 'episode_count'>
    >,
  ) {
    const { error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .update(details)
      .eq('id', id);
    if (error) {
      console.error('Error updating item details:', error);
      return false;
    }
    const updatedItems = this.watchlistItemsSubject.value.map((item) =>
      item.id === id ? { ...item, ...details } : item,
    );
    this.watchlistItemsSubject.next(updatedItems);
    return true;
  }

  public async setReaction(id: string, reaction: 'liked' | 'disliked' | null) {
    const { error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .update({ reaction })
      .eq('id', id);
    if (error) {
      console.error('Error updating reaction:', error);
      return false;
    }
    const updatedItems = this.watchlistItemsSubject.value.map((item) =>
      item.id === id ? { ...item, reaction } : item,
    );
    this.watchlistItemsSubject.next(updatedItems);
    return true;
  }

  /** Clears the "new season" flag once the user has seen the item. */
  public async clearUpdateFlag(id: string) {
    const { error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .update({ has_update: false })
      .eq('id', id);
    if (error) {
      console.error('Error clearing update flag:', error);
      return false;
    }
    const updatedItems = this.watchlistItemsSubject.value.map((item) =>
      item.id === id ? { ...item, has_update: false } : item,
    );
    this.watchlistItemsSubject.next(updatedItems);
    return true;
  }

  public async toggleWatchedStatus(id: string, watched: boolean) {
    // For series/anime, the whole-series toggle also fills or clears every season
    // so the two stay consistent (all seasons watched ⇔ watched=true).
    const current = this.watchlistItemsSubject.value.find((item) => item.id === id);
    const patch: Partial<WatchlistItem> = { watched };
    // Keep whichever progress track the show uses in sync with the whole-series flag.
    if ((current?.season_count ?? 0) >= 2) {
      patch.watched_seasons = watched
        ? Array.from({ length: current!.season_count! }, (_, i) => i + 1)
        : [];
      // No season is part-way through once every one is ticked or cleared.
      patch.watched_episodes = 0;
    } else if ((current?.episode_count ?? 0) > 1) {
      patch.watched_episodes = watched ? current!.episode_count! : 0;
    }
    const { error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .update(patch)
      .eq('id', id);
    if (error) {
      console.error('Error updating watched status:', error);
      return false;
    }
    const updatedItems = this.watchlistItemsSubject.value.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    this.watchlistItemsSubject.next(updatedItems);
    return true;
  }

  /**
   * Marks a specific set of seasons watched. `watched` is derived: a series is
   * fully watched only once every season is ticked — otherwise it stays in the
   * Not Watched list.
   */
  public async setWatchedSeasons(id: string, watchedSeasons: number[]) {
    const current = this.watchlistItemsSubject.value.find((item) => item.id === id);
    const watched =
      current?.season_count != null && watchedSeasons.length >= current.season_count;
    const patch: Partial<WatchlistItem> = { watched_seasons: watchedSeasons, watched };
    const { error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .update(patch)
      .eq('id', id);
    if (error) {
      console.error('Error updating watched seasons:', error);
      return false;
    }
    const updatedItems = this.watchlistItemsSubject.value.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    this.watchlistItemsSubject.next(updatedItems);
    return true;
  }

  /**
   * Sets how many episodes are watched. On a flat show that is the whole run, and
   * `watched` is derived from it — fully watched only once every episode is
   * reached. On a multi-season show the count is episodes into the season in
   * progress, so `watched` belongs to the season chips and is left untouched here.
   */
  public async setWatchedEpisodes(id: string, watchedEpisodes: number) {
    const current = this.watchlistItemsSubject.value.find((item) => item.id === id);
    const perSeason = (current?.season_count ?? 0) >= 2;
    const total = perSeason ? null : (current?.episode_count ?? null);
    const clamped = total != null ? Math.max(0, Math.min(watchedEpisodes, total)) : Math.max(0, watchedEpisodes);
    const patch: Partial<WatchlistItem> = { watched_episodes: clamped };
    if (!perSeason) patch.watched = total != null && clamped >= total;
    const { error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .update(patch)
      .eq('id', id);
    if (error) {
      console.error('Error updating watched episodes:', error);
      return false;
    }
    const updatedItems = this.watchlistItemsSubject.value.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    this.watchlistItemsSubject.next(updatedItems);
    return true;
  }
}
