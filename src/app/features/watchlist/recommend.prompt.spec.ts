import { describe, it, expect } from 'vitest';
import { buildAddPrompt, buildGroupPickPrompt, buildListPrompt, PROMPT_CAP } from './recommend.prompt';
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

describe('prompt size', () => {
  const big = Array.from({ length: 1000 }, (_, n) =>
    mk(String(n), { watched: n % 2 === 0, vote_average: n % 10, release_date: '2020-01-01' }),
  );

  it('caps the watched and unwatched dumps and says what was left out', () => {
    const prompt = buildListPrompt(big);
    expect(prompt).toContain(`(…and ${500 - PROMPT_CAP.watched} more not shown)`);
    expect(prompt).toContain(`(…and ${500 - PROMPT_CAP.candidates} more not shown)`);
  });

  it('keeps 👍 titles when trimming', () => {
    const liked = mk('LIKED', { watched: true, reaction: 'liked', vote_average: 1 });
    expect(buildListPrompt([...big, liked])).toContain('Title LIKED');
  });

  it('still excludes every listed title in add mode, compactly', () => {
    const prompt = buildAddPrompt(big);
    expect(prompt).toContain('Title 999 (2020)');
    expect(prompt).not.toContain('Title 999 (movie');
  });
});
