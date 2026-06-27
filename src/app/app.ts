import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter, interval } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('what-to-watch');

  constructor() {
    const sw = inject(SwUpdate);
    if (sw.isEnabled) {
      // Reload as soon as a freshly deployed build finishes downloading.
      sw.versionUpdates
        .pipe(filter((e) => e.type === 'VERSION_READY'))
        .subscribe(() => document.location.reload());
      // Poll for new builds every 60s so open tabs/PWA pick them up without a manual reload.
      interval(60_000).subscribe(() => sw.checkForUpdate());
    }
  }
}
