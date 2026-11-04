// =====================================================================
// send-push — forwards one batch of pushes to Expo for the desktop app
// (src/services/notifications/pushNotifications.ts). Fields does not call
// it: it still posts to Expo directly until notification Phase 3.
//
// Phase 0 hardening, 2026-10-18 (plans/notification-system/decisions.md
// §2.1). Version 7, the one deployed before this, checked nothing: anyone
// with the URL (it ships inside the desktop app) and one device token
// could push any text to that phone. This version:
//
//   1. accepts only a signed-in COMPANY account. verify_jwt alone is not
//      enough — the public anon key is a valid JWT and passes it — so the
//      token is resolved to a real user with auth.getUser();
//   2. checks the request shape: 1–100 Expo tokens, text title/body. Long
//      text is shortened, not refused — the desktop's comment push sends
//      "title: whole comment", and refusing it would lose a push v7 sent;
//   3. reports an Expo failure as a failure (502) instead of a 200, so the
//      desktop's notifyUsersDetailed() tells the person who pressed send.
//
// Version 8 read the request body AFTER the two auth round trips, and in
// production every real call stopped right after them and never answered
// (2026-10-18, 09:22 and 09:23 UTC). Version 9 reads the body first, as
// version 7 did, puts a timeout on the Expo call, and logs one line per
// step (counts and status codes only — never tokens or message text).
//
// Same request and response contract as before, so the desktop app needs
// no change. Replaced by notify-push in notification Phase 2, and deleted
// once no desktop build calls it.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Expo takes at most 100 messages per request; the desktop sends 90.
const MAX_TOKENS = 100;
const MAX_TITLE = 200;
const MAX_BODY = 1000;
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

/** Cuts by code points, not UTF-16 units, so a character is never cut in half. */
function shorten(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

function reply(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// One line per step, so "where did it stop" is answerable from the logs.
function step(name: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ step: name, ...detail }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  // Read the body before any other await (see the version 9 note above).
  let input: { tokens?: unknown; title?: unknown; body?: unknown; data?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "body must be JSON" });
  }
  step("body read");

  // 1. A real, signed-in company account.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return reply(401, { error: "not signed in" });

  // Both are set by the Edge runtime on every Supabase project.
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return reply(500, { error: "function is missing its Supabase settings" });

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: auth, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !auth?.user) return reply(401, { error: "not signed in" });

  const { data: caller, error: callerError } = await supabase
    .from("users")
    .select("party_type, status")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (callerError) return reply(500, { error: "could not check the caller" });
  if (!caller || caller.party_type !== "company" || caller.status === "inactive") {
    return reply(403, { error: "not allowed" });
  }
  step("caller ok");

  // 2. The request itself.
  const { tokens, title, body, data } = input;

  if (
    !Array.isArray(tokens) ||
    tokens.length === 0 ||
    tokens.length > MAX_TOKENS ||
    !tokens.every((t) => typeof t === "string" && EXPO_TOKEN.test(t))
  ) {
    return reply(400, { error: `tokens must be 1–${MAX_TOKENS} Expo push tokens` });
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return reply(400, { error: "title must be non-empty text" });
  }
  if (typeof body !== "string") {
    return reply(400, { error: "body must be text" });
  }
  const payloadData = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const pushTitle = shorten(title, MAX_TITLE);
  const pushBody = shorten(body, MAX_BODY);

  // 3. Send. EXPO_ACCESS_TOKEN is optional until "Enhanced push security"
  //    is turned on in the Expo project (notification Phase 2).
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;

  const isPenalty =
    pushTitle.includes("غرامة") ||
    pushTitle.includes("خصم") ||
    pushBody.includes("غرامة") ||
    pushBody.includes("خصم") ||
    String((payloadData as Record<string, unknown>).type ?? "").includes("penalty") ||
    String((payloadData as Record<string, unknown>).event_key ?? "").includes("penalty");

  const messages = (tokens as string[]).map((to) => ({
    to,
    sound: isPenalty ? "penalty_alert.wav" : "default",
    channelId: isPenalty ? "penalties" : "default",
    priority: isPenalty ? "high" : "default",
    title: pushTitle,
    body: pushBody,
    data: payloadData,
  }));

  step("sending", { tokens: messages.length });
  let expoRes: Response;
  try {
    expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    step("expo unreachable");
    return reply(502, { error: `could not reach Expo: ${err instanceof Error ? err.message : String(err)}` });
  }

  const result = await expoRes.json().catch(() => ({ error: "Expo returned a non-JSON reply" }));
  step("expo replied", { status: expoRes.status });
  return reply(expoRes.ok ? 200 : 502, result);
});
