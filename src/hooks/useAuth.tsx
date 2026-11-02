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
import { UserData, getUserData } from "../lib/userStorage";
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

// Read once in index.tsx before the first render, so AuthProvider starts
// with the locally stored profile instead of a `loading` frame (which
// made RequirePasswordChange render nothing for the whole app).
let preloadedUser: UserData | null | undefined = undefined;

export async function preloadAuthUser(): Promise<void> {
  try {
    preloadedUser = await getUserData();
  } catch {
    preloadedUser = null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(
    preloadedUser ?? null,
  );
  const [loading, setLoading] = useState(preloadedUser === undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Load user on app start - RUNS ONCE
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      if (preloadedUser === undefined) setLoading(true);

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

  // ISSUE 13 (clear the cache when the account changes) now lives in
  // PersistedQueryProvider, which has to order it against switching the
  // on-disk bucket: stop saving the old user's cache, clear, restore the
  // new user's. Clearing from here raced that and wiped the old bucket.

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
