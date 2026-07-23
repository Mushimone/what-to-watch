import { Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

/**
 * Emits every time the host element scrolls into view. Put it on a sentinel at
 * the end of a list and load the next page from the handler — no scroll
 * listeners, no library.
 */
@Directive({
  selector: '[appInfiniteScroll]',
})
export class InfiniteScroll implements OnDestroy {
  /** Fires when the sentinel enters the viewport (plus the preload margin). */
  readonly reached = output<void>();

  private host = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  constructor() {
    // jsdom has no IntersectionObserver: under test the list just stays on its
    // first page instead of throwing.
    if (typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(
      ([entry]) => {
        // ponytail: the observer only re-fires once the sentinel has left and
        // re-entered, so a page shorter than the margin needs a nudge to scroll.
        // Real pages are taller than 400px; re-observing here would loop.
        if (entry.isIntersecting) this.reached.emit();
      },
      // Start fetching before the user actually hits the bottom.
      { rootMargin: '400px' },
    );
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
