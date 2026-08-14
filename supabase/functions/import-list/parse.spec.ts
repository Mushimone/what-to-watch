import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  decodeEntities,
  isShortLink,
  itemsOn,
  lastPage,
  listName,
  listUrl,
  pageUrl,
} from './parse';

// Verbatim markup from a real list page — the scraping here breaks when
// Letterboxd reshuffles its HTML, and this fixture is what will say so.
const page = readFileSync(
  fileURLToPath(new URL('./__fixtures__/letterboxd-list.html', import.meta.url)),
  'utf8',
);

describe('listUrl', () => {
  it('accepts a list and a watchlist, normalising the address', () => {
    expect(listUrl('https://letterboxd.com/crew/list/edgar-wrights-1000-favorite-movies/')?.href)
      .toBe('https://letterboxd.com/crew/list/edgar-wrights-1000-favorite-movies/');
    expect(listUrl('https://www.letterboxd.com/dave/watchlist')?.href).toBe(
      'https://letterboxd.com/dave/watchlist/',
    );
  });

  // What a user copies is whatever view they were on — the address bar keeps
  // the sort and the page number.
  it('normalises a view mode, a sort or a page back to the list itself', () => {
    const canonical = 'https://letterboxd.com/strawhatellie/list/movies-with-ai/';
    for (const tail of ['detail/', 'by/rating/', 'page/3/', 'detail/by/release-earliest/']) {
      expect(listUrl(`https://letterboxd.com/strawhatellie/list/movies-with-ai/${tail}`)?.href).toBe(
        canonical,
      );
    }
    expect(listUrl('https://letterboxd.com/dave/watchlist/page/7/')?.href).toBe(
      'https://letterboxd.com/dave/watchlist/',
    );
  });

  // This is the only thing standing between the function and being an open
  // proxy for anyone with a Supabase JWT.
  it('refuses any other host, scheme or path', () => {
    for (const bad of [
      'https://example.com/crew/list/x/',
      'https://letterboxd.com.evil.test/a/list/b/',
      'http://letterboxd.com/crew/list/x/',
      'file:///etc/passwd',
      'https://169.254.169.254/latest/meta-data/',
      'https://letterboxd.com/crew/films/',
      'https://letterboxd.com/',
      'https://letterboxd.com/crew/listless/',
      'https://boxd.it/h19BQ', // resolved by the handler first, never here
      'not a url',
      '',
    ]) {
      expect(listUrl(bad), bad).toBeNull();
    }
  });
});

describe('isShortLink', () => {
  // Letterboxd's Share button copies these, so they're the likeliest paste.
  it('spots a boxd.it link', () => {
    expect(isShortLink('https://boxd.it/h19BQ')).toBe(true);
    expect(isShortLink(' https://www.boxd.it/70w ')).toBe(true);
  });

  it('is not fooled by a lookalike host or plain http', () => {
    expect(isShortLink('https://boxd.it.evil.test/x')).toBe(false);
    expect(isShortLink('http://boxd.it/x')).toBe(false);
    expect(isShortLink('https://letterboxd.com/dave/watchlist/')).toBe(false);
    expect(isShortLink('nonsense')).toBe(false);
  });
});

describe('pageUrl', () => {
  it('leaves page 1 alone and appends /page/N/ after it', () => {
    const url = listUrl('https://letterboxd.com/crew/list/favs/')!;
    expect(pageUrl(url, 1).href).toBe('https://letterboxd.com/crew/list/favs/');
    expect(pageUrl(url, 4).href).toBe('https://letterboxd.com/crew/list/favs/page/4/');
  });
});

describe('reading a real page', () => {
  it('pulls the titles in list order', () => {
    expect(itemsOn(page)).toEqual([
      'The Cabinet of Dr. Caligari (1920)',
      'Nosferatu (1922)',
      'Safety Last! (1923)',
    ]);
  });

  it('reads the list name off the og:title', () => {
    expect(listName(page)).toBe('Edgar Wright’s 1,000 Favorite Movies');
  });

  it('finds the last page in the paginator', () => {
    expect(lastPage(page)).toBe(10);
  });

  it('treats a page with no paginator as the only page', () => {
    expect(lastPage('<html><body>nothing here</body></html>')).toBe(1);
  });

  it('caps a very long list rather than walking it forever', () => {
    expect(lastPage('<a href="/x/list/y/page/900/">900</a>')).toBe(30);
  });

  it('returns nothing for a page it cannot read', () => {
    expect(itemsOn('<html><body>Sorry, this list is private.</body></html>')).toEqual([]);
  });
});

describe('decodeEntities', () => {
  it('unescapes what Letterboxd puts in an attribute', () => {
    expect(decodeEntities('Fire &amp; Ice (1983)')).toBe('Fire & Ice (1983)');
    expect(decodeEntities('&#039;71 (2014)')).toBe("'71 (2014)");
    expect(decodeEntities('Am I &quot;Selfish&quot;?')).toBe('Am I "Selfish"?');
    expect(decodeEntities('Caf&#233; Society')).toBe('Café Society');
  });

  // &amp; is unescaped last, so an escaped ampersand can't turn the text after
  // it into a live entity.
  it('does not let an escaped ampersand create a second entity', () => {
    expect(decodeEntities('&amp;quot;')).toBe('&quot;');
  });
});
