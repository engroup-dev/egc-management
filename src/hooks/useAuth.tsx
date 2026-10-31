import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authService } from "../services/authService";
import { supabase } from "../lib/supabaseClient";
import { UserData } from "../lib/userStorage";
import { trackSession } from "../lib/sessionTracking";
import { prefetchAppCatalogs } from "../lib/prefetchCatalogs";

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  first_login: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Load user on app start - RUNS ONCE
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      setLoading(true);

      // Try local storage first (FAST - 10-50ms)
      const localUser = await authService.getCurrentUser();

      if (localUser) {
        setUser(localUser);
        setLoading(false);

        // Verify session in background — but don't wipe user on network errors
        authService
          .refreshUserData()
          .then((refreshedUser) => {
            if (refreshedUser) {
              // Got fresh data — update the user
              setUser(refreshedUser);
            } else {
              // refreshUserData returned null — session is truly gone (expired,
              // or account was deactivated) — safe to clear the local user
              setUser(null);
              authService.logout();
            }
          })
          .catch((err) => {
            // Network error, timeout, or Supabase hiccup — keep the local session
            // Do NOT clear the user here; they are still logged in locally
            console.warn(
              "Background refresh failed, keeping local session:",
              err,
            );
          });
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error loading user:", error);
      setLoading(false);
    }
  };

  const refreshUser = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);

    try {
      const MAX_RETRIES = 3;
      const RETRY_DELAY = 20000;

      let lastError;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`🔄 Refresh attempt ${attempt}/${MAX_RETRIES}`);

          const userData = await authService.refreshUserData();

          if (userData) {
            setUser(userData);

            console.log("✅ User refreshed successfully");
            return;
          }

          throw new Error("No user data returned");
        } catch (error) {
          lastError = error;

          console.error(
            `❌ Refresh failed (attempt ${attempt}/${MAX_RETRIES})`,
            error,
          );

          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
          }
        }
      }

      console.error("❌ All refresh attempts failed:", lastError);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  // -------------------------------------------------------------------
  // ISSUE 13 — throw away every cached answer when the account changes
  // -------------------------------------------------------------------
  // React Query caches by key, and almost none of this app's keys
  // mention who asked. ["employees"], ["projects"], ["payroll"] — all of
  // them are really "employees, as seen by whoever is logged in", and
  // the cache survives a logout because the QueryClient is created once
  // in index.tsx and lives as long as the window does.
  //
  // Sign out and sign back in as somebody else and, until each query
  // happens to go stale, the second person reads the first person's
  // data. For most screens that is a stale list. For permissions it is
  // an access-control answer computed for the wrong person, which is
  // why this exists.
  //
  // useCan is keyed by user id and so is already safe on its own. This
  // is the blanket that covers everything that is not.
  //
  // WHY THE SUPABASE EVENT AND NOT THE `user` STATE. Three code paths
  // sign the user out: AuthProvider.logout, the background refresh in
  // loadUser when the session has genuinely expired, and
  // authService.getCurrentUser when it finds the account deactivated.
  // Only the first goes through this provider. All three end in
  // supabase.auth.signOut(), so that is where the listener belongs.
  useEffect(() => {
    let lastUserId: string | null | undefined = undefined;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;

      // First event just records who we started as. Clearing here would
      // wipe the cache on every app start for no reason.
      if (lastUserId === undefined) {
        lastUserId = nextUserId;
        return;
      }

      // TOKEN_REFRESHED fires often and does not change the account.
      if (nextUserId === lastUserId) return;

      lastUserId = nextUserId;
      queryClient.clear();
    });

    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  // Record/update this device's session while a user is logged in.
  useEffect(() => {
    if (!user) return;

    trackSession(user.id);
    const interval = setInterval(() => trackSession(user.id), 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user?.id]);

  // Pre-warm the tier-A catalogs every logged-in session will read early
  // (permission catalog, map types, assignable people, task types).
  // Each is small, cached an hour, and reused across most screens, so
  // kicking them off at login turns the first consuming render into a
  // cache hit instead of a round-trip.
  useEffect(() => {
    if (!user?.id) return;
    prefetchAppCatalogs(queryClient);
  }, [user?.id, queryClient]);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const userData = await authService.login(email, password);
    setUser(userData);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        first_login: user?.first_login || false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
