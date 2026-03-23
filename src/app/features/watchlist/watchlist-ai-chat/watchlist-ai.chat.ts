import {
  Component,
  ElementRef,
  inject,
  Input,
  OnChanges,
  SimpleChanges,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { take } from 'rxjs';
import { GeminiContent } from '../../../core/models/gemini.models';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { GeminiService } from '../../../core/services/gemini.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';

export type ChatMode = 'list' | 'add';

@Component({
  selector: 'app-watchlist-ai-chat',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MarkdownPipe,
  ],
  templateUrl: './watchlist-ai-chat.html',
  styleUrls: ['./watchlist-ai-chat.scss'],
})
export class WatchlistAiChatComponent implements OnChanges {
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  private gemini = inject(GeminiService);
  private watchlist = inject(WatchlistService);

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 0);
  }

  /** Passed by the parent — changes whenever the user switches tabs */
  @Input() mode: ChatMode = 'list';

  private _isOpen = false;
  get isOpen() {
    return this._isOpen;
  }

  /**
   * Rebuild context every time the panel opens — avoids the empty-on-init
   * race condition and keeps suggestions fresh after adding new titles.
   */
  set isOpen(value: boolean) {
    this._isOpen = value;
    if (value) {
      this.watchlist.watchlistItems$.pipe(take(1)).subscribe((items) => {
        this.buildContext(items);
      });
    }
  }

  isLoading = signal(false);
  inputText = '';

  history: GeminiContent[] = [];
  displayMessages = signal<{ role: 'user' | 'model'; text: string }[]>([]);

  /**
   * ngOnChanges fires whenever an @Input changes after the first render.
   * We use it to rebuild context (and reset chat) when the user switches tabs.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && !changes['mode'].firstChange) {
      this.watchlist.watchlistItems$.pipe(take(1)).subscribe((items) => {
        this.buildContext(items);
        this.displayMessages.set([]); // fresh conversation for the new mode
      });
    }
  }

  onSend(): void {
    const text = this.inputText.trim();
    if (!text || this.isLoading()) return;

    this.inputText = '';
    this.displayMessages.update((msgs) => [...msgs, { role: 'user', text }]);
    this.scrollToBottom();

    const userTurn: GeminiContent = { role: 'user', parts: [{ text }] };
    this.history.push(userTurn);

    this.isLoading.set(true);
    this.gemini.chat(this.history).subscribe({
      next: (modelReply) => {
        this.history.push({ role: 'model', parts: [{ text: modelReply }] });
        this.displayMessages.update((msgs) => [...msgs, { role: 'model', text: modelReply }]);
        this.isLoading.set(false);
        this.scrollToBottom();
      },
      error: () => {
        this.displayMessages.update((msgs) => [
          ...msgs,
          {
            role: 'model',
            text: 'Something went wrong. Please try again.',
          },
        ]);
        this.isLoading.set(false);
        this.scrollToBottom();
      },
    });
  }

  buildContext(items: WatchlistItem[]): void {
    const watched = items.filter((i) => i.watched);
    const unwatched = items.filter((i) => !i.watched);
    const fmt = (i: WatchlistItem) => `- ${i.title} (${i.type}, ${i.genres.join(', ')})`;

    const sharedRules = `
IMPORTANT RULES:
- Suggest titles based on the WATCHED and UNWATCHED lists below, before suggesting outside of those, find something that matches from the UNWATCHED list if possible or explicitly say if the vibe I'm asking for isn't represented in that list.
- Use your full knowledge of each title — its plot, tone, pacing, atmosphere and themes — NOT just the genre tags.
- Genre tags are approximate labels from a database; a title tagged "Action" may be full of suspense, a "Drama" may be very funny.
- When the user describes a mood, feeling or vibe (e.g. "something suspenseful", "light and funny", "mind-bending"), reason about which titles on the list match that feeling based on what you know about them.
- Never say a mood isn't represented just because the genre label doesn't contain that word.
- Keep replies short, friendly and direct. Format suggestions as bullet points with a one-sentence reason.
- Never suggest any actions like adding directly a movie to the watchlist — the user has to do that manually. Always phrase suggestions as recommendations, not instructions.
- Respond in the language the user is using, and mirror their style. If they write in a casual style, respond in kind — if they use slang or emojis, you can too. If they write formally, match that tone instead.
    `.trim();

    const listContext = `
You are a helpful watchlist assistant for the "What to Watch" app.
Only suggest titles from the UNWATCHED list unless the user explicitly asks otherwise. Don't mention the WATCHED and UNWATCHED labels — those are just for your understanding. Just use the lists to find suggestions that match the vibe the user is asking for, and suggest from there.

${sharedRules}

WATCHED (infer my preferences and taste from this):
${watched.map(fmt).join('\n') || 'None yet'}

UNWATCHED (suggest from here):
${unwatched.map(fmt).join('\n') || 'Nothing in the list yet'}
    `.trim();

    const addContext = `
You are a helpful media discovery assistant for the "What to Watch" app.
The user wants suggestions for NEW titles to add to their watchlist — things they haven't seen and don't already have listed.

${sharedRules}

WATCHED (use to understand my taste):
${watched.map(fmt).join('\n') || 'None yet'}

ALREADY IN MY LIST (do not suggest these):
${[...watched, ...unwatched].map(fmt).join('\n') || 'Nothing added yet'}
    `.trim();

    this.history = [
      { role: 'user', parts: [{ text: this.mode === 'list' ? listContext : addContext }] },
    ];
  }
}
