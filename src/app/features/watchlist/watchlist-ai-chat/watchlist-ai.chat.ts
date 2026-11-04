import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { take } from 'rxjs';
import { OpenAiMessage } from '../../../core/models/openai.models';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { OpenAiService } from '../../../core/services/openai.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { MarkdownPipe, ownedKey } from '../../../shared/pipes/markdown.pipe';
import { TitleLinksDirective } from '../title-links/title-links';
import { buildAddPrompt, buildListPrompt } from '../recommend.prompt';

/** Turns kept per request; mimo-chat refuses more than 40 messages. */
const MAX_TURNS = 30;

export type ChatMode = 'list' | 'add';

/** One rendered bubble — the model's text is markdown, the user's is plain. */
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

@Component({
  selector: 'app-watchlist-ai-chat',
  imports: [
    MatButtonModule,
    MatIconModule,
    FormsModule,
    MarkdownPipe,
    TitleLinksDirective,
  ],
  templateUrl: './watchlist-ai-chat.html',
  styleUrls: ['./watchlist-ai-chat.scss'],
})
export class WatchlistAiChatComponent {
  private messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');

  private openai = inject(OpenAiService);
  private watchlist = inject(WatchlistService);

  // Smooth scrolling per streamed token fights itself, so streaming jumps instead.
  private scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
    setTimeout(() => {
      const el = this.messagesContainer()?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    }, 0);
  }

  /** Starting mode from the parent — changes whenever the user switches tabs */
  readonly mode = input<ChatMode>('list');

  /** What the chat is actually doing — the header toggle can override the tab. */
  activeMode = signal<ChatMode>('list');

  readonly isOpen = signal(false);

  private items = toSignal(this.watchlist.watchlistItems$, { initialValue: [] as WatchlistItem[] });
  /** Titles already on the list, so a link to one reads as such. */
  readonly ownedTitles = computed(
    () => new Set(this.items().map((i) => ownedKey(i.title, i.release_date?.slice(0, 4) ?? ''))),
  );

  /**
   * Rebuild context every time the panel opens — avoids the empty-on-init
   * race condition and keeps suggestions fresh after adding new titles.
   */
  toggle(): void {
    this.isOpen.update((open) => !open);
    if (this.isOpen()) this.refreshContext();
  }

  close(): void {
    this.isOpen.set(false);
  }

  private refreshContext(): void {
    this.watchlist.watchlistItems$.pipe(take(1)).subscribe((items) => this.buildContext(items));
  }

  /** Which thread is waiting on a reply, so the caret shows in that one only. */
  streamingMode = signal<ChatMode | null>(null);
  inputText = '';

  /**
   * Each mode keeps its own thread — the two system prompts contradict each
   * other, so switching must not carry turns across, and coming back should
   * find the conversation where you left it.
   */
  history: Record<ChatMode, OpenAiMessage[]> = { list: [], add: [] };
  private transcripts = signal<Record<ChatMode, ChatMessage[]>>({ list: [], add: [] });

  /** Only the thread of the mode on screen is rendered. */
  displayMessages = computed(() => this.transcripts()[this.activeMode()]);

  private pushMessage(mode: ChatMode, msg: ChatMessage): void {
    this.transcripts.update((t) => ({ ...t, [mode]: [...t[mode], msg] }));
  }

  /** Rewrite the tail of a thread — the growing reply while tokens stream in. */
  private setLastText(mode: ChatMode, text: string): void {
    this.transcripts.update((t) => ({
      ...t,
      [mode]: t[mode].map((m, i) => (i === t[mode].length - 1 ? { ...m, text } : m)),
    }));
  }

  constructor() {
    // Switching tabs realigns the chat, same as tapping the header toggle.
    effect(() => {
      const mode = this.mode();
      untracked(() => this.setMode(mode));
    });
  }

  setMode(mode: ChatMode): void {
    if (mode === this.activeMode()) return;
    this.activeMode.set(mode);
    this.refreshContext();
  }

  /** System prompt plus the recent turns — keeps a long thread under the function's cap. */
  private sendable(mode: ChatMode): OpenAiMessage[] {
    const system = this.history[mode].filter((m) => m.role === 'system');
    const turns = this.history[mode].filter((m) => m.role !== 'system');
    return [...system, ...turns.slice(-MAX_TURNS)];
  }

  onSend(): void {
    const text = this.inputText.trim();
    // The mode is pinned for the whole exchange: switching mid-stream must not
    // drop the reply into the other thread.
    const mode = this.activeMode();
    if (!text || this.streamingMode() === mode) return;

    this.inputText = '';
    this.pushMessage(mode, { role: 'user', text });
    this.scrollToBottom();

    const userTurn: OpenAiMessage = { role: 'user', content: text };
    this.history[mode].push(userTurn);

    this.streamingMode.set(mode);
    // Streamed: the typing indicator gives way to the reply bubble on the first
    // token, and the text grows in place while the model keeps writing.
    let reply = '';
    this.openai.stream(this.sendable(mode)).subscribe({
      next: (delta) => {
        if (!reply) {
          this.streamingMode.set(null);
          this.pushMessage(mode, { role: 'model', text: '' });
        }
        reply += delta;
        this.setLastText(mode, reply);
        this.scrollToBottom('auto');
      },
      complete: () => {
        this.streamingMode.set(null);
        if (!reply.trim()) {
          this.pushMessage(mode, {
            role: 'model',
            text: "I couldn't put that into words — try rephrasing?",
          });
        } else {
          this.history[mode].push({ role: 'assistant', content: reply });
        }
        this.scrollToBottom();
      },
      error: () => {
        this.streamingMode.set(null);
        this.pushMessage(mode, { role: 'model', text: 'Something went wrong. Please try again.' });
        this.scrollToBottom();
      },
    });
  }

  buildContext(items: WatchlistItem[]): void {
    // Refresh the system prompt in place — the turns already exchanged in this
    // thread stay, so reopening the panel doesn't make the model forget them.
    const mode = this.activeMode();
    const turns = this.history[mode].filter((m) => m.role !== 'system');
    this.history[mode] = [
      { role: 'system', content: mode === 'list' ? buildListPrompt(items) : buildAddPrompt(items) },
      ...turns,
    ];
  }
}
