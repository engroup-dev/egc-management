// =====================================================================
// admin-users — the only place the service-role key is used for the
// desktop app's account management.
//
// Before this function the key shipped inside the Electron bundle
// (VITE_SUPABASE_SERVICE_KEY), and the installers are on a public release.
// Now the desktop sends the signed-in person's own JWT here, this function
// checks WHO they are and WHAT they may do, and only then acts with the key,
// which lives only in this function's environment.
//
// Actions (POST, JSON body: { action, ... }):
//   create_user     kind: employee | contractor | vendor | client
//   delete_user     clean-up of a login created minutes ago (contractor/vendor)
//   find_user       one auth user by e-mail (reset-password screen)
//   reset_password  set a new password and force a change at next login
//
// Every action: 1) the caller is a real signed-in COMPANY account
// (auth.getUser, not just a valid JWT — the public anon key is a valid JWT),
// 2) can_i(<permission>) is true for that caller. can_i is SECURITY DEFINER on
// auth.uid(), and it is called with the CALLER's token, so it cannot be spoofed.
//
// Logs one line per step: step names and counts only — never e-mails,
// passwords, tokens or ids' owners.
// =====================================================================
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Roles that belong to the other three kinds. Same ids the desktop used.
const CONTRACTOR_ROLE_ID = "20606a44-1f4b-4e0a-af58-abc553b70bc0";
const VENDOR_ROLE_ID = "7cfabb14-ee17-48bc-b03f-4199ef32d1e0";
const CLIENT_ROLE_ID = "803c44ac-0af1-4586-81a2-67e1bc7eb7ef";
const PARTY_ROLE_IDS = [CONTRACTOR_ROLE_ID, VENDOR_ROLE_ID, CLIENT_ROLE_ID];

type Kind = "employee" | "contractor" | "vendor" | "client";
const CREATE_PERMISSION: Record<Kind, string> = {
  employee: "create_employee",
  contractor: "manage_contractors",
  vendor: "manage_vendors",
  client: "manage_clients",
};

// A login may only be deleted by this function while it is this young: it
// exists for the "created the login, linking it failed, undo" paths.
const DELETE_MAX_AGE_MS = 15 * 60 * 1000;
const MIN_NEW_PASSWORD = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only these metadata keys are forwarded to handle_new_user().
const METADATA_KEYS = [
  "employeeId", "firstName", "lastName", "phone", "nationality", "dob", "employeeType", "role",
];

function reply(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function step(name: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ step: name, ...detail }));
}

function isText(v: unknown, max = 500): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

/** Keeps only known keys with text/null values. */
function cleanMetadata(raw: unknown): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of METADATA_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (v === null) out[key] = null;
    else if (typeof v === "string" && v.length <= 500) out[key] = v;
  }
  return out;
}

async function can(userClient: SupabaseClient, permission: string): Promise<boolean> {
  const { data, error } = await userClient.rpc("can_i", { p_permission_name: permission });
  if (error) throw new Error("permission check failed");
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  // Read the body before any other await (same reason as send-push).
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "body must be JSON" });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return reply(400, { error: "body must be a JSON object" });
  }
  const action = input.action;
  step("body read", { action: typeof action === "string" ? action : null });

  // 1. A real, signed-in company account.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return reply(401, { error: "not signed in" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return reply(500, { error: "function is missing its Supabase settings" });
  }

  const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: noSession,
  });
  const { data: auth, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !auth?.user) return reply(401, { error: "not signed in" });
  const callerId = auth.user.id;

  const { data: caller, error: callerError } = await userClient
    .from("users")
    .select("party_type, status")
    .eq("id", callerId)
    .maybeSingle();
  if (callerError) return reply(500, { error: "could not check the caller" });
  if (!caller || caller.party_type !== "company" || caller.status === "inactive") {
    return reply(403, { error: "not allowed" });
  }
  step("caller ok");

  // Everything below uses the key. It exists only here.
  const admin = createClient(url, serviceKey, { auth: noSession });

  try {
    // ---------------------------------------------------------------- create_user
    if (action === "create_user") {
      const kind = input.kind as Kind;
      if (!(kind in CREATE_PERMISSION)) return reply(400, { error: "unknown kind" });
      if (!(await can(userClient, CREATE_PERMISSION[kind]))) return reply(403, { error: "not allowed" });
      step("permission ok", { kind });

      const email = typeof input.email === "string" ? input.email.trim() : "";
      const password = typeof input.password === "string" ? input.password : "";
      if (!isText(email, 254) || !email.includes("@")) return reply(400, { error: "invalid email" });
      if (password.length < 6 || password.length > 200) return reply(400, { error: "invalid password" });

      const meta: Record<string, string | null> = cleanMetadata(input.userMetadata);
      if (kind === "contractor") {
        meta.roleId = CONTRACTOR_ROLE_ID; meta.partyType = "contractor";
      } else if (kind === "vendor") {
        meta.roleId = VENDOR_ROLE_ID; meta.partyType = "vendor";
      } else if (kind === "client") {
        meta.roleId = CLIENT_ROLE_ID; meta.partyType = "client"; meta.role = "Client";
      } else {
        // employee: the person picks any COMPANY role, as the desktop always allowed
        const roleId = (input.userMetadata as Record<string, unknown> | undefined)?.roleId;
        if (typeof roleId !== "string" || !UUID.test(roleId)) return reply(400, { error: "roleId is required" });
        if (PARTY_ROLE_IDS.includes(roleId)) return reply(400, { error: "not a company role" });
        const { data: role, error: roleError } = await admin
          .from("roles").select("id").eq("id", roleId).maybeSingle();
        if (roleError) return reply(500, { error: "could not check the role" });
        if (!role) return reply(400, { error: "unknown role" });
        // A role that can hand out access (Admin, Manager...) needs manage_roles,
        // so create_employee alone can't create an Admin login.
        const { data: privileged, error: privilegedError } = await admin
          .rpc("sec_role_is_privileged", { p_role_id: roleId });
        if (privilegedError) return reply(500, { error: "could not check the role" });
        if (privileged && !(await can(userClient, "manage_roles"))) return reply(403, { error: "not allowed" });
        meta.roleId = roleId; meta.partyType = "company";
      }

      // handle_new_user reads the role from this row, matched by the id chosen
      // here. app_metadata can't carry it: the auth service saves app_metadata
      // after the trigger has fired. Public sign-up can't choose its id.
      const newUserId = crypto.randomUUID();
      const { error: pendingError } = await admin.from("pending_account_roles").insert({
        user_id: newUserId, role_id: meta.roleId, party_type: meta.partyType,
      });
      if (pendingError) return reply(500, { error: "could not prepare the account" });

      const { data, error } = await admin.auth.admin.createUser({
        id: newUserId,
        email, password, email_confirm: true, user_metadata: meta,
        app_metadata: { roleId: meta.roleId, partyType: meta.partyType },
      });
      // Normally already consumed by the trigger. Clears it if the create failed.
      await admin.from("pending_account_roles").delete().eq("user_id", newUserId);
      if (error || !data.user) {
        step("create failed", { status: error?.status ?? null });
        return reply(error?.status && error.status < 500 ? 400 : 500, {
          error: error?.message ?? "could not create the user",
        });
      }
      step("user created", { kind });
      return reply(200, { user: { id: data.user.id, email: data.user.email, created_at: data.user.created_at } });
    }

    // ---------------------------------------------------------------- delete_user
    if (action === "delete_user") {
      const userId = input.userId;
      if (typeof userId !== "string" || !UUID.test(userId)) return reply(400, { error: "invalid userId" });
      if (userId === callerId) return reply(400, { error: "cannot delete yourself" });

      const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || !target?.user) return reply(404, { error: "user not found" });

      // app_metadata only the service role can set. Older logins only have user_metadata.
      const partyType = target.user.app_metadata?.partyType ?? target.user.user_metadata?.partyType;
      const permission = partyType === "contractor" ? "manage_contractors"
        : partyType === "vendor" ? "manage_vendors" : null;
      if (!permission || !(await can(userClient, permission))) return reply(403, { error: "not allowed" });

      const age = Date.now() - new Date(target.user.created_at).getTime();
      if (!(age >= 0 && age <= DELETE_MAX_AGE_MS)) return reply(403, { error: "only a login created minutes ago can be removed here" });

      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return reply(500, { error: error.message });
      step("user deleted", { partyType });
      return reply(200, { ok: true });
    }

    // ---------------------------------------------------------------- find_user / reset_password
    if (action === "find_user" || action === "reset_password") {
      if (!(await can(userClient, "reset_user_password"))) return reply(403, { error: "not allowed" });
      step("permission ok", { action });

      if (action === "find_user") {
        const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
        if (!isText(email, 254)) return reply(400, { error: "invalid email" });
        for (let page = 1; page <= 20; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) return reply(500, { error: error.message });
          const match = data.users.find((u) => u.email?.toLowerCase() === email);
          if (match) return reply(200, { user: { id: match.id, email: match.email, created_at: match.created_at } });
          if (data.users.length < 1000) break;
        }
        return reply(200, { user: null });
      }

      const userId = input.userId;
      const newPassword = input.newPassword;
      if (typeof userId !== "string" || !UUID.test(userId)) return reply(400, { error: "invalid userId" });
      if (typeof newPassword !== "string" || newPassword.length < MIN_NEW_PASSWORD || newPassword.length > 200) {
        return reply(400, { error: `password must be at least ${MIN_NEW_PASSWORD} characters` });
      }
      const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
      if (pwError) return reply(400, { error: pwError.message });
      const { error: flagError } = await admin.from("users").update({ first_login: true }).eq("id", userId);
      if (flagError) return reply(500, { error: flagError.message });
      step("password reset");
      return reply(200, { ok: true });
    }

    return reply(400, { error: "unknown action" });
  } catch (e) {
    step("error", { message: e instanceof Error ? e.message : "unknown" });
    return reply(500, { error: "something went wrong" });
  }
});
