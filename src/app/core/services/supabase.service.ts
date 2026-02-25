import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private _currentUser$ = new BehaviorSubject<User | null>(null);
  currentUser$ = this._currentUser$.asObservable();

  constructor() {
    this.supabase = createClient(environment.supabase.url, environment.supabase.anonKey);
    this.initAuthListener();
  }

  private initAuthListener() {
    this.supabase.auth.getSession().then(({ data: { session } }) => {
      this._currentUser$.next(session?.user ?? null);
    });
    this.supabase.auth.onAuthStateChange((event, session) => {
      this._currentUser$.next(session?.user ?? null);
    });
  }

  public signOut() {
    return this.supabase.auth.signOut();
  }

  public signInWithGoogle() {
    return this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
  }

  public getClient() {
    return this.supabase;
  }

  public getCurrentUser() {
    return this._currentUser$.value;
  }
}
