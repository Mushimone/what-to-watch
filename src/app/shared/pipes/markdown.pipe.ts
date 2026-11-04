import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { normalise } from '../normalise';

/** Key a title is looked up by in the `owned` set the pipe takes. */
export const ownedKey = (title: string, year: string | number): string => `${normalise(title)}|${year}`;

/**
 * Converts a small, trusted subset of Markdown (as produced by the AI model)
 * into safe HTML for use with [innerHTML].
 *
 * Supported syntax:
 *  - Paragraphs (blank-line separated)
 *  - Unordered lists:  `* item` or `- item`
 *  - Ordered lists:    `1. item`
 *  - Bold:             `**text**`
 *  - Bold `**Title (Year)**` becomes a `button.title-link` (a `titleLinks`
 *    container opens it); `owned` marks the ones already on the user's list.
 *
 * SECURITY: Input is HTML-escaped before any transformation, so injected
 * content cannot break out of the text context. bypassSecurityTrustHtml is
 * safe here because the markup is generated entirely by this pipe.
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string, owned?: ReadonlySet<string>): SafeHtml {
    if (!value) return '';

    // 1. Escape HTML to neutralise any injection in the source text.
    const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 2. Process line-by-line and build block-level HTML.
    const blocks: string[] = [];
    let inList = false;

    for (const line of escaped.split('\n')) {
      const trimmed = line.trim();
      const bulletMatch = trimmed.match(/^[-*] (.+)/);
      const numberedMatch = trimmed.match(/^\d+\. (.+)/);

      if (bulletMatch) {
        if (!inList) {
          blocks.push('<ul>');
          inList = true;
        }
        blocks.push(`<li>${this.inline(bulletMatch[1], owned)}</li>`);
      } else if (numberedMatch) {
        if (!inList) {
          blocks.push('<ul>');
          inList = true;
        }
        blocks.push(`<li>${this.inline(numberedMatch[1], owned)}</li>`);
      } else {
        if (inList) {
          blocks.push('</ul>');
          inList = false;
        }
        if (trimmed) blocks.push(`<p>${this.inline(trimmed, owned)}</p>`);
      }
    }

    if (inList) blocks.push('</ul>');

    return this.sanitizer.bypassSecurityTrustHtml(blocks.join(''));
  }

  /** Apply inline-level transforms (bold only — the model rarely uses italics). */
  private inline(text: string, owned?: ReadonlySet<string>): string {
    return text.replace(/\*\*(.+?)\*\*/g, (_, inner: string) => {
      // "Watch this:" is tolerated inside the bold for replies that still put it there.
      const m = inner.match(/^(Watch this:\s*)?(.+?)\s*\((\d{4})\)$/i);
      if (!m) return `<strong>${inner}</strong>`;
      const [, prefix = '', title, year] = m;
      // `title` is already HTML-escaped; undo that for the lookup key only.
      const plain = title.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const mine = owned?.has(ownedKey(plain, year)) ? ' title-link--owned' : '';
      const attr = title.replace(/"/g, '&quot;');
      return (
        `<strong>${prefix}<button type="button" class="title-link${mine}" ` +
        `data-title="${attr}" data-year="${year}">${title} (${year})</button></strong>`
      );
    });
  }
}
