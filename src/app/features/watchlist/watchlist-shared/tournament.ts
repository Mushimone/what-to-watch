import { WatchlistItem } from '../../../core/models/watchlist-item.model';

export interface Matchup {
  a: WatchlistItem;
  b: WatchlistItem;
}

export interface TournamentState {
  /** Contenders still to play in the current round. */
  queue: WatchlistItem[];
  /** Winners collected for the next round. */
  nextRound: WatchlistItem[];
  /** The pair currently being voted on, or null when finished. */
  current: Matchup | null;
  /** Set when exactly one contender remains. */
  winner: WatchlistItem | null;
}

/** Fisher–Yates shuffle using an injectable RNG (defaults to Math.random). */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a tournament from a pool. `rng` seeds the shuffle; `shuffleFn` is an
 * optional override used by tests to disable shuffling entirely.
 */
export function createTournament(
  items: WatchlistItem[],
  rng: () => number = Math.random,
  shuffleFn: (a: WatchlistItem[]) => WatchlistItem[] = (a) => shuffle(a, rng),
): TournamentState {
  return advance({ queue: shuffleFn(items), nextRound: [], current: null, winner: null });
}

/** Pull the next matchup, resolving byes and round transitions. */
function advance(state: TournamentState): TournamentState {
  let queue = [...state.queue];
  let nextRound = [...state.nextRound];

  while (true) {
    if (queue.length >= 2) {
      const a = queue.shift()!;
      const b = queue.shift()!;
      return { queue, nextRound, current: { a, b }, winner: null };
    }
    if (queue.length === 1) {
      nextRound.push(queue.shift()!); // bye: lone contender advances
    }
    if (nextRound.length === 1) {
      return { queue: [], nextRound: [], current: null, winner: nextRound[0] };
    }
    if (nextRound.length === 0) {
      return { queue: [], nextRound: [], current: null, winner: null };
    }
    queue = nextRound; // start the next round
    nextRound = [];
  }
}

/** Record the winner of the current matchup and produce the next state. */
export function choose(state: TournamentState, side: 'a' | 'b'): TournamentState {
  if (!state.current) return state;
  const winner = side === 'a' ? state.current.a : state.current.b;
  return advance({
    queue: state.queue,
    nextRound: [...state.nextRound, winner],
    current: null,
    winner: null,
  });
}
