import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SearchResult } from '../../../core/models/watchlist-item.model';
import { SearchService } from '../../../core/services/search.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { TitleLinks } from './title-links';

const hit = (id: string, title: string, year: string): SearchResult => ({
  title,
  type: 'movie',
  genres: [],
  duration_minutes: null,
  episode_count: null,
  poster_url: null,
  external_id: id,
  external_source: 'tmdb',
  release_date: `${year}-01-01`,
});

function setup(candidates: SearchResult[] | Error, saved: unknown[] = []) {
  const open = vi.fn(() => ({ afterClosed: () => of(undefined) }));
  const snack = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SearchService,
        useValue: {
          searchTitles: () => (candidates instanceof Error ? throwError(() => candidates) : of(candidates)),
        },
      },
      { provide: WatchlistService, useValue: { getWatchlist: async () => saved } },
      { provide: MatDialog, useValue: { open } },
      { provide: MatSnackBar, useValue: { open: snack } },
    ],
  });
  return { links: TestBed.inject(TitleLinks), open, snack };
}

/** What the sheet was opened with — `WatchlistDetailDialog.open` passes it as `data`. */
const openedWith = (open: ReturnType<typeof vi.fn>) => open.mock.lastCall?.[1].data;

describe('TitleLinks', () => {
  it('opens the add-preview for a title not on the list, picking by year', async () => {
    const { links, open } = setup([hit('1', 'Heat', '1986'), hit('2', 'Heat', '1995')]);
    await links.open('Heat', 1995);
    expect(openedWith(open)).toEqual({
      mode: 'preview',
      result: expect.objectContaining({ external_id: '2' }),
    });
  });

  it('opens the saved row when the title is already on the list', async () => {
    const row = { ...hit('2', 'Heat', '1995'), id: 'row-1' };
    const { links, open } = setup([hit('2', 'Heat', '1995')], [row]);
    await links.open('Heat', 1995);
    expect(openedWith(open)).toBe(row);
  });

  it('says so when nothing matches, and opens nothing', async () => {
    const { links, snack, open } = setup([]);
    await links.open('Nope', 2000);
    expect(snack).toHaveBeenCalledWith(`Couldn't find "Nope".`, 'Dismiss', expect.anything());
    expect(open).not.toHaveBeenCalled();
  });

  it('survives a catalogue outage', async () => {
    const { links, snack, open } = setup(new Error('offline'));
    await links.open('Heat', 1995);
    expect(snack).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
