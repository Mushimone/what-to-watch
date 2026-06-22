import { describe, it, expect } from 'vitest';
import { createTournament, choose, TournamentState } from './tournament';
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

// Deterministic identity shuffle so tests are stable.
const noShuffle = <T>(a: T[]) => a;

// Always pick the left side until a winner emerges; count the matchups.
function playToEnd(state: TournamentState): { winner: WatchlistItem; matchups: number } {
  let matchups = 0;
  while (state.current) {
    matchups++;
    state = choose(state, 'a');
  }
  return { winner: state.winner!, matchups };
}

describe('tournament', () => {
  it('starts with a matchup of the first two and no winner', () => {
    const s = createTournament([mk('A'), mk('B')], () => 0, noShuffle);
    expect(s.current).toEqual({ a: expect.objectContaining({ external_id: 'A' }), b: expect.objectContaining({ external_id: 'B' }) });
    expect(s.winner).toBeNull();
  });

  it('crowns the chosen title in a 2-item bracket', () => {
    let s = createTournament([mk('A'), mk('B')], () => 0, noShuffle);
    s = choose(s, 'a');
    expect(s.current).toBeNull();
    expect(s.winner?.external_id).toBe('A');
  });

  it('runs N-1 matchups for N titles (power of two)', () => {
    const s = createTournament([mk('A'), mk('B'), mk('C'), mk('D')], () => 0, noShuffle);
    expect(playToEnd(s).matchups).toBe(3);
  });

  it('handles odd counts with byes and still ends with one winner', () => {
    const s = createTournament([mk('A'), mk('B'), mk('C')], () => 0, noShuffle);
    const result = playToEnd(s);
    expect(result.matchups).toBe(2);
    expect(result.winner).toBeTruthy();
  });

  it('reports totalRounds as ceil(log2(n))', () => {
    const four = createTournament([mk('A'), mk('B'), mk('C'), mk('D')], () => 0, noShuffle);
    expect(four.totalRounds).toBe(2);
    expect(four.round).toBe(1);

    const items = Array.from({ length: 12 }, (_, i) => mk(`I${i}`));
    expect(createTournament(items, () => 0, noShuffle).totalRounds).toBe(4);
  });

  it('advances the round counter as the bracket progresses', () => {
    let s = createTournament([mk('A'), mk('B'), mk('C'), mk('D')], () => 0, noShuffle);
    expect(s.round).toBe(1); // A vs B
    s = choose(s, 'a');
    expect(s.round).toBe(1); // C vs D
    s = choose(s, 'a');
    expect(s.round).toBe(2); // final
    s = choose(s, 'a');
    expect(s.winner).toBeTruthy();
    expect(s.round).toBe(2);
  });
});
