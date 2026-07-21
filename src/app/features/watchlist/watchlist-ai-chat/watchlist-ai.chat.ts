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
import { OpenAiMessage } from '../../../core/models/openai.models';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { OpenAiService } from '../../../core/services/openai.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';
import { fmtItem, RECOMMEND_STYLE } from '../recommend.prompt';

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

  private openai = inject(OpenAiService);
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

  history: OpenAiMessage[] = [];
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

    const userTurn: OpenAiMessage = { role: 'user', content: text };
    this.history.push(userTurn);

    this.isLoading.set(true);
    this.openai.chat(this.history).subscribe({
      next: (modelReply) => {
        const reply = modelReply.trim()
          ? modelReply
          : "I couldn't put that into words — try rephrasing?";
        this.history.push({ role: 'assistant', content: reply });
        this.displayMessages.update((msgs) => [...msgs, { role: 'model', text: reply }]);
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
    const fmt = fmtItem;

    // Shared recommendation method — the "how to think" half of the prompt.
    const method = `
HOW TO RECOMMEND:
1. First infer my taste from the WATCHED list — recurring tones, themes, pacing, eras, directors, and what I rated highly (★). A 👍 means I loved that title and 👎 means I disliked it; weight my 👍/👎 more heavily than ★, and steer away from what a 👎 represents. Treat that as my profile.
2. Work out what I'm actually asking for: a mood/vibe, a time constraint, something similar to a title, help deciding, or just browsing options.
3. Match against BOTH my request and my taste profile, using your real knowledge of each title's plot, tone and atmosphere. Genre tags are rough; the year, director, ★rating and short synopsis are only there to help you identify the exact title and gauge what I like.
4. Be adaptive and decisive about the shape of your answer:
   - If I'm asking what to watch / for help picking / for a specific mood: lead with ONE confident top pick on its own line as "**Watch this: Title (Year)**" and a reason, then offer 2–3 shorter alternates.
   - If I'm clearly browsing or asking for options/a list: give a ranked shortlist of up to 4, best first.
5. Every reason must connect the pick to what I asked AND, whenever possible, to something specific I've watched (e.g. "you rated Sicario highly").
6. If my request is vague, make a sensible assumption and recommend — don't interrogate me with clarifying questions.
7. Never repeat a title you already suggested earlier in this conversation.`.trim();

    const style = RECOMMEND_STYLE;

    const listContext = `
You are the recommendation assistant for the "What to Watch" app. I want to choose something from my own watchlist.
Only recommend from the UNWATCHED list unless I explicitly ask for ideas beyond it. If nothing in UNWATCHED genuinely fits, say so honestly, offer the closest option, and you may add one outside idea clearly flagged as not on my list.
Don't mention the words "WATCHED"/"UNWATCHED" — they are just labels for you.

${method}

${style}

WATCHED — infer my taste from this:
${watched.map(fmt).join('\n') || 'None yet'}

UNWATCHED — recommend from here:
${unwatched.map(fmt).join('\n') || 'Nothing here yet'}
    `.trim();

    const addContext = `
You are the discovery assistant for the "What to Watch" app. I want NEW titles to add — things I haven't seen and don't already have listed.
Only suggest real, well-known, findable titles; never invent one, and never suggest anything already in my list.

${method}

${style}

WATCHED — infer my taste from this:
${watched.map(fmt).join('\n') || 'None yet'}

ALREADY IN MY LIST — never suggest these:
${[...watched, ...unwatched].map(fmt).join('\n') || 'Nothing added yet'}
    `.trim();

    this.history = [
      { role: 'system', content: this.mode === 'list' ? listContext : addContext },
    ];
  }
}
