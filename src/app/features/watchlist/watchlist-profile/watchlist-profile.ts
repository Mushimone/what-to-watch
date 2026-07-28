import { Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ProfileService } from '../../../core/services/profile.service';
import { FriendsService } from '../../../core/services/friends.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { Profile } from '../../../core/models/profile.model';
import { DeleteAccountDialog } from '../../auth/delete-account-dialog/delete-account-dialog';

/**
 * Who you are signed in as, what you have tracked, and the two ways out. The
 * counts come off the caches the other panes already filled — this screen adds
 * no round-trip of its own beyond refreshing the friend list.
 */
@Component({
  selector: 'app-watchlist-profile',
  imports: [DatePipe, RouterLink, MatIconModule],
  templateUrl: './watchlist-profile.html',
  styleUrl: './watchlist-profile.scss',
})
export class WatchlistProfile implements OnInit {
  private supabase = inject(SupabaseService);
  private profileService = inject(ProfileService);
  private friendsService = inject(FriendsService);
  private watchlist = inject(WatchlistService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  profile = toSignal(this.profileService.profile$, { initialValue: null as Profile | null });
  private items = toSignal(this.watchlist.watchlistItems$, {
    initialValue: [] as WatchlistItem[],
  });
  private friends = toSignal(this.friendsService.friends$, { initialValue: [] as Profile[] });

  email = this.supabase.getCurrentUser()?.email ?? '';
  tracked = computed(() => this.items().length);
  watched = computed(() => this.items().filter((item) => item.watched).length);
  friendCount = computed(() => this.friends().length);
  /** Avatar falls back to the first letter of whatever name we have. */
  initial = computed(() => (this.profile()?.username ?? this.email).trim().charAt(0).toUpperCase());

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.profileService.loadProfile(),
      this.watchlist.getWatchlist(),
      this.friendsService.getFriends(),
    ]);
  }

  async logout(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }

  deleteAccount(): void {
    this.dialog
      .open(DeleteAccountDialog, { width: '440px', maxWidth: '95vw', autoFocus: true })
      .afterClosed()
      .subscribe((deleted) => {
        if (deleted) this.router.navigate(['/']);
      });
  }
}
