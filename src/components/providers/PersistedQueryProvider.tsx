import { ReactNode, useEffect, useRef, useState } from "react";
import {
  IsRestoringProvider,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
} from "@tanstack/react-query-persist-client";
import { useAuthUserId } from "../../lib/authUser";
import {
  createIDBPersister,
  PERSIST_BUSTER,
  PERSIST_MAX_AGE,
  shouldPersistQuery,
} from "../../lib/queryPersister";

// =====================================================================
// QueryClientProvider + on-disk cache that follows the signed-in user.
//
// PersistQueryClientProvider binds one persister for the lifetime of the
// window, so a second account signing in without a relaunch would have
// its data written into the first account's bucket. Here the persister
// is chosen per user id, and a change of user runs, in this order:
//
//   1. stop saving to the previous user's bucket,
//   2. clear the in-memory cache (nothing of the previous user's may be
//      shown to the next one — this replaces the ISSUE 13 listener that
//      used to live in AuthProvider),
//   3. restore the next user's bucket, while useIsRestoring() is true so
//      no query fires against a half-restored cache,
//   4. start saving to the next user's bucket.
//
// Doing (1) before (2) matters: clearing while still subscribed would
// save an empty cache over the previous user's data.
// =====================================================================

export function PersistedQueryProvider({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  const { userId } = useAuthUserId();
  const [restoredFor, setRestoredFor] = useState<string | null | undefined>(
    undefined,
  );
  const previousUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    // Any change after the first run is a different account (or a sign
    // out). The first run is boot: the cache is empty anyway.
    if (previousUser.current !== undefined && previousUser.current !== userId) {
      client.clear();
    }
    previousUser.current = userId;

    if (!userId) {
      setRestoredFor(null);
      return;
    }

    const persister = createIDBPersister(userId);
    const options = {
      queryClient: client,
      persister,
      maxAge: PERSIST_MAX_AGE,
      buster: PERSIST_BUSTER,
      dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
    };

    persistQueryClientRestore(options)
      .catch(() => {
        // A corrupt or unreadable cache is discarded by the restore
        // itself; render with an empty cache rather than block boot.
      })
      .finally(() => {
        if (cancelled) return;
        // Everything restored from disk is shown as-is but treated as
        // stale, so each screen re-checks it in the background the first
        // time it is viewed this run. Several forms still "refresh" by
        // reloading the window; without this, a reload within a query's
        // staleTime would restore the pre-edit data and keep showing it.
        client.invalidateQueries({ refetchType: "none" });
        unsubscribe = persistQueryClientSubscribe(options);
        setRestoredFor(userId);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [client, userId]);

  const isRestoring = restoredFor !== (userId ?? null);

  return (
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={isRestoring}>{children}</IsRestoringProvider>
    </QueryClientProvider>
  );
}
