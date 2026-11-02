import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";
import { createQueryClient } from "./lib/queryClient";
import { PersistedQueryProvider } from "./components/providers/PersistedQueryProvider";
import { preloadAuthUser } from "./hooks/useAuth";

// =====================================================================
// Boot. Nothing here waits on the network.
//
// The signed-in user id is read synchronously from the stored Supabase
// session (src/lib/authUser.ts), so the on-disk cache for that user can
// start restoring on the very first render. While it restores,
// useIsRestoring() is true, queries hold off, and AppRouter renders a
// static shell instead of spinners. The locally stored profile is read
// before the first render (a few ms from IndexedDB) so the password-
// change gate never renders blank.
// =====================================================================

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const container: HTMLElement = rootElement;
const queryClient = createQueryClient();

async function boot() {
  await preloadAuthUser();
  createRoot(container).render(
    <React.StrictMode>
      <PersistedQueryProvider client={queryClient}>
        <App />
      </PersistedQueryProvider>
    </React.StrictMode>,
  );
}

boot();
