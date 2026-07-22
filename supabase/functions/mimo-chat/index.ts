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
      ...(payload.maxTokens ? { max_tokens: payload.maxTokens } : {}),
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
