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

describe('WatchlistDetailDialog · season progress', () => {
  /** 3 seasons of 10, 8 and 6 episodes; S1 already watched. */
  const show = {
    ...savedRow,
    type: 'series',
    season_count: 3,
    episode_count: 24,
    watched_seasons: [1],
    watched_episodes: 0,
  } as WatchlistItem;

  let setWatchedEpisodes: ReturnType<typeof vi.fn>;
  let setWatchedSeasons: ReturnType<typeof vi.fn>;

  const build = () => {
    setWatchedEpisodes = vi.fn();
    setWatchedSeasons = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [WatchlistDetailDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: show },
        { provide: MatDialogRef, useValue: { close: vi.fn(), afterClosed: () => of(undefined) } },
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
          useValue: {
            watchlistItems$: of([]),
            clearUpdateFlag: vi.fn(),
            updateDetails: vi.fn(),
            setWatchedEpisodes,
            setWatchedSeasons,
          },
        },
      ],
    });
    const dialog = TestBed.createComponent(WatchlistDetailDialog).componentInstance;
    dialog.seasonEpisodes.set([10, 8, 6]);
    return dialog;
  };

  it('steps episodes within the first unwatched season', () => {
    const dialog = build();
    expect(dialog.currentSeason).toBe(2);
    expect(dialog.episodeTotal).toBe(8);

    dialog.setEpisodes(4);

    expect(dialog.watchedEpisodes).toBe(4);
    expect(dialog.seasonProgress(2)).toBe('50%');
    expect(setWatchedEpisodes).toHaveBeenCalledWith('row-1', 4);
    // Part-way through a season is not the whole series watched.
    expect(dialog.item().watched).toBe(false);
    expect(setWatchedSeasons).not.toHaveBeenCalled();
  });

  it('ticks the season and hands the stepper to the next one at the last episode', () => {
    const dialog = build();

    dialog.setEpisodes(8);

    expect(dialog.item().watched_seasons).toEqual([1, 2]);
    expect(setWatchedSeasons).toHaveBeenCalledWith('row-1', [1, 2]);
    expect(dialog.currentSeason).toBe(3);
    expect(dialog.watchedEpisodes).toBe(0);
    expect(dialog.episodeTotal).toBe(6);
    expect(setWatchedEpisodes).toHaveBeenLastCalledWith('row-1', 0);
    expect(dialog.item().watched).toBe(false);
  });

  it('marks the series watched once the last season is finished', () => {
    const dialog = build();
    dialog.toggleSeason(2);

    dialog.setEpisodes(6);

    expect(dialog.item().watched_seasons).toEqual([1, 2, 3]);
    expect(dialog.item().watched).toBe(true);
    expect(dialog.currentSeason).toBeNull();
  });

  it('clears a stale part-watched count when a season chip is tapped', () => {
    const dialog = build();
    dialog.setEpisodes(4);

    dialog.toggleSeason(1);

    // S1 is unticked, so S1 is now in progress — the 4 belonged to S2.
    expect(dialog.currentSeason).toBe(1);
    expect(dialog.watchedEpisodes).toBe(0);
  });
});
