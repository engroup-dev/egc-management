import React from "react";
import { createRoot, Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import App from "./components/App";
import { createQueryClient } from "./lib/queryClient";
import {
  createIDBPersister,
  shouldPersistQuery,
} from "./lib/queryPersister";
import { supabase } from "./lib/supabaseClient";

// =====================================================================
// Boot order matters. The whole app sits inside a react-query provider,
// and anything persisted to IndexedDB has to be hydrated BEFORE the
// first child mounts and fires its queries. The previous version
// activated persistence inside AuthProvider via a gate component, which
// meant children had already mounted and started network queries by the
// time restoration ran — the spinner stayed up for the full network
// round-trip even though the data was already on disk.
//
// Here we read the Supabase session synchronously on boot (localStorage
// under the hood; typically resolves in a few ms) and, if a user is
// logged in, wrap the app in PersistQueryClientProvider. That provider
// renders no children until restoration completes, so by the time any
// page component mounts, its queries find hydrated data in the cache
// and never show a loading state.
// =====================================================================

const rootElement: HTMLElement | null = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const container: HTMLElement = rootElement;
const queryClient = createQueryClient();
const MAX_AGE = 24 * 60 * 60 * 1000;

function renderWithPersistence(root: Root, userId: string) {
  const persister = createIDBPersister(userId);
  root.render(
    <React.StrictMode>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: MAX_AGE,
          buster: userId,
          dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
        }}
      >
        <App />
      </PersistQueryClientProvider>
    </React.StrictMode>,
  );
}

function renderPlain(root: Root) {
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

async function boot() {
  const root = createRoot(container);
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data?.session?.user?.id ?? null;
    if (userId) {
      renderWithPersistence(root, userId);
    } else {
      renderPlain(root);
    }
  } catch {
    // Any failure reading the session falls back to the plain client —
    // better to render without disk cache than to block boot on an
    // auth-storage error.
    renderPlain(root);
  }
}

boot();
