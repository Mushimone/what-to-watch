import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { WatchlistDetailDialog } from '../watchlist-detail-dialog/watchlist-detail-dialog';
import { createTournament, choose, shuffle, TournamentState } from '../watchlist-shared/tournament';

/** How long the pick animation plays before the next matchup is dealt. */
const PICK_ANIM_MS = 420;

@Component({
  selector: 'app-watchlist-tournament-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './watchlist-tournament-dialog.html',
  styleUrl: './watchlist-tournament-dialog.scss',
})
export class WatchlistTournamentDialog {
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<WatchlistTournamentDialog>);
  /** The full pool — the size step decides how much of it enters the bracket. */
  private pool = inject<WatchlistItem[]>(MAT_DIALOG_DATA);

  /** Null until the size step is answered. */
  state = signal<TournamentState | null>(null);
  /** The side just clicked — drives the win/lose animation, then clears. */
  picked = signal<'a' | 'b' | null>(null);

  poolSize = this.pool.length;
  /** Presets smaller than the pool — larger ones would just equal "All". */
  sizeOptions = computed(() => [4, 8, 16, 32, 64].filter((n) => n < this.poolSize));

  start(size: number | 'all'): void {
    this.state.set(createTournament(size === 'all' ? this.pool : shuffle(this.pool).slice(0, size)));
  }

  pick(side: 'a' | 'b'): void {
    if (this.picked()) return; // one vote per matchup — ignore double taps
    this.picked.set(side);
    const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PICK_ANIM_MS;
    setTimeout(() => {
      this.state.set(choose(this.state()!, side));
      this.picked.set(null);
    }, delay);
  }

  /** Back to the size step — a restart is also a chance to change the bracket. */
  restart(): void {
    this.picked.set(null);
    this.state.set(null);
  }

  openWinner(item: WatchlistItem): void {
    this.dialogRef.close();
    WatchlistDetailDialog.open(this.dialog, item);
  }
}
