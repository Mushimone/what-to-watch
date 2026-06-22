import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Profile } from '../models/profile.model';
import { AcceptInviteOutcome } from '../models/friend.model';
import { WatchlistItem } from '../models/watchlist-item.model';
import { toAcceptOutcome } from './accept-invite.util';

@Injectable({ providedIn: 'root' })
export class FriendsService {
  private supabase = inject(SupabaseService);

  private _friends$ = new BehaviorSubject<Profile[]>([]);
  friends$ = this._friends$.asObservable();

  /** Loads accepted friends (the other member of each friendship) as profiles. */
  async getFriends(): Promise<Profile[]> {
    const me = this.supabase.getCurrentUser()?.id;
    if (!me) return [];
    const client = this.supabase.getClient();

    const { data: links, error } = await client
      .from('friendships')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${me},user_b_id.eq.${me}`);
    if (error) {
      console.error('Error loading friendships:', error);
      return [];
    }

    const friendIds = (links ?? []).map((l) => (l.user_a_id === me ? l.user_b_id : l.user_a_id));
    if (friendIds.length === 0) {
      this._friends$.next([]);
      return [];
    }

    const { data: profiles, error: pErr } = await client
      .from('profiles')
      .select('*')
      .in('id', friendIds);
    if (pErr) {
      console.error('Error loading friend profiles:', pErr);
      return [];
    }
    this._friends$.next(profiles ?? []);
    return profiles ?? [];
  }

  /** Creates a single-use invite and returns its shareable URL. */
  async createInvite(): Promise<string | null> {
    const me = this.supabase.getCurrentUser()?.id;
    if (!me) return null;
    const token = crypto.randomUUID().replace(/-/g, '');
    const { error } = await this.supabase
      .getClient()
      .from('friend_invites')
      .insert({ token, inviter_id: me });
    if (error) {
      console.error('Error creating invite:', error);
      return null;
    }
    return `${window.location.origin}/invite/${token}`;
  }

  /** Consumes an invite token via the security-definer RPC. */
  async acceptInvite(token: string): Promise<AcceptInviteOutcome> {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('accept_friend_invite', { invite_token: token });
    return toAcceptOutcome(data, error);
  }

  /** A friend's full watchlist (RLS permits reads of friends' rows). */
  async getFriendWatchlist(friendId: string): Promise<WatchlistItem[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .select('*')
      .eq('user_id', friendId);
    if (error) {
      console.error('Error loading friend watchlist:', error);
      return [];
    }
    return data ?? [];
  }

  /** Removes the friendship in either canonical order. */
  async removeFriend(friendId: string): Promise<boolean> {
    const me = this.supabase.getCurrentUser()?.id;
    if (!me) return false;
    const { error } = await this.supabase
      .getClient()
      .from('friendships')
      .delete()
      .or(
        `and(user_a_id.eq.${me},user_b_id.eq.${friendId}),and(user_a_id.eq.${friendId},user_b_id.eq.${me})`,
      );
    if (error) {
      console.error('Error removing friend:', error);
      return false;
    }
    await this.getFriends();
    return true;
  }
}
