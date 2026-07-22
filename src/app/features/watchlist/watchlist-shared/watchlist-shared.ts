import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Profile } from '../../../core/models/profile.model';
import { SharedPoolEntry } from '../../../core/models/shared-pool.model';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { FriendsService } from '../../../core/services/friends.service';
import { RosterEntry, buildRoster, mergeWatchlists, overlapOnly } from './shared-pool';
import { buildGroupPickPrompt } from '../recommend.prompt';
import { WatchlistTournamentDialog } from '../watchlist-tournament-dialog/watchlist-tournament-dialog';
import { WatchlistGroupPickDialog } from '../watchlist-group-pick-dialog/watchlist-group-pick-dialog';
import { WatchlistDetailDialog, DetailDialogData } from '../watchlist-detail-dialog/watchlist-detail-dialog';

@Component({
  selector: 'app-watchlist-shared',
  imports: [
    AsyncPipe,
    MatButtonModule,
    MatIconModule,
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
  // Watched titles from both sides — the taste signal for the AI group pick.
  myWatched = signal<WatchlistItem[]>([]);
  theirWatched = signal<WatchlistItem[]>([]);
  loading = signal(false);
  roster = signal<RosterEntry[]>([]);
  rosterLoading = signal(false);

  displayedPool = computed(() =>
    this.overlapOnlyView() ? overlapOnly(this.pool()) : this.pool(),
  );

  async ngOnInit(): Promise<void> {
    const friends = await this.friends.getFriends();
    if (!friends.length) return;
    this.rosterLoading.set(true);
    const mine = await this.watchlist.getWatchlist();
    const theirsAll = await this.friends.getFriendsWatchlists(friends.map((f) => f.id));
    this.roster.set(buildRoster(friends, mine, theirsAll));
    this.rosterLoading.set(false);
  }

  /** Back to the friend list. */
  clearFriend(): void {
    this.selectedFriend.set(null);
    this.pool.set([]);
  }

  async selectFriend(friend: Profile): Promise<void> {
    this.selectedFriend.set(friend);
    this.loading.set(true);
    const mineAll = await this.watchlist.getWatchlist();
    const theirsAll = await this.friends.getFriendWatchlist(friend.id);
    this.myWatched.set(mineAll.filter((i) => i.watched));
    this.theirWatched.set(theirsAll.filter((i) => i.watched));
    const mine = mineAll.filter((i) => !i.watched);
    const theirs = theirsAll.filter((i) => !i.watched);
    this.pool.set(mergeWatchlists(mine, theirs));
    this.loading.set(false);
  }

  /** Ask the recommender to pick one title from the shared pool for both of us. */
  askAiToPick(): void {
    const pool = this.displayedPool();
    if (pool.length === 0) {
      this.snackbar.open('No titles to pick from.', 'Dismiss', { duration: 4000 });
      return;
    }
    const system = buildGroupPickPrompt(
      this.myWatched(),
      this.theirWatched(),
      pool,
      this.selectedFriend()?.username || 'your friend',
      navigator.language,
    );
    this.dialog.open(WatchlistGroupPickDialog, {
      data: { system },
      width: '560px',
      maxWidth: '95vw',
      autoFocus: false,
    });
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
    // The dialog asks for the bracket size before dealing the first matchup.
    this.dialog.open(WatchlistTournamentDialog, {
      data: pool,
      width: '680px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }

  openDetail(entry: SharedPoolEntry): void {
    // A friend-only title isn't in my list, so offer "Add" (preview flow) rather
    // than the Mark-watched/Remove actions that would target the friend's row.
    const data: DetailDialogData =
      entry.owner === 'them' ? { mode: 'preview', result: entry.item } : entry.item;
    WatchlistDetailDialog.open(this.dialog, data);
  }
}
