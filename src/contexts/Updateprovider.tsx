import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { supabase } from "../lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type UpdateStatus = "checking" | "up_to_date" | "must_update";

type UpdateContextType = {
  status: UpdateStatus;
  recheck: () => Promise<void>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** "1.2.3" → [1, 2, 3] */
function parseVersion(v: string): number[] {
  return v.split(".").map((n) => parseInt(n, 10) || 0);
}

/**
 * Returns true if `current` is strictly below `required`.
 * "1.2.3" < "1.3.0" → true  |  "2.0.0" >= "2.0.0" → false
 */
function isBelowRequired(current: string, required: string): boolean {
  const cur = parseVersion(current);
  const req = parseVersion(required);
  const len = Math.max(cur.length, req.length);

  for (let i = 0; i < len; i++) {
    const c = cur[i] ?? 0;
    const r = req[i] ?? 0;
    if (c < r) return true;
    if (c > r) return false;
  }
  return false; // equal → not outdated
}

/**
 * Gets the current app version.
 * - In Electron: uses the version exposed via preload (window.electronAPI.getVersion)
 * - In browser dev mode: falls back to import.meta.env.VITE_APP_VERSION or "0.0.0"
 */
export async function getCurrentVersion(): Promise<string> {
  // Electron exposes this via contextBridge in preload.ts:
  //   contextBridge.exposeInMainWorld("electronAPI", {
  //     getVersion: () => ipcRenderer.invoke("get-app-version"),
  //   });
  if (
    typeof window !== "undefined" &&
    window.electronAPI?.getVersion
  ) {
    try {
      const version = await window.electronAPI.getVersion();
      if (typeof version === "string") return version;
    } catch {
      // fall through
    }
  }

  // Fallback: set VITE_APP_VERSION in your vite.config.ts / .env
  return import.meta.env.VITE_APP_VERSION ?? "0.0.0";
}

// ─── Context ──────────────────────────────────────────────────────────────────

const UpdateContext = createContext<UpdateContextType>({
  status: "checking",
  recheck: () => Promise.resolve(),
});

export function useUpdate() {
  return useContext(UpdateContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>("checking");

  const check = useCallback(async () => {
    setStatus("checking");

    try {
      const { data, error } = await supabase
        .from("update")
        .select("*")
        .order("created_at", { ascending: false })
        .eq("type", "desktop")
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        // Fail-open: can't reach DB → let user through
        console.warn("UpdateProvider: could not fetch update row", error);
        setStatus("up_to_date");
        return;
      }

      const { version: requiredVersion, is_must } = data;

      // Row exists but update isn't mandatory → ignore
      if (!is_must) {
        setStatus("up_to_date");
        return;
      }

      const currentVersion = await getCurrentVersion();

      setStatus(
        isBelowRequired(currentVersion, requiredVersion)
          ? "must_update"
          : "up_to_date",
      );
      console.log("CURRENT RAW:", currentVersion);
      console.log("REQUIRED:", requiredVersion);
      console.log("CURRENT PARSED:", parseVersion(currentVersion));
      console.log("REQUIRED PARSED:", parseVersion(requiredVersion));
    } catch (err) {
      console.error("UpdateProvider: unexpected error", err);
      setStatus("up_to_date"); // fail-open
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <UpdateContext.Provider value={{ status, recheck: check }}>
      {children}
      {status === "must_update" && <ForceUpdateOverlay />}
    </UpdateContext.Provider>
  );
}

// ─── Blocking Overlay ─────────────────────────────────────────────────────────

// The website's download page, which always offers the live version
// (deploy/desktop-release/ in this repo fills it).
const DOWNLOAD_PAGE_URL = "https://engroup.ly/download";

function ForceUpdateOverlay() {
  const handleUpdate = () => {
    if (
      typeof window !== "undefined" &&
      window.electronAPI?.openExternal
    ) {
      window.electronAPI.openExternal(DOWNLOAD_PAGE_URL);
    } else {
      window.open(DOWNLOAD_PAGE_URL, "_blank");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 p-8">
      <div className="flex w-full max-w-sm flex-col items-center rounded-2xl bg-white p-7 shadow-2xl">
        {/* Icon */}
        <div className="mb-4 flex h-18 w-18 items-center justify-center rounded-full bg-indigo-50">
          <span className="text-4xl">🔄</span>
        </div>

        {/* Title */}
        <h2
          className="mb-2.5 text-center text-xl font-bold text-gray-900"
          dir="rtl"
        >
          تحديث مطلوب
        </h2>

        {/* Body */}
        <p
          className="mb-6 text-center text-sm leading-relaxed text-gray-500"
          dir="rtl"
        >
          يتوفر إصدار جديد من التطبيق. يرجى التحديث للاستمرار في الاستخدام.
        </p>

        {/* Button */}
        <button
          onClick={handleUpdate}
          className="w-full rounded-xl bg-indigo-600 py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-90 active:opacity-75"
        >
          تحديث الآن
        </button>
      </div>
    </div>
  );
}
