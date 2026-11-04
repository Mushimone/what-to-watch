import { booleanAttribute, Directive, inject, Injectable, input } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { SearchResult } from '../../../core/models/watchlist-item.model';
import { SearchService } from '../../../core/services/search.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { key, pickMatch } from '../watchlist-import/list-import';

/**
 * Turns a title the AI named — "Heat", 1995 — into the sheet for that title:
 * the saved row if it is already on the list, otherwise the add-preview. The
 * matching is the import's (`pickMatch`): year decides, and a year the model got
 * slightly wrong still lands on the right film.
 */
@Injectable({ providedIn: 'root' })
export class TitleLinks {
  private search = inject(SearchService);
  private watchlist = inject(WatchlistService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  /** `from`: a sheet to close first — a link inside a sheet replaces it. */
  async open(name: string, year: number | null, from?: MatDialogRef<unknown>): Promise<void> {
    let candidates: SearchResult[];
    try {
      candidates = await firstValueFrom(this.search.searchTitles(name));
    } catch {
      this.snackBar.open('Could not reach the catalogue. Try again.', 'Dismiss', { duration: 4000 });
      return;
    }

    const match = pickMatch({ name, year, imdbId: null }, candidates);
    // `ambiguous` means no candidate fit the year; the model's year is the weaker
    // signal, so TMDB's own first pick beats asking a question about a chat line.
    const result = match.result ?? match.candidates[0];
    if (!result) {
      this.snackBar.open(`Couldn't find "${name}".`, 'Dismiss', { duration: 4000 });
      return;
    }

    const saved = (await this.watchlist.getWatchlist()).find((i) => key(i) === key(result));
    if (from) await this.closeSheet(from);

    // Imported on demand: the sheet imports the directive below, so a static
    // import here would be a cycle — and it keeps the sheet out of the first load.
    const { WatchlistDetailDialog } = await import(
      '../watchlist-detail-dialog/watchlist-detail-dialog'
    );
    WatchlistDetailDialog.open(this.dialog, saved ?? { mode: 'preview', result });
  }

  /**
   * A closing sheet pops its Back-button history entry asynchronously. A new
   * sheet opened before that pop would be closed by it, so wait for the pop
   * (or give up after a beat if there was none).
   */
  private async closeSheet(ref: MatDialogRef<unknown>): Promise<void> {
    const popped = new Promise<void>((resolve) => {
      addEventListener('popstate', () => resolve(), { once: true });
      setTimeout(resolve, 300);
    });
    ref.close();
    await popped;
  }
}

/** Put on the element holding `| markdown` output; clicks on its title buttons open the sheet. */
@Directive({
  selector: '[titleLinks]',
  host: { '(click)': 'onClick($event)' },
})
export class TitleLinksDirective {
  private links = inject(TitleLinks);
  private sheet = inject(MatDialogRef, { optional: true });
  /**
   * Set where the container is itself a detail sheet: the link replaces it.
   * Elsewhere (the group-pick result) the sheet opens on top and closing it
   * lands back where you were.
   */
  readonly closesSheet = input(false, { transform: booleanAttribute });

  onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>('button.title-link');
    if (!button || button.getAttribute('aria-busy')) return;
    button.setAttribute('aria-busy', 'true');
    const year = Number(button.dataset['year']);
    this.links
      .open(button.dataset['title'] ?? '', year || null, (this.closesSheet() && this.sheet) || undefined)
      .finally(() => button.removeAttribute('aria-busy'));
  }
}
