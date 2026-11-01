import localforage from "localforage";
import type { Query } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

// Per-user IndexedDB store. localforage is already a dependency (see
// userStorage.ts); we use a separate DB name so the two never collide,
// and a per-user storeName so switching accounts picks a fresh bucket —
// a key without a user-id segment can never leak into the next account's
// hydration.
export function createIDBPersister(userId: string) {
  const store = localforage.createInstance({
    name: "EGC-rq",
    storeName: `user-${userId}`,
  });

  return createAsyncStoragePersister({
    storage: {
      getItem: (key) => store.getItem<string>(key),
      setItem: (key, value) => store.setItem(key, value).then(() => undefined),
      removeItem: (key) => store.removeItem(key),
    },
    key: "rq-cache",
    throttleTime: 1000,
  });
}

// Blocklist model. We persist *everything* by default so visited screens
// paint instantly on relaunch, and only exclude the handful of key heads
// that must stay fresh (money), are infinite / high-churn (feeds, logs),
// are security-sensitive per-user (effective permissions), or are
// ephemeral by nature (schedule preview). The task module is deliberately
// persisted: a brief stale snapshot on relaunch is acceptable because
// Supabase realtime invalidates stale rows within a second.
const NEVER_PERSIST: ReadonlySet<string> = new Set([
  // Money — must stay effectively realtime
  "agreements",
  "project-agreements",
  "agreement-detail",
  "project-distributions",
  "distribution-batches",
  "distribution-candidates",
  "payroll",
  "company-finance",
  "project-counters",
  // Infinite / high-churn
  "notifications",
  "logs",
  "activity-log",
  // Security-sensitive per-user
  "my-effective-permissions",
  "effective-permissions",
  "inherited-grants",
  // Ephemeral form previews
  "schedule-preview",
]);

export function shouldPersistQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) return false;
  const head = key[0];
  if (typeof head !== "string") return false;
  return !NEVER_PERSIST.has(head);
}
