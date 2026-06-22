import { describe, it, expect } from 'vitest';
import { mergeWatchlists, overlapOnly } from './shared-pool';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';

function mk(id: string): WatchlistItem {
  return {
    id: `row-${id}`,
    user_id: 'u',
    title: `Title ${id}`,
    type: 'movie',
    genres: [],
    duration_minutes: null,
    episode_count: null,
    poster_url: null,
    external_id: id,
    external_source: 'tmdb',
    watched: false,
    added_at: '2026-01-01',
  };
}

describe('mergeWatchlists', () => {
  it('tags items in both lists as "both", others as "me"/"them"', () => {
    const pool = mergeWatchlists([mk('A'), mk('B')], [mk('B'), mk('C')]);
    const byId = Object.fromEntries(pool.map((e) => [e.item.external_id, e.owner]));
    expect(byId).toEqual({ A: 'me', B: 'both', C: 'them' });
    expect(pool).toHaveLength(3);
  });

  it('dedupes so each title appears once', () => {
    const pool = mergeWatchlists([mk('A'), mk('A')], []);
    expect(pool).toHaveLength(1);
  });

  it('handles an empty "mine" list', () => {
    const pool = mergeWatchlists([], [mk('X')]);
    expect(pool).toEqual([{ item: expect.objectContaining({ external_id: 'X' }), owner: 'them' }]);
  });

  it('overlapOnly returns just the "both" entries', () => {
    const pool = mergeWatchlists([mk('A'), mk('B')], [mk('B')]);
    expect(overlapOnly(pool).map((e) => e.item.external_id)).toEqual(['B']);
  });
});
