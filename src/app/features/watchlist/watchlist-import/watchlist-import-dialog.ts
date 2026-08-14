import { NgTemplateOutlet, SlicePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';
import { SearchService } from '../../../core/services/search.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { SearchResult, WatchlistItem } from '../../../core/models/watchlist-item.model';
import {
  ImportEntry,
  ImportRow,
  ImportSource,
  RowStatus,
  classifyUrl,
  detectSource,
  entriesFromItemNames,
  key,
  mapPool,
  parseCsv,
  pickMatch,
  toEntries,
  toRow,
} from './list-import';

/** What the pane needs to know once the sheet closes. */
export interface ImportOutcome {
  added: number;
}

/** How many TMDB lookups are in flight at once. */
const CONCURRENCY = 6;
/** A single lookup that hangs shouldn't hold the whole run open. */
const LOOKUP_TIMEOUT = 15_000;

type Phase = 'pick' | 'reading' | 'matching' | 'review' | 'saving';

/**
 * Why a pasted link didn't work, in the user's words. `imdb` is not a failure
 * of ours — IMDb answers a server fetch with a bot challenge and forbids
 * automated collection, so their lists come in as a CSV export instead.
 */
const URL_ERRORS: Record<string, string> = {
  imdb: 'IMDb blocks other sites from reading its pages, so a link can’t work. Open the list on IMDb, choose ⋯ → Export, and drop that .csv here — it also matches exactly, by IMDb id.',
  unsupported:
    'Paste a link to a public Letterboxd list or watchlist — letterboxd.com/…/list/… or letterboxd.com/…/watchlist/.',
  'unsupported-url':
    'That is a Letterboxd link, but not to a list. Open the list itself and copy the address from there.',
  'not-public':
    'That list isn’t public, or it has moved. Letterboxd only shows public lists to people who aren’t signed in as their owner.',
  unreachable: 'Couldn’t reach Letterboxd just now. Try again in a moment.',
  empty: 'That list is public but has no films on it.',
};

/**
 * Reads a list exported from IMDb or Letterboxd and adds what's in it.
 *
 * The whole run happens here in the browser: the export carries either an IMDb
 * id (exact) or a title and year (matched against TMDB), and both are lookups
 * this app already makes from the client. That's what lets the sheet show real
 * per-title progress and hand back every failure individually, rather than one
 * opaque wait and a number at the end.
 */
@Component({
  selector: 'app-watchlist-import-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    NgTemplateOutlet,
    SlicePipe,
  ],
  templateUrl: './watchlist-import-dialog.html',
  styleUrl: './watchlist-import-dialog.scss',
})
export class WatchlistImportDialog {
  /** Single entry point, so Back closes the sheet like every other one. */
  static open(dialog: MatDialog): MatDialogRef<WatchlistImportDialog, ImportOutcome | undefined> {
    const ref = dialog.open<WatchlistImportDialog, void, ImportOutcome>(WatchlistImportDialog, {
      panelClass: 'import-sheet',
      width: '640px',
      maxWidth: '95vw',
      autoFocus: 'dialog',
    });

    history.pushState({ importSheet: true }, '');
    const onPop = () => ref.close();
    addEventListener('popstate', onPop);
    ref.afterClosed().subscribe(() => {
      removeEventListener('popstate', onPop);
      if (history.state?.importSheet) history.back();
    });

    return ref;
  }

  private search = inject(SearchService);
  private watchlist = inject(WatchlistService);
  private dialogRef = inject(MatDialogRef<WatchlistImportDialog>);

  readonly phase = signal<Phase>('pick');
  /** Shown on the pick step — a bad file is answered where it was dropped. */
  readonly pickError = signal<string | null>(null);
  readonly dragging = signal(false);

  readonly source = signal<ImportSource | null>(null);
  /** What the run is reading — a file name or a list name. Shown while it works. */
  readonly origin = signal('');
  readonly listUrl = signal('');
  /** Set when a list was longer than the function will walk. */
  readonly truncated = signal(false);

  readonly rows = signal<ImportRow[]>([]);
  readonly done = signal(0);
  readonly total = signal(0);
  readonly saveError = signal(false);

  /** Flipped by Cancel; the resolve loop checks it between lookups. */
  private aborted = false;
  /** Watchlist keys as of the start of the run — what "already yours" means. */
  private savedKeys = new Set<string>();
  /** Reported back to the pane, so a mid-flow exit still says what landed. */
  private savedThisRun = 0;

  readonly sourceLabel = computed(
    () =>
      ({ imdb: 'IMDb', letterboxd: 'Letterboxd', generic: 'your file' })[
        this.source() ?? 'generic'
      ],
  );

  private rowsWith = (status: RowStatus) =>
    computed(() => this.rows().filter((row) => row.status === status));
  readonly matched = this.rowsWith('matched');
  readonly duplicates = this.rowsWith('duplicate');
  readonly ambiguous = this.rowsWith('ambiguous');
  readonly notFound = this.rowsWith('not-found');
  readonly failed = this.rowsWith('failed');

  readonly selectedCount = computed(() => this.matched().filter((row) => row.selected).length);
  readonly allSelected = computed(
    () => this.matched().length > 0 && this.selectedCount() === this.matched().length,
  );
  readonly progressLabel = computed(() => `Matching titles, ${this.done()} of ${this.total()}`);

  // ── Pick ──────────────────────────────────────────────────────────────────

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.read(file);
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same file twice still fires a change event.
    input.value = '';
    if (file) this.read(file);
  }

  private async read(file: File): Promise<void> {
    this.pickError.set(null);

    // Letterboxd hands you a zip of several csvs; unpacking it here would be a
    // lot of code to save one double-click, so we say which file we want.
    if (/\.zip$/i.test(file.name)) {
      this.pickError.set(
        'That is the Letterboxd zip — unzip it and pick the list’s .csv from inside.',
      );
      return;
    }

    const rows = parseCsv(await file.text());
    const source = detectSource(rows);
    const entries = source ? toEntries(rows) : [];
    if (!entries.length) {
      this.pickError.set(
        source
          ? 'That file is a list we can read, but there is nothing in it.'
          : 'That does not look like an IMDb or Letterboxd export — it needs a Title or Name column.',
      );
      return;
    }

    this.source.set(source);
    this.origin.set(file.name);
    this.truncated.set(false);
    this.resolve(entries);
  }

  // ── Reading a link ────────────────────────────────────────────────────────

  /**
   * Two steps the user can see apart: fetching the list (one opaque call — the
   * function is walking someone else's paginated pages) and then matching it
   * (counted, here). Only the second has a number, so only the second gets one.
   */
  async readUrl(): Promise<void> {
    const url = this.listUrl().trim();
    if (!url) return;

    const kind = classifyUrl(url);
    if (kind !== 'letterboxd') {
      this.pickError.set(URL_ERRORS[kind === 'imdb' ? 'imdb' : 'unsupported']);
      return;
    }

    this.pickError.set(null);
    this.aborted = false;
    this.phase.set('reading');

    const result = await this.search.fetchListItems(url);
    if (this.aborted) return;

    if ('error' in result) {
      this.pickError.set(URL_ERRORS[result.error] ?? URL_ERRORS['unreachable']);
      this.phase.set('pick');
      return;
    }

    const entries = entriesFromItemNames(result.items);
    if (!entries.length) {
      this.pickError.set(URL_ERRORS['empty']);
      this.phase.set('pick');
      return;
    }

    this.source.set('letterboxd');
    this.origin.set(result.name || 'Letterboxd list');
    this.truncated.set(result.truncated);
    this.resolve(entries);
  }

  // ── Matching ──────────────────────────────────────────────────────────────

  private async resolve(entries: ImportEntry[]): Promise<void> {
    this.aborted = false;
    this.done.set(0);
    this.total.set(entries.length);
    this.phase.set('matching');

    const items = await this.watchlist.getWatchlist();
    this.savedKeys = new Set(items.map((item: WatchlistItem) => key(item)));

    const rows = await mapPool(
      entries,
      CONCURRENCY,
      (entry) => this.resolveOne(entry),
      (completed) => this.done.set(completed),
    );

    if (this.aborted) return; // Cancel already reset the sheet
    this.rows.set(rows);
    this.phase.set('review');
  }

  private async resolveOne(entry: ImportEntry): Promise<ImportRow> {
    const unresolved: ImportRow = {
      entry,
      status: 'failed',
      result: null,
      candidates: [],
      selected: false,
    };
    if (this.aborted) return unresolved;

    // An IMDb id is exact, so it needs no title match at all.
    const lookup = entry.imdbId
      ? this.search.findByImdbId(entry.imdbId)
      : this.search.searchTitles(entry.name);

    const candidates = await firstValueFrom(
      lookup.pipe(
        timeout(LOOKUP_TIMEOUT),
        // null is a network or timeout failure — retryable, and kept apart
        // from the titles TMDB genuinely doesn't carry.
        catchError(() => of(null)),
      ),
    );
    if (candidates === null) return unresolved;

    return toRow(entry, pickMatch(entry, candidates), this.savedKeys);
  }

  cancel(): void {
    this.aborted = true;
    this.rows.set([]);
    this.done.set(0);
    this.total.set(0);
    this.pickError.set(null);
    this.phase.set('pick');
  }

  /** Pasting a link into the field is the same as submitting it. */
  onUrlPaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text')?.trim();
    if (!pasted) return;
    event.preventDefault();
    this.listUrl.set(pasted);
    this.readUrl();
  }

  // ── Review ────────────────────────────────────────────────────────────────

  toggle(row: ImportRow): void {
    this.rows.update((rows) => rows.map((r) => (r === row ? { ...r, selected: !r.selected } : r)));
  }

  toggleAll(): void {
    const selected = !this.allSelected();
    this.rows.update((rows) => rows.map((r) => (r.status === 'matched' ? { ...r, selected } : r)));
  }

  /** An ambiguous row resolves the moment the user names the film they meant. */
  choose(row: ImportRow, result: SearchResult): void {
    this.rows.update((rows) =>
      rows.map((r) =>
        r === row
          ? toRow(r.entry, { status: 'matched', result, candidates: [] }, this.savedKeys)
          : r,
      ),
    );
  }

  /** Only the network failures — a title TMDB lacks won't appear on a retry. */
  async retryFailed(): Promise<void> {
    const stale = this.failed();
    if (!stale.length) return;

    this.aborted = false;
    this.done.set(0);
    this.total.set(stale.length);
    this.phase.set('matching');

    const fresh = await mapPool(
      stale,
      CONCURRENCY,
      (row) => this.resolveOne(row.entry),
      (completed) => this.done.set(completed),
    );

    if (this.aborted) return;
    const replacement = new Map(stale.map((row, i) => [row, fresh[i]]));
    this.rows.update((rows) => rows.map((row) => replacement.get(row) ?? row));
    this.phase.set('review');
  }

  /** Hands the title to the Add pane's search box and steps out of the way. */
  searchFor(row: ImportRow): void {
    this.close();
    this.search.requestSearch(row.entry.name);
  }

  async add(): Promise<void> {
    const picked = this.matched().filter((row) => row.selected);
    if (!picked.length) return;

    this.saveError.set(false);
    this.phase.set('saving');
    const added = await this.watchlist.addMany(
      picked.map((row) => ({ ...row.result!, watched: false })),
    );

    if (added === null) {
      this.saveError.set(true);
      this.phase.set('review');
      return;
    }
    this.savedThisRun = added.length;
    this.dialogRef.close({ added: added.length });
  }

  close(): void {
    this.dialogRef.close(this.savedThisRun ? { added: this.savedThisRun } : undefined);
  }
}
