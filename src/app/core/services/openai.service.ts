import { inject, Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
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
}
