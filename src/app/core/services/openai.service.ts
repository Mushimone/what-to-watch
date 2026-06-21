import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OpenAiChatResponse, OpenAiMessage } from '../models/openai.models';

/**
 * Thin client for an OpenAI-compatible chat-completions API (MiMo).
 * Endpoint, model and key all come from the environment so the provider can
 * be swapped via config alone.
 */
@Injectable({ providedIn: 'root' })
export class OpenAiService {
  private http = inject(HttpClient);

  private readonly endpoint = `${environment.mimo.baseUrl}/chat/completions`;

  /**
   * Sends a full message array and returns the assistant's reply text.
   * The caller owns the conversation history (system + user/assistant turns).
   */
  chat(messages: OpenAiMessage[]): Observable<string> {
    return this.http
      .post<OpenAiChatResponse>(
        this.endpoint,
        {
          model: environment.mimo.model,
          messages,
        },
        {
          headers: { Authorization: `Bearer ${environment.mimo.apiKey}` },
        },
      )
      .pipe(map((response) => response.choices[0]?.message?.content ?? ''));
  }
}
