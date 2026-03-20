import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GeminiContent, GeminiResponse } from '../models/gemini.models';

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private http = inject(HttpClient);

  private readonly endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` +
    `?key=${environment.gemini.apiKey}`;

  /**
   * Sends a conversation history to Gemini and returns the model's reply text.
   * `contents` is the full multi-turn array — caller is responsible for building it.
   */
  chat(contents: GeminiContent[]): Observable<string> {
    return this.http
      .post<GeminiResponse>(this.endpoint, {
        contents,
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 }, // disable chain-of-thought for snappy chat responses
        },
      })
      .pipe(map((response) => response.candidates[0].content.parts[0].text));
  }
}
