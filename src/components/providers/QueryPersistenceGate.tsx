import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { useAuth } from "../../hooks/useAuth";
import {
  createIDBPersister,
  shouldPersistQuery,
} from "../../lib/queryPersister";

// Attaches react-query cache persistence to the shared QueryClient once a
// user is known. Keyed on user.id — switching accounts rebuilds the
// persister against a fresh IndexedDB store, so no cross-user leak is
// possible even if an older query key lacks a user segment.
//
// Lives inside <AuthProvider> so it can read useAuth(); the QueryClient
// itself is created once at src/index.tsx and wrapped around <App />.
export function QueryPersistenceGate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    const persister = createIDBPersister(userId);
    const [unsubscribeFromClient] = persistQueryClient({
      queryClient,
      persister,
      maxAge: 24 * 60 * 60 * 1000,
      buster: userId,
      dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
    });

    return () => {
      unsubscribeFromClient();
    };
  }, [userId, queryClient]);

  return null;
}
