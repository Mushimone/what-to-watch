import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Profile } from '../models/profile.model';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private supabase = inject(SupabaseService);

  private _profile$ = new BehaviorSubject<Profile | null>(null);
  profile$ = this._profile$.asObservable();

  /** Loads the current user's profile row into the subject. */
  async loadProfile(): Promise<Profile | null> {
    const userId = this.supabase.getCurrentUser()?.id;
    if (!userId) return null;
    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Error loading profile:', error);
      return null;
    }
    this._profile$.next(data);
    return data;
  }

  /** Persists a chosen username (display label, not unique). */
  async setUsername(username: string): Promise<boolean> {
    const userId = this.supabase.getCurrentUser()?.id;
    if (!userId) return false;
    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .update({ username })
      .eq('id', userId)
      .select()
      .single();
    if (error) {
      console.error('Error setting username:', error);
      return false;
    }
    this._profile$.next(data);
    return true;
  }
}
