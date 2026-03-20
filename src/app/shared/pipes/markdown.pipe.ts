import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Converts a small, trusted subset of Markdown (as produced by the Gemini API)
 * into safe HTML for use with [innerHTML].
 *
 * Supported syntax:
 *  - Paragraphs (blank-line separated)
 *  - Unordered lists:  `* item` or `- item`
 *  - Ordered lists:    `1. item`
 *  - Bold:             `**text**`
 *
 * SECURITY: Input is HTML-escaped before any transformation, so injected
 * content cannot break out of the text context. bypassSecurityTrustHtml is
 * safe here because the markup is generated entirely by this pipe.
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string): SafeHtml {
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
        blocks.push(`<li>${this.inline(bulletMatch[1])}</li>`);
      } else if (numberedMatch) {
        if (!inList) {
          blocks.push('<ul>');
          inList = true;
        }
        blocks.push(`<li>${this.inline(numberedMatch[1])}</li>`);
      } else {
        if (inList) {
          blocks.push('</ul>');
          inList = false;
        }
        if (trimmed) blocks.push(`<p>${this.inline(trimmed)}</p>`);
      }
    }

    if (inList) blocks.push('</ul>');

    return this.sanitizer.bypassSecurityTrustHtml(blocks.join(''));
  }

  /** Apply inline-level transforms (bold only — Gemini rarely uses italics). */
  private inline(text: string): string {
    return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
}
