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

// Opt-in whitelist of query-key prefixes we persist. Everything else
// stays in-memory only: tasks module, infinite scrolls (notifications,
// logs), money/finance reads, and giant list queries that are either
// too big or churn too much to be worth hydrating stale.
const PERSIST_PREFIXES: ReadonlyArray<string> = [
  // Lookups / catalogs
  "map-types",
  "permission-catalog",
  "job-roles",
  "project-roles-catalog",
  "departments",
  "assignable-people",
  "assignable-staff",
  "assignable-contractors",
  "task-type-options",
  "project-options",
  "department-options",
  "breadcrumb-label",
  "units",
  // Drawings per project (folders only; versions/notices stay in memory)
  "project-drawings",
  // Website CMS content
  "website",
];

// Keys that explicitly must NOT be persisted even if they share a prefix
// with the whitelist. Mostly tasks module slices that happen to share a
// head word with something allowed above.
const EXPLICIT_BLOCK: ReadonlyArray<string> = [
  "my-effective-permissions",
  "effective-permissions",
  "inherited-grants",
];

export function shouldPersistQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) return false;
  const head = key[0];
  if (typeof head !== "string") return false;
  if (EXPLICIT_BLOCK.includes(head)) return false;
  return PERSIST_PREFIXES.includes(head);
}
