import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { WatchlistDetailDialog } from './watchlist-detail-dialog';
import { SearchService } from '../../../core/services/search.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { OpenAiService } from '../../../core/services/openai.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { SearchResult, WatchlistItem } from '../../../core/models/watchlist-item.model';

const USER = 'user-1';

const result = {
  external_id: '1',
  external_source: 'tmdb',
  title: 'Dune',
  type: 'movie',
  genres: [],
} as unknown as SearchResult;

/** The row Supabase hands back from the insert. */
const savedRow = { ...result, id: 'row-1', user_id: USER, added_at: '', watched: false } as WatchlistItem;

describe('WatchlistDetailDialog · add flow', () => {
  let close: ReturnType<typeof vi.fn>;
  let addToWatchlist: ReturnType<typeof vi.fn>;

  const build = () => {
    TestBed.configureTestingModule({
      imports: [WatchlistDetailDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { mode: 'preview', result } },
        { provide: MatDialogRef, useValue: { close, afterClosed: () => of(undefined) } },
        {
          provide: SearchService,
          useValue: {
            watchRegion: 'IT',
            getTmdbDetails: () => of(null),
            getWatchProviders: () => of([]),
          },
        },
        { provide: SupabaseService, useValue: { getCurrentUser: () => ({ id: USER }) } },
        { provide: OpenAiService, useValue: { chat: () => of('') } },
        {
          provide: WatchlistService,
          useValue: { watchlistItems$: of([]), addToWatchlist, clearUpdateFlag: vi.fn() },
        },
      ],
    });
    return TestBed.createComponent(WatchlistDetailDialog).componentInstance;
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    close = vi.fn();
  });

  it('stays open in saved mode after a successful add', async () => {
    addToWatchlist = vi.fn().mockResolvedValue(savedRow);
    const dialog = build();
    expect(dialog.mode()).toBe('preview');

    await dialog.add();

    expect(close).not.toHaveBeenCalled();
    expect(dialog.mode()).toBe('saved');
    // The saved row, not the preview stub — Remove and progress target its id.
    expect(dialog.item().id).toBe('row-1');
    expect(dialog.isOwn).toBe(true);
  });

  it('closes with a status when the add fails', async () => {
    addToWatchlist = vi.fn().mockResolvedValue('duplicate');
    await build().add();
    expect(close).toHaveBeenCalledWith('duplicate');
  });
});
