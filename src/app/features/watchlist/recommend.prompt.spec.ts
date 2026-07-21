import { describe, it, expect } from 'vitest';
import { buildGroupPickPrompt } from './recommend.prompt';
import { WatchlistItem } from '../../core/models/watchlist-item.model';
import { SharedPoolEntry } from '../../core/models/shared-pool.model';

function mk(id: string, over?: Partial<WatchlistItem>): WatchlistItem {
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
    ...over,
  };
}

describe('buildGroupPickPrompt', () => {
  const pool: SharedPoolEntry[] = [
    { item: mk('A'), owner: 'both' },
    { item: mk('B'), owner: 'me' },
    { item: mk('C'), owner: 'them' },
  ];
  const prompt = buildGroupPickPrompt(
    [mk('W', { watched: true })],
    [mk('X', { watched: true })],
    pool,
    'Sara',
    'it-IT',
  );

  it('tags each candidate by whose list it is on', () => {
    expect(prompt).toContain('Title A (movie)  [★ both lists]');
    expect(prompt).toContain('Title B (movie)  [your list]');
    expect(prompt).toContain("Title C (movie)  [Sara's list]");
  });

  it('includes both taste profiles headed by the friend name', () => {
    expect(prompt).toContain('MY TASTE');
    expect(prompt).toContain('SARA — watched');
    expect(prompt).toContain('Title W');
    expect(prompt).toContain('Title X');
  });
});
