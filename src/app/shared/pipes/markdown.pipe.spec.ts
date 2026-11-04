import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MarkdownPipe, ownedKey } from './markdown.pipe';

describe('MarkdownPipe title links', () => {
  const pipe = TestBed.runInInjectionContext(() => new MarkdownPipe());
  const html = (text: string, owned?: Set<string>) =>
    String((pipe.transform(text, owned) as { changingThisBreaksApplicationSecurity: string })
      .changingThisBreaksApplicationSecurity);

  it('turns **Title (Year)** into a button, in bullets too', () => {
    expect(html('- **Heat (1995)** — cops and robbers')).toContain(
      '<button type="button" class="title-link" data-title="Heat" data-year="1995">Heat (1995)</button>',
    );
  });

  it('keeps "Watch this:" as text and links only the title', () => {
    expect(html('**Watch this: Heat (1995)**')).toContain(
      '<strong>Watch this: <button type="button" class="title-link" data-title="Heat"',
    );
    expect(html('Watch this: **Heat (1995)**')).toContain('Watch this: <strong><button');
  });

  it('leaves bold without a year as plain bold', () => {
    expect(html('**Heat**')).toBe('<p><strong>Heat</strong></p>');
  });

  it('cannot be broken out of through the title', () => {
    const out = html('**"><img src=x onerror=1> (2000)**');
    expect(out).not.toContain('<img');
    expect(out).toContain('data-title="&quot;&gt;&lt;img');
  });

  it('marks titles already on the list, punctuation and accents aside', () => {
    const owned = new Set([ownedKey('Tom & Jerry', 2021), ownedKey('Amélie', 2001)]);
    expect(html('**Tom & Jerry (2021)**', owned)).toContain('title-link title-link--owned');
    expect(html('**Amelie (2001)**', owned)).toContain('title-link--owned');
    expect(html('**Heat (1995)**', owned)).not.toContain('--owned');
  });
});
