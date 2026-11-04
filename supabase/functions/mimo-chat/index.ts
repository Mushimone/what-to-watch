// Server-side proxy for the MiMo (OpenAI-compatible) chat API.
// Holds MIMO_API_KEY as a Supabase secret so it never ships to the browser.
// Supabase verifies the caller's JWT before invoking, so only authenticated
// users reach this function; it forwards their messages and returns MiMo's
// raw chat-completions response unchanged.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Any signed-in user can reach this function, so it bounds what one call can
// cost: whole conversation size, turn count and reply length. Sized above the
// biggest honest prompt (a capped watchlist dump) with room to spare.
const MAX_MESSAGES = 40;
const MAX_CHARS = 60_000;
// Reasoning tokens count against this, so it is generous.
const MAX_TOKENS = 4_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const apiKey = Deno.env.get('MIMO_API_KEY');
  const model = Deno.env.get('MIMO_MODEL');
  const baseUrl = Deno.env.get('MIMO_BASE_URL') ?? 'https://token-plan-ams.xiaomimimo.com/v1';
  if (!apiKey || !model) return json({ error: 'MiMo not configured' }, 500);

  let payload: {
    messages?: unknown;
    maxTokens?: number;
    reasoningEffort?: string;
    stream?: boolean;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return json({ error: '`messages` must be a non-empty array' }, 400);
  }

  const messages = payload.messages as { content?: unknown }[];
  const chars = messages.reduce(
    (n, m) => n + (typeof m?.content === 'string' ? m.content.length : 0),
    0,
  );
  if (messages.length > MAX_MESSAGES || chars > MAX_CHARS) {
    return json({ error: 'Conversation too long' }, 413);
  }
  const maxTokens = Math.min(Number(payload.maxTokens) || MAX_TOKENS, MAX_TOKENS);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      messages: payload.messages,
      ...(payload.stream ? { stream: true } : {}),
      max_tokens: maxTokens,
      ...(payload.reasoningEffort ? { reasoning_effort: payload.reasoningEffort } : {}),
    }),
  });

  // Streaming callers get MiMo's SSE body piped straight through, so the first
  // tokens reach the browser instead of waiting for the whole completion.
  if (payload.stream && res.ok && res.body) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  return json(await res.json(), res.status);
});
