import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WatchlistItem } from '../models/watchlist-item.model';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class WatchlistService {
  constructor(private supabase: SupabaseService) {}

  mockData: WatchlistItem[] = [
    {
      id: '1',
      user_id: 'user123',
      title: 'Inception',
      type: 'movie',
      added_at: new Date(2020, 9, 10).toISOString(),
      watched: false,
      genres: ['Action', 'Sci-Fi'],
      duration_minutes: 148,
      episode_count: null,
      poster_url: 'https://www.themoviedb.org/t/p/w1280/o67j9kC53yJfjAArFs224Diwapa.jpg',
      external_id: '12345',
      external_source: 'tmdb',
    },
    {
      id: '2',
      user_id: 'user123',
      title: 'Stranger Things',
      type: 'series',
      added_at: new Date(2020, 9, 11).toISOString(),
      watched: true,
      genres: ['Drama', 'Fantasy', 'Horror'],
      duration_minutes: null,
      episode_count: 25,
      poster_url: 'https://www.themoviedb.org/t/p/w1280/x2LSRK2Cm7MZhjluni1msVJ3wDF.jpg',
      external_id: '67890',
      external_source: 'tmdb',
    },
    {
      id: '3',
      user_id: 'user123',
      title: 'The Witcher',
      type: 'anime',
      added_at: new Date(2020, 9, 12).toISOString(),
      watched: false,
      genres: ['Action', 'Adventure', 'Fantasy'],
      duration_minutes: null,
      episode_count: 16,
      poster_url: 'https://www.themoviedb.org/t/p/w1280/zrPpUlehQaBf8YX2NrVrKK8IEpf.jpg',
      external_id: '112233',
      external_source: 'tmdb',
    },
    {
      id: '4',
      user_id: 'user123',
      title: 'The Mandalorian',
      type: 'series',
      added_at: new Date(2020, 9, 13).toISOString(),
      watched: true,
      genres: ['Action', 'Adventure', 'Sci-Fi'],
      duration_minutes: null,
      episode_count: 16,
      poster_url: 'https://www.themoviedb.org/t/p/w1280/zrPpUlehQaBf8YX2NrVrKK8IEpf.jpg',
      external_id: '445566',
      external_source: 'tmdb',
    },
    {
      id: '5',
      user_id: 'user123',
      title: 'Attack on Titan',
      type: 'anime',
      added_at: new Date().toISOString(),
      watched: false,
      genres: ['Action', 'Adventure', 'Fantasy'],
      duration_minutes: null,
      episode_count: 75,
      poster_url: 'https://www.themoviedb.org/t/p/w1280/zrPpUlehQaBf8YX2NrVrKK8IEpf.jpg',
      external_id: '778899',
      external_source: 'tmdb',
    },
  ];
  private watchlistItemsSubject = new BehaviorSubject<WatchlistItem[]>([
    ...this.mockData,
    ...this.mockData,
    ...this.mockData,
  ]);
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
      console.error('Error adding to watchlist:', error);
      return null;
    }
    this.watchlistItemsSubject.next(
      data ? [...this.watchlistItemsSubject.value, data] : this.watchlistItemsSubject.value
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
