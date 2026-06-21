import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { toSignal } from '@angular/core/rxjs-interop';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { WatchlistDetailDialog } from '../watchlist-detail-dialog/watchlist-detail-dialog';

@Component({
  selector: 'app-watchlist-time-picker-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './watchlist-time-picker-dialog.html',
  styleUrl: './watchlist-time-picker-dialog.scss',
})
export class WatchlistTimePickerDialog {
  private watchlist = inject(WatchlistService);
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<WatchlistTimePickerDialog>);

  private items = toSignal(this.watchlist.watchlistItems$, { initialValue: [] });

  minutes = signal<number | null>(null);
  /** True once the user has asked for a result, so we know to show empty state. */
  searched = signal(false);

  /** Bridges the number input's ngModel to the `minutes` signal. */
  get minutesValue(): number | null {
    return this.minutes();
  }
  set minutesValue(value: number | null) {
    this.minutes.set(value ? Number(value) : null);
    this.searched.set(false); // re-search after editing
  }

  /** Unwatched titles whose runtime fits the budget, best use of time first. */
  matches = computed<WatchlistItem[]>(() => {
    const budget = this.minutes();
    if (!budget || budget <= 0) return [];
    return this.items()
      .filter((i) => !i.watched && i.duration_minutes != null && i.duration_minutes <= budget)
      .sort((a, b) => (b.duration_minutes ?? 0) - (a.duration_minutes ?? 0));
  });

  search(): void {
    this.searched.set(true);
  }

  runtimeLabel(minutes: number | null): string {
    if (minutes == null) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`;
  }

  open(item: WatchlistItem): void {
    this.dialogRef.close();
    this.dialog.open(WatchlistDetailDialog, {
      data: item,
      width: '680px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }
}
