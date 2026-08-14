import { describe, it, expect } from 'vitest';
import {
  classifyUrl,
  detectSource,
  entriesFromItemNames,
  mapPool,
  normalise,
  parseCsv,
  pickMatch,
  toEntries,
  toRow,
  ImportEntry,
} from './list-import';
import { SearchResult } from '../../../core/models/watchlist-item.model';

function film(title: string, year: string, id = title): SearchResult {
  return {
    title,
    type: 'movie',
    genres: [],
    duration_minutes: null,
    episode_count: null,
    poster_url: null,
    external_id: id,
    external_source: 'tmdb',
    release_date: `${year}-01-01`,
  };
}

const entry = (name: string, year: number | null = null): ImportEntry => ({
  name,
  year,
  imdbId: null,
});

describe('parseCsv', () => {
  it('keys rows by lowercased headers', () => {
    const rows = parseCsv('Const,Title,Year\ntt0111161,The Shawshank Redemption,1994');
    expect(rows).toEqual([
      { const: 'tt0111161', title: 'The Shawshank Redemption', year: '1994' },
    ]);
  });

  it('keeps commas and escaped quotes inside quoted fields', () => {
    const rows = parseCsv('Name,Year\n"Cloud Atlas, Part ""One""",2012');
    expect(rows[0]['name']).toBe('Cloud Atlas, Part "One"');
  });

  it('handles a newline inside a quoted field', () => {
    const rows = parseCsv('Name,Note\n"Persona","line one\nline two"');
    expect(rows).toHaveLength(1);
    expect(rows[0]['note']).toBe('line one\nline two');
  });

  it('survives CRLF, a BOM and a trailing blank line', () => {
    const rows = parseCsv('﻿Name,Year\r\nPersona,1966\r\n');
    expect(rows).toEqual([{ name: 'Persona', year: '1966' }]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('detectSource', () => {
  it('names IMDb by its Const column', () => {
    expect(detectSource(parseCsv('Const,Title,Year\ntt1,A,2000'))).toBe('imdb');
  });

  it('names Letterboxd by Name + URI', () => {
    const rows = parseCsv('Position,Name,Year,Letterboxd URI\n1,Persona,1966,https://x');
    expect(detectSource(rows)).toBe('letterboxd');
  });

  it('falls back to generic for a bare title column', () => {
    expect(detectSource(parseCsv('Title\nPersona'))).toBe('generic');
  });

  it('rejects a file with no title-ish column', () => {
    expect(detectSource(parseCsv('Date,Rating\n2026-01-01,5'))).toBeNull();
  });
});

describe('toEntries', () => {
  it('reads title, year and const off an IMDb export', () => {
    const rows = parseCsv('Const,Title,Year\ntt0111161,The Shawshank Redemption,1994');
    expect(toEntries(rows)).toEqual([
      { name: 'The Shawshank Redemption', year: 1994, imdbId: 'tt0111161' },
    ]);
  });

  it('reads a Letterboxd export, leaving imdbId null', () => {
    const rows = parseCsv('Position,Name,Year,Letterboxd URI\n1,Persona,1966,https://x');
    expect(toEntries(rows)).toEqual([{ name: 'Persona', year: 1966, imdbId: null }]);
  });

  it('drops rows with no title and ignores an unusable year', () => {
    const rows = parseCsv('Name,Year\n,1966\nPersona,n/a');
    expect(toEntries(rows)).toEqual([{ name: 'Persona', year: null, imdbId: null }]);
  });

  it('keeps the first of a repeated film', () => {
    const rows = parseCsv('Name,Year\nPersona,1966\nPersona,1966\nSolaris,1972');
    expect(toEntries(rows).map((e) => e.name)).toEqual(['Persona', 'Solaris']);
  });

  it('treats the same title in different years as two films', () => {
    const rows = parseCsv('Name,Year\nSolaris,1972\nSolaris,2002');
    expect(toEntries(rows)).toHaveLength(2);
  });
});

describe('classifyUrl', () => {
  it('recognises Letterboxd, including the short domain', () => {
    expect(classifyUrl('https://letterboxd.com/crew/list/edgar-wrights-favorites/')).toBe(
      'letterboxd',
    );
    expect(classifyUrl('https://www.letterboxd.com/dave/watchlist/')).toBe('letterboxd');
    expect(classifyUrl('https://boxd.it/abc')).toBe('letterboxd');
  });

  it('recognises IMDb so the sheet can explain instead of failing', () => {
    expect(classifyUrl('https://www.imdb.com/list/ls055592025/')).toBe('imdb');
    expect(classifyUrl('https://m.imdb.com/chart/top/')).toBe('imdb');
  });

  it('rejects anything else, including a bare word', () => {
    expect(classifyUrl('https://example.com/list')).toBe('unknown');
    expect(classifyUrl('letterboxd')).toBe('unknown');
    expect(classifyUrl('')).toBe('unknown');
  });
});

describe('entriesFromItemNames', () => {
  it('splits the trailing year off Letterboxd’s item names', () => {
    expect(entriesFromItemNames(['The Cabinet of Dr. Caligari (1920)'])).toEqual([
      { name: 'The Cabinet of Dr. Caligari', year: 1920, imdbId: null },
    ]);
  });

  it('keeps a title that ends in its own parenthesis', () => {
    expect(entriesFromItemNames(['Am I Being Selfish? (2018)'])[0].name).toBe(
      'Am I Being Selfish?',
    );
    expect(entriesFromItemNames(['Fahrenheit 9/11 (2004)'])[0]).toEqual({
      name: 'Fahrenheit 9/11',
      year: 2004,
      imdbId: null,
    });
  });

  it('keeps a title with no year rather than dropping it', () => {
    expect(entriesFromItemNames(['Untitled Documentary'])).toEqual([
      { name: 'Untitled Documentary', year: null, imdbId: null },
    ]);
  });

  it('drops blanks and repeats, the same as a CSV', () => {
    const entries = entriesFromItemNames(['Nosferatu (1922)', '', 'Nosferatu (1922)', '  ']);
    expect(entries).toHaveLength(1);
  });
});

describe('normalise', () => {
  it('folds accents and punctuation so the databases agree', () => {
    expect(normalise('Amélie')).toBe(normalise('Amelie'));
    expect(normalise('WALL·E')).toBe(normalise('WALL-E'));
    expect(normalise('  Spirited   Away ')).toBe('spirited away');
  });
});

describe('pickMatch', () => {
  it('takes an exact title match', () => {
    const match = pickMatch(entry('Persona'), [film('Persona', '1966'), film('Persona 3', '2023')]);
    expect(match.status).toBe('matched');
    expect(match.result?.title).toBe('Persona');
  });

  it('breaks a remake tie on the year', () => {
    const match = pickMatch(entry('Solaris', 1972), [
      film('Solaris', '2002', 'new'),
      film('Solaris', '1972', 'old'),
    ]);
    expect(match.result?.external_id).toBe('old');
  });

  it('asks rather than guesses between two same-title films with no year', () => {
    const match = pickMatch(entry('Solaris'), [film('Solaris', '2002'), film('Solaris', '1972')]);
    expect(match.status).toBe('ambiguous');
    expect(match.candidates).toHaveLength(2);
  });

  // Real case: TMDB carries nine films called "Arrival", two of them from 2016.
  // A row offering the user two identical "Arrival (2016)" lines is not a
  // question anyone can answer — TMDB's ranking is the better judge.
  it('takes TMDB’s ranking between films sharing a title and a year', () => {
    const match = pickMatch(entry('Arrival', 2016), [
      film('Arrival', '2016', 'popular'),
      film('Arrival', '1986', 'old'),
      film('Arrival', '2016', 'obscure'),
    ]);
    expect(match.status).toBe('matched');
    expect(match.result?.external_id).toBe('popular');
  });

  // Real case: Letterboxd files Demolition under its 2015 festival premiere,
  // TMDB under its 2016 release.
  it('absorbs a one-year premiere/release drift', () => {
    const match = pickMatch(entry('Demolition', 2015), [
      film('Demolition', '2016', 'right'),
      film('Demolition', '2008', 'wrong'),
    ]);
    expect(match.status).toBe('matched');
    expect(match.result?.external_id).toBe('right');
  });

  // Real case: TMDB carries "The School of Rock" and "Monty Python's The
  // Meaning of Life"; the exports carry the short titles.
  it('reconciles an article or franchise prefix when the year agrees', () => {
    const match = pickMatch(entry('School of Rock', 2003), [
      film('School of Rock', '2016'),
      film('The School of Rock', '2003', 'right'),
      film('School of Rock', '2007'),
    ]);
    expect(match.status).toBe('matched');
    expect(match.result?.external_id).toBe('right');
  });

  // The same rule, ungated, silently matched "Escape" (2012) to "Escape Fire"
  // on the real export. One-word titles land inside unrelated films constantly.
  it('refuses to match a one-word title inside a longer one', () => {
    const match = pickMatch(entry('Escape', 2012), [
      film('Escape Fire', '2012'), // the trap: right year, wrong film
      film('Escape', '1980'),
      film('Escape', '2024'),
    ]);
    expect(match.status).toBe('ambiguous');
  });

  it('still asks when no candidate year is close to the export’s', () => {
    const match = pickMatch(entry('Escape', 2012), [
      film('Escape', '2024'),
      film('Escape', '1980'),
    ]);
    expect(match.status).toBe('ambiguous');
  });

  it('takes a lone near-miss on trust', () => {
    const match = pickMatch(entry('The Seventh Seal'), [film('Seventh Seal', '1957')]);
    expect(match.status).toBe('matched');
  });

  it('asks when several near-misses disagree', () => {
    const match = pickMatch(entry('Seal'), [
      film('The Seventh Seal', '1957'),
      film('Sealed Room', '1909'),
      film('Seal Team', '2021'),
      film('Navy Seals', '1990'),
    ]);
    expect(match.status).toBe('ambiguous');
    expect(match.candidates).toHaveLength(3); // capped — the sheet shows three
  });

  it('reports nothing found on an empty response', () => {
    expect(pickMatch(entry('Nonesuch'), []).status).toBe('not-found');
  });
});

describe('toRow — the "do I already have this" check', () => {
  const saved = new Set(['tmdb:Persona']);

  it('marks a title already on the watchlist as a duplicate, unselected', () => {
    const match = pickMatch(entry('Persona'), [film('Persona', '1966')]);
    const row = toRow(entry('Persona'), match, saved);
    expect(row.status).toBe('duplicate');
    expect(row.selected).toBe(false);
    expect(row.result).not.toBeNull(); // shown, not hidden
  });

  it('selects a new title', () => {
    const match = pickMatch(entry('Solaris'), [film('Solaris', '1972')]);
    const row = toRow(entry('Solaris'), match, saved);
    expect(row.status).toBe('matched');
    expect(row.selected).toBe(true);
  });

  it('never selects a row the user still has to answer', () => {
    for (const match of [
      pickMatch(entry('Nonesuch'), []),
      pickMatch(entry('Solaris'), [film('Solaris', '2002'), film('Solaris', '1972')]),
    ]) {
      expect(toRow(entry('x'), match, saved).selected).toBe(false);
    }
  });

  it('catches the duplicate only after an ambiguous row is resolved', () => {
    const ambiguousMatch = pickMatch(entry('Persona'), [
      film('Persona', '1966'),
      film('Persona', '2019'),
    ]);
    expect(toRow(entry('Persona'), ambiguousMatch, saved).status).toBe('ambiguous');

    const chosen = { status: 'matched' as const, result: film('Persona', '1966'), candidates: [] };
    expect(toRow(entry('Persona'), chosen, saved).status).toBe('duplicate');
  });
});

describe('mapPool', () => {
  it('keeps results in input order and never exceeds the limit', async () => {
    let running = 0;
    let peak = 0;
    const progress: number[] = [];
    const items = Array.from({ length: 20 }, (_, i) => i);

    const out = await mapPool(
      items,
      6,
      async (n) => {
        peak = Math.max(peak, ++running);
        await new Promise((r) => setTimeout(r, n % 3));
        running--;
        return n * 2;
      },
      (done) => progress.push(done),
    );

    expect(out).toEqual(items.map((n) => n * 2));
    expect(peak).toBeLessThanOrEqual(6);
    expect(progress.at(-1)).toBe(20);
  });

  it('does nothing for an empty list', async () => {
    expect(await mapPool([], 6, async () => 1, () => {})).toEqual([]);
  });
});
