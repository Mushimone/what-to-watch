import { describe, it, expect } from 'vitest';
import { buildRoster, mergeWatchlists, overlapOnly } from './shared-pool';
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

describe('buildRoster', () => {
  const friend = (id: string) => ({ id, username: id, avatar_url: null, created_at: '' });
  const owned = (uid: string, id: string, poster: string | null = null) => ({
    ...mk(id),
    user_id: uid,
    poster_url: poster,
  });

  it('counts each friend\'s overlap, ignores watched rows, and sorts by overlap', () => {
    const roster = buildRoster(
      [friend('low'), friend('high')],
      [mk('A'), mk('B'), { ...mk('C'), watched: true }],
      [
        owned('low', 'A', 'p1.jpg'),
        owned('low', 'Z'),
        owned('high', 'A', 'p1.jpg'),
        owned('high', 'B'),
        owned('high', 'C'), // mine is watched → not shared
        { ...owned('high', 'D'), watched: true }, // theirs watched → not counted
      ],
    );

    expect(roster.map((r) => r.friend.id)).toEqual(['high', 'low']);
    expect(roster[0]).toMatchObject({ both: 2, total: 3 });
    expect(roster[1]).toMatchObject({ both: 1, total: 2, peek: ['p1.jpg'] });
  });
});
