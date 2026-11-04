import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA, MatSnackBar, MatSnackBarRef } from '@angular/material/snack-bar';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { WatchlistService } from '../../../core/services/watchlist.service';

/**
 * The question asked right after a title is marked watched: did you like it?
 * It is a snackbar, not a dialog — ignoring it costs nothing, and the answer
 * is the same one the detail sheet takes, so it feeds the same recommender.
 */
@Component({
  selector: 'app-reaction-snack',
  imports: [MatIconModule],
  template: `
    <span class="label">Watched · {{ data.title }}</span>
    <button type="button" class="react react--like" (click)="react('liked')" aria-label="I liked it">
      <mat-icon>favorite</mat-icon>
    </button>
    <button type="button" class="react" (click)="react('disliked')" aria-label="I didn't like it">
      <mat-icon>thumb_down</mat-icon>
    </button>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
    }
    .label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .react {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: inherit;
      cursor: pointer;
      &:hover,
      &:focus-visible {
        background: var(--color-fill-soft);
      }
      &--like mat-icon {
        color: var(--color-heart);
      }
    }
  `,
})
export class ReactionSnack {
  readonly data = inject<WatchlistItem>(MAT_SNACK_BAR_DATA);
  private ref = inject(MatSnackBarRef);
  private watchlist = inject(WatchlistService);

  /** Asks only for a title with no reaction yet. */
  static ask(snackBar: MatSnackBar, item: WatchlistItem): void {
    if (item.reaction) return;
    snackBar.openFromComponent(ReactionSnack, { data: item, duration: 6000 });
  }

  react(reaction: 'liked' | 'disliked'): void {
    this.watchlist.setReaction(this.data.id, reaction);
    this.ref.dismiss();
  }
}
