// =====================================================================
// notify-push — delivers the database's queued pushes to Expo
// (plans/notification-system/architecture.md "Delivery pipeline").
//
// Called only by the database: notify.wake_push() right after a save that
// queued a push (pg_net, after commit), and the every-minute sweep. Both
// send the shared secret in x-notify-secret; the function refuses anything
// else. verify_jwt is off because the caller is the database, not a user.
//
//   {"action": "push"}      claim due pushes → Expo → write tickets back
//   {"action": "receipts"}  pull Expo receipts → switch off dead devices
//
// Batches: up to 100 messages, one Expo project per request (Expo refuses
// mixed projects). EXPO_ACCESS_TOKEN (or EXPO_ACCESS_TOKEN_<APP_ID>) is
// sent when set, ready for "Enhanced push security". One log line per
// step: counts and status codes only, never tokens or message text.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const EXPO_SEND = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH = 100;
const RECEIPT_BATCH = 1000;
const MAX_ROUNDS = 5; // claim at most this many times per call

interface Message {
  delivery_ids: number[];
  to: string;
  app_id: string;
  title: string;
  body: string;
  sound?: string;
  priority?: string;
  data?: Record<string, unknown>;
}

interface Result {
  delivery_ids: number[];
  ok: boolean;
  ticket_id?: string;
  error?: string;
  error_code?: string;
}

function step(name: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ step: name, ...detail }));
}

function reply(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

// Constant-time comparison, so the secret cannot be guessed byte by byte.
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function expoHeaders(appId?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const token =
    (appId && Deno.env.get(`EXPO_ACCESS_TOKEN_${appId.toUpperCase()}`)) || Deno.env.get("EXPO_ACCESS_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function sendBatch(appId: string, batch: Message[]): Promise<Result[]> {
  const body = batch.map((m) => {
    const isPenalty =
      m.sound?.includes("penalty") ||
      (m.data && (
        String(m.data.event_key ?? "").includes("penalty") ||
        String(m.data.type ?? "").includes("penalty")
      )) ||
      (m.title && (m.title.includes("غرامة") || m.title.includes("خصم"))) ||
      (m.body && (m.body.includes("غرامة") || m.body.includes("خصم")));

    return {
      to: m.to,
      title: m.title,
      body: m.body,
      sound: isPenalty ? "penalty_alert.wav" : (m.sound ?? "default"),
      priority: isPenalty ? "high" : (m.priority ?? "default"),
      channelId: isPenalty ? "penalties" : "default",
      data: m.data ?? {},
    };
  });
  let res: Response;
  try {
    res = await fetch(EXPO_SEND, {
      method: "POST",
      headers: expoHeaders(appId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return batch.map((m) => ({ delivery_ids: m.delivery_ids, ok: false, error: message, error_code: "network" }));
  }
  const json = await res.json().catch(() => null) as
    | { data?: Array<{ status: string; id?: string; message?: string; details?: { error?: string } }>; errors?: Array<{ code?: string; message?: string }> }
    | null;

  if (!res.ok || !json || !Array.isArray(json.data)) {
    const e = json?.errors?.[0];
    return batch.map((m) => ({
      delivery_ids: m.delivery_ids,
      ok: false,
      error: e?.message ?? `HTTP ${res.status}`,
      error_code: e?.code ?? `http_${res.status}`,
    }));
  }
  // Expo answers in the same order as the messages
  return batch.map((m, i) => {
    const t = json.data![i];
    if (t?.status === "ok") return { delivery_ids: m.delivery_ids, ok: true, ticket_id: t.id };
    return {
      delivery_ids: m.delivery_ids,
      ok: false,
      error: t?.message ?? "no ticket",
      error_code: t?.details?.error ?? "ticket_error",
    };
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  const secret = Deno.env.get("NOTIFY_PUSH_SECRET");
  const given = req.headers.get("x-notify-secret") ?? "";
  if (!secret || !sameSecret(given, secret)) return reply(401, { error: "not allowed" });

  let action = "push";
  try {
    const body = await req.json();
    if (body && typeof body.action === "string") action = body.action;
  } catch {
    // an empty body means "push"
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(500, { error: "function is missing its Supabase settings" });
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (action === "push") {
    let sent = 0;
    let failed = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data: claim, error: claimError } = await db.rpc("notify_push_claim", { p_limit: 300 });
      if (claimError) {
        step("claim failed", { code: claimError.code });
        return reply(500, { error: "claim failed" });
      }
      const messages: Message[] = claim?.messages ?? [];
      step("claimed", { round, messages: messages.length, busy: claim?.busy === true });
      if (messages.length === 0) break;

      const byApp = new Map<string, Message[]>();
      for (const m of messages) byApp.set(m.app_id, [...(byApp.get(m.app_id) ?? []), m]);

      const results: Result[] = [];
      for (const [appId, list] of byApp) {
        for (let i = 0; i < list.length; i += BATCH) {
          const batchResults = await sendBatch(appId, list.slice(i, i + BATCH));
          step("sent batch", {
            app_id: appId,
            messages: batchResults.length,
            ok: batchResults.filter((r) => r.ok).length,
          });
          results.push(...batchResults);
        }
      }
      const { error: resultError } = await db.rpc("notify_push_result", { p_results: results });
      if (resultError) step("result failed", { code: resultError.code });
      sent += results.filter((r) => r.ok).length;
      failed += results.filter((r) => !r.ok).length;
      if (messages.length < 300) break;
    }
    step("push done", { sent, failed });
    return reply(200, { sent, failed });
  }

  if (action === "receipts") {
    const { data: tickets, error: claimError } = await db.rpc("notify_receipt_claim", { p_limit: 900 });
    if (claimError) {
      step("receipt claim failed", { code: claimError.code });
      return reply(500, { error: "receipt claim failed" });
    }
    const ids: string[] = Array.isArray(tickets) ? tickets : [];
    step("receipts claimed", { tickets: ids.length });
    const receipts: Record<string, unknown> = {};
    // only a batch Expo answered can say a receipt is missing; a failed
    // request leaves its tickets for the next run
    const answered: string[] = [];
    for (let i = 0; i < ids.length; i += RECEIPT_BATCH) {
      const chunk = ids.slice(i, i + RECEIPT_BATCH);
      try {
        const res = await fetch(EXPO_RECEIPTS, {
          method: "POST",
          headers: expoHeaders(),
          body: JSON.stringify({ ids: chunk }),
          signal: AbortSignal.timeout(15_000),
        });
        const json = await res.json().catch(() => null) as { data?: Record<string, unknown> } | null;
        if (res.ok && json?.data) {
          Object.assign(receipts, json.data);
          answered.push(...chunk);
        }
        step("receipt batch", { status: res.status, returned: json?.data ? Object.keys(json.data).length : 0 });
      } catch (err) {
        step("receipt batch failed", { message: err instanceof Error ? err.message : String(err) });
      }
    }
    const missing = answered.filter((id) => !(id in receipts));
    const { error: resultError } = await db.rpc("notify_receipt_result", { p: { receipts, missing } });
    if (resultError) step("receipt result failed", { code: resultError.code });
    step("receipts done", { checked: Object.keys(receipts).length, missing: missing.length });
    return reply(200, { checked: Object.keys(receipts).length, missing: missing.length });
  }

  return reply(400, { error: "unknown action" });
});
