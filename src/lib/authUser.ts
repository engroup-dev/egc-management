import { useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";

// =====================================================================
// One shared answer to "who is signed in", available on the FIRST render.
//
// Before this existed every useAuthUserId() caller kept its own state,
// started as { userId: null, resolved: false } and only resolved after
// an async supabase.auth.getSession() — which can wait on a network
// token refresh. Every permission guard, menu, task-access check and
// user-keyed query therefore showed a loading state on every mount even
// when its data was already in the cache.
//
// Here the id is read synchronously from the session supabase-js keeps
// in localStorage, then kept current by a single onAuthStateChange
// listener. The id is only used to pick cache keys and the on-disk
// bucket; every request still goes through supabase-js, which refreshes
// the token itself before calling the server.
// =====================================================================

type Listener = () => void;

const listeners = new Set<Listener>();
let currentUserId: string | null = readStoredUserId();

function storageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  try {
    const ref = new URL(url).hostname.split(".")[0];
    return `sb-${ref}-auth-token`;
  } catch {
    return null;
  }
}

function readStoredUserId(): string | null {
  try {
    const key = storageKey();
    if (!key) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id =
      parsed?.user?.id ??
      parsed?.currentSession?.user?.id ??
      parsed?.session?.user?.id ??
      null;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

function setUserId(next: string | null) {
  if (next === currentUserId) return;
  currentUserId = next;
  listeners.forEach((l) => l());
}

// Single listener for the whole app. Covers sign-in, sign-out, token
// refresh (no-op: same id) and the account being switched underneath us.
supabase.auth.onAuthStateChange((_event, session) => {
  setUserId(session?.user?.id ?? null);
});

export function getAuthUserId(): string | null {
  return currentUserId;
}

export function subscribeAuthUserId(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The signed-in user's id. `resolved` is always true — the id is known
 * synchronously from the stored session — and is kept only so existing
 * callers that destructure it keep compiling.
 */
export function useAuthUserId(): { userId: string | null; resolved: boolean } {
  const userId = useSyncExternalStore(subscribeAuthUserId, getAuthUserId);
  return { userId, resolved: true };
}
