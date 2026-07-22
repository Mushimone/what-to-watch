import { inject, Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OpenAiChatResponse, OpenAiMessage } from '../models/openai.models';
import { SupabaseService } from './supabase.service';

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
    options?: { maxTokens?: number; reasoningEffort?: 'low' | 'medium' | 'high' },
  ): Observable<string> {
    return from(
      this.supabase.getClient().functions.invoke<OpenAiChatResponse>('mimo-chat', {
        body: {
          messages,
          ...(options?.maxTokens ? { maxTokens: options.maxTokens } : {}),
          ...(options?.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
        },
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data?.choices[0]?.message?.content ?? '';
      }),
    );
  }

  /**
   * Same call, streamed: emits each token as it arrives so the UI can render
   * the reply while the model is still writing it. `functions.invoke` buffers
   * the whole body, so this goes to the function URL directly with the user's
   * session token — the API key still never leaves the server.
   */
  stream(
    messages: OpenAiMessage[],
    options?: { maxTokens?: number; reasoningEffort?: 'low' | 'medium' | 'high' },
  ): Observable<string> {
    return from(this.readDeltas(messages, options));
  }

  private async *readDeltas(
    messages: OpenAiMessage[],
    options?: { maxTokens?: number; reasoningEffort?: 'low' | 'medium' | 'high' },
  ): AsyncGenerator<string> {
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
        ...(options?.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
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
            const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // keep-alive or malformed frame — nothing to render
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }
}
