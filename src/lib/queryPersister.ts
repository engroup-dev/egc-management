import localforage from "localforage";
import { defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

declare const __APP_VERSION__: string;

// How long a cache written to disk is trusted on relaunch. Matches the
// QueryClient gcTime (gcTime must be >= maxAge, or restored entries are
// garbage-collected straight away).
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// Every release discards the previous release's cache instead of
// hydrating data whose shape a queryFn may have changed. The bucket is
// already per user, so the buster only needs the version.
export const PERSIST_BUSTER =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

// Several queryFns return Map / Set / Date values (e.g. useMyWork's
// lookup maps). Plain JSON turns those into {} or strings, and a screen
// restored from disk would then crash on `.get` / `.has`. Tag them on the
// way out and rebuild them on the way in.
const TAG = "__rqT";

function serialize(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
    const raw = this[key];
    if (raw instanceof Map) return { [TAG]: "Map", v: Array.from(raw.entries()) };
    if (raw instanceof Set) return { [TAG]: "Set", v: Array.from(raw.values()) };
    if (raw instanceof Date) return { [TAG]: "Date", v: raw.toISOString() };
    return v;
  });
}

function deserialize<T>(text: string): T {
  return JSON.parse(text, (_key, v) => {
    if (v && typeof v === "object" && typeof v[TAG] === "string") {
      if (v[TAG] === "Map") return new Map(v.v);
      if (v[TAG] === "Set") return new Set(v.v);
      if (v[TAG] === "Date") return new Date(v.v);
    }
    return v;
  }) as T;
}

// Per-user IndexedDB store. localforage is already a dependency (see
// userStorage.ts); we use a separate DB name so the two never collide,
// and a per-user storeName so each account restores only its own data.
const persisters = new Map<string, ReturnType<typeof createAsyncStoragePersister>>();

export function createIDBPersister(userId: string) {
  const existing = persisters.get(userId);
  if (existing) return existing;

  const store = localforage.createInstance({
    name: "EGC-rq",
    storeName: `user-${userId}`,
  });

  const persister = createAsyncStoragePersister({
    storage: {
      getItem: (key) => store.getItem<string>(key),
      setItem: (key, value) => store.setItem(key, value).then(() => undefined),
      removeItem: (key) => store.removeItem(key),
    },
    key: "rq-cache",
    // The whole cache is serialized on each write; 3s keeps that off the
    // hot path while the prefetcher is filling hundreds of entries.
    throttleTime: 3000,
    serialize,
    deserialize,
  });
  persisters.set(userId, persister);
  return persister;
}

// Persist everything except feeds whose keys depend on UI filters or
// that page through history (they would rarely match on relaunch and
// can be large), and ephemeral form previews. Money is persisted like
// everything else: it paints instantly from disk and is revalidated
// in the background straight away (tier C staleTime is 0).
const NEVER_PERSIST: ReadonlySet<string> = new Set(["logs", "schedule-preview"]);

export function shouldPersistQuery(query: Query): boolean {
  if (!defaultShouldDehydrateQuery(query)) return false;
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) return false;
  const head = key[0];
  if (typeof head !== "string") return false;
  if (NEVER_PERSIST.has(head)) return false;
  // Notification feed is infinite and per filter; the unread count is
  // tiny and worth keeping so the bell paints instantly.
  if (head === "notify" && key[1] === "list") return false;
  return true;
}
