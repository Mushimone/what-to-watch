import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { lastValueFrom, of, toArray } from 'rxjs';
import { OpenAiService } from './openai.service';

/** Serves `chunks` as the SSE body, split exactly where the test says. */
function stubFetch(chunks: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, body }));
}

function makeService(): OpenAiService {
  const service = TestBed.inject(OpenAiService);
  // Only the session token is needed from Supabase on this path.
  (service as any).supabase = {
    getClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
  };
  return service;
}

const deltasOf = (service: OpenAiService) =>
  lastValueFrom(service.stream([{ role: 'user', content: 'hi' }]).pipe(toArray()));

describe('OpenAiService.stream', () => {
  it('emits each delta and stops at [DONE], even when frames arrive split', async () => {
    stubFetch([
      'data: {"choices":[{"delta":{"content":"Wat',
      'ch"}}]}\n\ndata: {"choices":[{"delta":{"content":" Arrival"}}]}\n',
      '\ndata: [DONE]\n\ndata: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
    ]);

    expect(await deltasOf(makeService())).toEqual(['Watch', ' Arrival']);
  });

  it('falls back to the buffered call when the stream yields nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, body: null }));
    const service = makeService();
    vi.spyOn(service, 'chat').mockReturnValue(of('buffered reply'));

    expect(await deltasOf(service)).toEqual(['buffered reply']);
  });

  it('skips keep-alives and malformed frames', async () => {
    stubFetch([
      ': keep-alive\n\ndata: not-json\n\ndata: {"choices":[{"delta":{}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    ]);

    expect(await deltasOf(makeService())).toEqual(['ok']);
  });
});
