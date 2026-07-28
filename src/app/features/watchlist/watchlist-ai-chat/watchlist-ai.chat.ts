import {
  Component,
  computed,
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
import { MatIconModule } from '@angular/material/icon';
import { take } from 'rxjs';
import { OpenAiMessage } from '../../../core/models/openai.models';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { OpenAiService } from '../../../core/services/openai.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';
import { fmtItem, LANGUAGE_RULE, RECOMMEND_STYLE } from '../recommend.prompt';

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
  ],
  templateUrl: './watchlist-ai-chat.html',
  styleUrls: ['./watchlist-ai-chat.scss'],
})
export class WatchlistAiChatComponent implements OnChanges {
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  private openai = inject(OpenAiService);
  private watchlist = inject(WatchlistService);

  // Smooth scrolling per streamed token fights itself, so streaming jumps instead.
  private scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    }, 0);
  }

  /** Starting mode from the parent — changes whenever the user switches tabs */
  @Input() mode: ChatMode = 'list';

  /** What the chat is actually doing — the header toggle can override the tab. */
  activeMode = signal<ChatMode>('list');

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

  /** Switching tabs realigns the chat, same as tapping the header toggle. */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode']) this.setMode(this.mode);
  }

  setMode(mode: ChatMode): void {
    if (mode === this.activeMode()) return;
    this.activeMode.set(mode);
    this.watchlist.watchlistItems$.pipe(take(1)).subscribe((items) => {
      this.buildContext(items);
    });
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
    this.openai.stream(this.history[mode]).subscribe({
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
    const watched = items.filter((i) => i.watched);
    const unwatched = items.filter((i) => !i.watched);
    const fmt = fmtItem;

    // Shared recommendation method — the "how to think" half of the prompt.
    const method = `
HOW TO RECOMMEND:
1. First infer my taste from the WATCHED list — recurring tones, themes, pacing, eras, directors, and what I rated highly (★). A 👍 means I loved that title and 👎 means I disliked it; weight my 👍/👎 more heavily than ★, and steer away from what a 👎 represents. Treat that as my profile.
2. Work out what I'm actually asking for: a mood/vibe, a time constraint, something similar to a title, help deciding, or just browsing options.
3. Match against BOTH my request and my taste profile, using your real knowledge of each title's plot, tone and atmosphere. Genre tags are rough; the year, director, ★rating and short synopsis are only there to help you identify the exact title and gauge what I like.
4. Before you name ANY title, open with ONE short line (max 25 words): what I'm in the mood for, and the thread in my taste it should match. The pick has to follow from that line — don't decide first and justify after.
5. Then be adaptive and decisive about the shape of your answer:
   - If I'm asking what to watch / for help picking / for a specific mood: ONE confident top pick on its own line as "**Watch this: Title (Year)**" and a reason, then offer 2–3 shorter alternates.
   - If I'm clearly browsing or asking for options/a list: give a ranked shortlist of up to 4, best first.
6. Every reason must connect the pick to what I asked AND, whenever possible, to something specific I've watched (e.g. "you rated Sicario highly").
7. If my request is vague, make a sensible assumption and recommend — don't interrogate me with clarifying questions.
8. Never repeat a title you already suggested earlier in this conversation.`.trim();

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

${LANGUAGE_RULE}
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

${LANGUAGE_RULE}
    `.trim();

    // Refresh the system prompt in place — the turns already exchanged in this
    // thread stay, so reopening the panel doesn't make the model forget them.
    const mode = this.activeMode();
    const turns = this.history[mode].filter((m) => m.role !== 'system');
    this.history[mode] = [
      { role: 'system', content: mode === 'list' ? listContext : addContext },
      ...turns,
    ];
  }
}
