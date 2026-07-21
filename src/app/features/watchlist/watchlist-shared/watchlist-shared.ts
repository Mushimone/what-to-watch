import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Profile } from '../../../core/models/profile.model';
import { SharedPoolEntry } from '../../../core/models/shared-pool.model';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { FriendsService } from '../../../core/services/friends.service';
import { mergeWatchlists, overlapOnly } from './shared-pool';
import { shuffle } from './tournament';
import { WatchlistTournamentDialog } from '../watchlist-tournament-dialog/watchlist-tournament-dialog';
import { WatchlistDetailDialog } from '../watchlist-detail-dialog/watchlist-detail-dialog';

@Component({
  selector: 'app-watchlist-shared',
  imports: [
    AsyncPipe,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './watchlist-shared.html',
  styleUrl: './watchlist-shared.scss',
})
export class WatchlistShared implements OnInit {
  private friends = inject(FriendsService);
  private watchlist = inject(WatchlistService);
  private dialog = inject(MatDialog);
  private snackbar = inject(MatSnackBar);

  friends$ = this.friends.friends$;

  selectedFriend = signal<Profile | null>(null);
  overlapOnlyView = signal(false);
  pool = signal<SharedPoolEntry[]>([]);
  loading = signal(false);
  introDismissed = signal(localStorage.getItem('sharedIntroDismissed') === 'true');

  /** How many titles enter the bracket; 'all' uses the whole pool. */
  tournamentSize = signal<number | 'all'>('all');
  private readonly sizePresets = [4, 8, 16, 32, 64];

  displayedPool = computed(() =>
    this.overlapOnlyView() ? overlapOnly(this.pool()) : this.pool(),
  );

  /** Presets smaller than the current pool — larger ones would equal "All". */
  sizeOptions = computed(() => this.sizePresets.filter((n) => n < this.displayedPool().length));

  async ngOnInit(): Promise<void> {
    const friends = await this.friends.getFriends();
    if (friends.length) await this.selectFriend(friends[0]);
  }

  async selectFriend(friend: Profile): Promise<void> {
    this.selectedFriend.set(friend);
    this.loading.set(true);
    const mineAll = await this.watchlist.getWatchlist();
    const theirsAll = await this.friends.getFriendWatchlist(friend.id);
    const mine = mineAll.filter((i) => !i.watched);
    const theirs = theirsAll.filter((i) => !i.watched);
    this.pool.set(mergeWatchlists(mine, theirs));
    this.loading.set(false);
  }

  dismissIntro(): void {
    this.introDismissed.set(true);
    localStorage.setItem('sharedIntroDismissed', 'true');
  }

  async invite(): Promise<void> {
    const url = await this.friends.createInvite();
    if (!url) {
      this.snackbar.open('Could not create invite link.', 'Dismiss', { duration: 4000 });
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Watch together', text: 'Let’s pick something to watch', url });
        return;
      } catch {
        // user cancelled the share sheet — fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    this.snackbar.open('Invite link copied to clipboard.', 'Dismiss', { duration: 4000 });
  }

  startTournament(): void {
    const pool = this.displayedPool().map((e) => e.item);
    if (pool.length < 2) {
      this.snackbar.open('Need at least 2 titles to run a tournament.', 'Dismiss', {
        duration: 4000,
      });
      return;
    }
    const size = this.tournamentSize();
    const items =
      size === 'all' ? pool : shuffle(pool).slice(0, Math.min(size, pool.length));
    this.dialog.open(WatchlistTournamentDialog, {
      data: items,
      width: '680px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }

  openDetail(entry: SharedPoolEntry): void {
    this.dialog.open(WatchlistDetailDialog, {
      data: entry.item,
      width: '680px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }
}
