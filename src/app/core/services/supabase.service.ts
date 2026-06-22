import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private _currentUser$ = new BehaviorSubject<User | null | undefined>(undefined);
  currentUser$ = this._currentUser$.asObservable();

  constructor() {
    this.supabase = createClient(environment.supabase.url, environment.supabase.anonKey);
    this.initAuthListener();
  }

  private initAuthListener() {
    this.supabase.auth.onAuthStateChange((event, session) => {
      this._currentUser$.next(session?.user ?? null);
    });
  }

  public signOut() {
    return this.supabase.auth.signOut();
  }

  public signInWithGoogle(redirectTo: string = `${window.location.origin}/`) {
    return this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Defaults to the app root; callers (e.g. the invite flow) can pass an
        // explicit URL so OAuth returns the user to where they started.
        redirectTo,
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
