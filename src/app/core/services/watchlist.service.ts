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

  public async getWatchlist() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('watchlist_items')
      .select('*')
      .eq('user_id', this.supabase.getCurrentUser()?.id)
      .order('added_at', { ascending: false });
    if (error) {
      console.error('Error fetching watchlist:', error);
      return [];
    }
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

  public async toggleWatchedStatus(id: string, watched: boolean) {
    const { error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .update({ watched })
      .eq('id', id);
    if (error) {
      console.error('Error updating watched status:', error);
      return false;
    }
    const updatedItems = this.watchlistItemsSubject.value.map((item) =>
      item.id === id ? { ...item, watched } : item,
    );
    this.watchlistItemsSubject.next(updatedItems);
    return true;
  }
}
