import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { take } from 'rxjs';
import { OpenAiService } from '../../../core/services/openai.service';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';

export interface GroupPickData {
  /** Prebuilt system prompt from buildGroupPickPrompt. */
  system: string;
}

@Component({
  selector: 'app-watchlist-group-pick-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MarkdownPipe,
  ],
  templateUrl: './watchlist-group-pick-dialog.html',
  styleUrl: './watchlist-group-pick-dialog.scss',
})
export class WatchlistGroupPickDialog {
  private openai = inject(OpenAiService);
  private data = inject<GroupPickData>(MAT_DIALOG_DATA);

  loading = signal(true);
  error = signal(false);
  result = signal('');

  constructor() {
    this.run();
  }

  run(): void {
    this.loading.set(true);
    this.error.set(false);
    this.openai
      .chat(
        [
          { role: 'system', content: this.data.system },
          { role: 'user', content: 'Pick one for us to watch together tonight.' },
        ],
        { reasoningEffort: 'medium' },
      )
      .pipe(take(1))
      .subscribe({
        next: (reply) => {
          this.result.set(reply.trim() || 'No suggestion came back — try again.');
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
