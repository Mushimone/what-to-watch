import { inject, Injectable } from '@angular/core';
import { EMPTY, catchError, concatWith, defer, from, map, Observable, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OpenAiChatResponse, OpenAiMessage } from '../models/openai.models';
import { SupabaseService } from './supabase.service';

/**
 * `thinking` is MiMo's own reasoning switch (it has no `reasoning_effort`). Off by
 * default: measured on the real chat prompt, thinking took the first word from a
 * median ~3 s to ~11 s (worst 35 s) and wrote ~3x the tokens, without better picks.
 * Turn it on only where a task genuinely needs the deliberation.
 */
export interface ChatOptions {
  maxTokens?: number;
  thinking?: 'enabled' | 'disabled';
}

/**
 * Thin client for the chat recommender. The MiMo API key lives server-side in
 * the `mimo-chat` Supabase Edge Function, so nothing sensitive ships to the
 * browser; the caller's Supabase session authorizes the invocation.
 */
@Injectable({ providedIn: 'root' })
export class OpenAiService {
  private supabase = inject(SupabaseService);

  /**
   * Sends a full message array and returns the assistant's reply text.
   * The caller owns the conversation history (system + user/assistant turns).
   * `maxTokens` caps the response length when a bounded reply is wanted.
   */
  chat(
    messages: OpenAiMessage[],
    options?: ChatOptions,
  ): Observable<string> {
    const started = performance.now();
    return from(
      this.supabase.getClient().functions.invoke<OpenAiChatResponse>('mimo-chat', {
        body: {
          messages,
          ...(options?.maxTokens ? { maxTokens: options.maxTokens } : {}),
          thinking: options?.thinking ?? 'disabled',
        },
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.report('buffered', started, { usage: data?.usage });
        return data?.choices[0]?.message?.content ?? '';
      }),
    );
  }

  /**
   * Same call, streamed: emits each token as it arrives so the UI can render
   * the reply while the model is still writing it. `functions.invoke` buffers
   * the whole body, so this goes to the function URL directly with the user's
   * session token — the API key still never leaves the server.
   *
   * If the stream yields nothing (upstream rejects `stream: true`, or the
   * function isn't redeployed yet) it falls back to the buffered call, so the
   * worst case is the old behaviour rather than an empty reply.
   */
  stream(
    messages: OpenAiMessage[],
    options?: ChatOptions,
  ): Observable<string> {
    let streamed = false;
    return from(this.readDeltas(messages, options)).pipe(
      tap(() => (streamed = true)),
      // A mid-stream failure keeps its error; one before any token falls back.
      catchError((err) => {
        if (streamed) return throwError(() => err);
        console.warn('Streaming chat failed, falling back to buffered:', err);
        return EMPTY;
      }),
      concatWith(defer(() => (streamed ? EMPTY : this.chat(messages, options)))),
    );
  }

  private async *readDeltas(
    messages: OpenAiMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<string> {
    const started = performance.now();
    let firstThought: number | null = null;
    let firstWord: number | null = null;
    let usage: unknown = null;
    const { data } = await this.supabase.getClient().auth.getSession();
    const res = await fetch(`${environment.supabase.url}/functions/v1/mimo-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: environment.supabase.anonKey,
        Authorization: `Bearer ${data.session?.access_token ?? environment.supabase.anonKey}`,
      },
      body: JSON.stringify({
        messages,
        stream: true,
        ...(options?.maxTokens ? { maxTokens: options.maxTokens } : {}),
        thinking: options?.thinking ?? 'disabled',
      }),
    });
    if (!res.ok || !res.body) throw new Error(`mimo-chat failed (${res.status})`);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        // Frames are blank-line separated; a trailing partial frame waits for the next chunk.
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const line of frames.join('\n').split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') return;
          try {
            const frame = JSON.parse(payload);
            if (frame?.usage) usage = frame.usage;
            if (frame?.choices?.[0]?.delta?.reasoning_content) firstThought ??= performance.now();
            const delta = frame?.choices?.[0]?.delta?.content;
            if (delta) {
              firstWord ??= performance.now();
              yield delta;
            }
          } catch {
            // keep-alive or malformed frame — nothing to render
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
      this.report('stream', started, { firstThought, firstWord, usage });
    }
  }

  /**
   * Dev only: what a call cost and where the wait went — tokens in/out (and how
   * many were reasoning or served from cache, if the provider says), time to the
   * first thought and the first word. Read it in the console while tuning prompts.
   */
  private report(
    kind: 'stream' | 'buffered',
    started: number,
    seen: { firstThought?: number | null; firstWord?: number | null; usage?: unknown },
  ): void {
    if (environment.production) return;
    const ms = (t?: number | null) => (t == null ? null : Math.round(t - started));
    console.info('[mimo]', kind, {
      usage: seen.usage ?? null,
      ms: { firstThought: ms(seen.firstThought), firstWord: ms(seen.firstWord), total: ms(performance.now()) },
    });
  }
}
