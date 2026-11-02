import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthUserId } from "../../lib/authUser";
import { runPrefetch } from "../../lib/prefetch/runPrefetch";

const START_DELAY_MS = 1500;
const REFRESH_AFTER_MS = 10 * 60 * 1000;

/**
 * Mounted once the on-disk cache is restored. Starts the background
 * prefetch shortly after the first paint, and again when the window
 * regains focus if the last run was more than 10 minutes ago.
 */
export default function BackgroundPrefetch() {
  const queryClient = useQueryClient();
  const { userId } = useAuthUserId();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let running = false;
    let lastRun = 0;
    const isCancelled = () => cancelled;

    const start = () => {
      if (running || cancelled) return;
      running = true;
      lastRun = Date.now();
      runPrefetch(queryClient, userId, isCancelled).finally(() => {
        running = false;
      });
    };

    const timer = window.setTimeout(start, START_DELAY_MS);
    const onFocus = () => {
      if (Date.now() - lastRun > REFRESH_AFTER_MS) start();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [queryClient, userId]);

  return null;
}
