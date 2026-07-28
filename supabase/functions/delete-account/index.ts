// Deletes the caller's own account. The browser can't do this itself: removing
// a row from auth.users needs the service role. Everything else goes with it
// through the foreign keys — profile, watchlist items, friendships, invites.
//
// Deploy with:  supabase functions deploy delete-account

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const send = (body: string, status: number) =>
  new Response(body, { status, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return send('not configured', 500);

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return send('unauthorized', 401);

  const admin = createClient(url, serviceKey);

  // Identity comes from the caller's JWT, never from the request body — that is
  // the whole reason a service-role key can be trusted with this endpoint.
  const { data, error: authError } = await admin.auth.getUser(token);
  if (authError || !data.user) return send('unauthorized', 401);

  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) return send(error.message, 500);

  return new Response(JSON.stringify({ deleted: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
