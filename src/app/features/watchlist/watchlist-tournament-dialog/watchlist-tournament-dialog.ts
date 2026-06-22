import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { WatchlistDetailDialog } from '../watchlist-detail-dialog/watchlist-detail-dialog';
import { createTournament, choose, TournamentState } from '../watchlist-shared/tournament';

@Component({
  selector: 'app-watchlist-tournament-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './watchlist-tournament-dialog.html',
  styleUrl: './watchlist-tournament-dialog.scss',
})
export class WatchlistTournamentDialog {
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<WatchlistTournamentDialog>);
  private items = inject<WatchlistItem[]>(MAT_DIALOG_DATA);

  state = signal<TournamentState>(createTournament(this.items));

  pick(side: 'a' | 'b'): void {
    this.state.set(choose(this.state(), side));
  }

  restart(): void {
    this.state.set(createTournament(this.items));
  }

  openWinner(item: WatchlistItem): void {
    this.dialogRef.close();
    this.dialog.open(WatchlistDetailDialog, {
      data: item,
      width: '680px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }
}
