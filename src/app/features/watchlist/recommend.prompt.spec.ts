import { describe, it, expect } from 'vitest';
import {
  buildAddPrompt,
  buildGroupPickPrompt,
  buildListPrompt,
  PROMPT_CAP,
  tasteProfile,
  topForPrompt,
} from './recommend.prompt';
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

describe('taste without reactions', () => {
  const watched = [
    mk('1', { watched: true, genres: ['Drama', 'Crime'], director: 'Mann' }),
    mk('2', { watched: true, genres: ['Drama'], director: 'Mann' }),
    mk('3', { watched: true, genres: ['Drama', 'Thriller'], type: 'series' }),
  ];

  it('profiles the whole watched list even though nobody pressed 👍/👎', () => {
    const profile = tasteProfile(watched);
    expect(profile).toContain('all 3 watched');
    expect(profile).toContain('Drama 3');
    expect(profile).toContain('Mann (2)');
    expect(profile).toContain('2 films, 1 series/anime');
    expect(profile).toContain('No 👍/👎 given');
  });

  it('says a missing reaction is not a dislike when some are given', () => {
    const profile = tasteProfile([...watched, mk('4', { watched: true, reaction: 'liked' })]);
    expect(profile).toContain('1 👍, 0 👎');
    expect(profile).toContain('not a dislike');
  });

  it('ranks candidates by genre fit when there is nothing to react to', () => {
    const fit = mk('fit', { genres: ['Drama'], vote_average: 5 });
    const off = mk('off', { genres: ['Horror'], vote_average: 9 });
    expect(topForPrompt([off, fit], 1, watched)[0].title).toBe('Title fit');
  });

  it('keeps the most recently added watched titles when trimming', () => {
    const old = mk('old', { watched: true, added_at: '2020-01-01' });
    const recent = mk('recent', { watched: true, added_at: '2026-06-01' });
    expect(topForPrompt([old, recent], 1)[0].title).toBe('Title recent');
  });

  it('shows a show that was started but not finished', () => {
    const started = mk('S', { type: 'series', season_count: 5, watched_seasons: [1, 2] });
    expect(buildListPrompt([started])).toContain('[started: 2/5 seasons]');
  });
});
