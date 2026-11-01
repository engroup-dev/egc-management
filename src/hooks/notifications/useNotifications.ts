import { useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { useAuthUserId } from "../permissions/useCan";
import {
  archiveNotifications,
  listNotifications,
  markAllRead,
  markRead,
  PAGE_SIZE,
  unreadCount,
  type NotificationItem,
} from "../../services/notifications/notifyApi";

// =====================================================================
// The inbox. Notifications arrive over Supabase Realtime (the database
// writes them; notify.notifications is published, RLS lets each user see
// only their own rows). Every insert or update refreshes the lists and the
// unread count; useLiveNotifications() also turns a new one into an OS
// notification or an in-app toast.
// =====================================================================

export const notifyKeys = {
  all: ["notify"] as const,
  list: (userId: string | null, unreadOnly: boolean, category: string | null) =>
    ["notify", "list", userId ?? "anonymous", unreadOnly, category ?? "all"] as const,
  unread: (userId: string | null) => ["notify", "unread", userId ?? "anonymous"] as const,
};

export function useNotificationFeed(opts: { unreadOnly?: boolean; category?: string | null; pageSize?: number } = {}) {
  const { userId } = useAuthUserId();
  const unreadOnly = opts.unreadOnly ?? false;
  const category = opts.category ?? null;
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: [...notifyKeys.list(userId, unreadOnly, category), pageSize],
    enabled: !!userId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => listNotifications({ before: pageParam, unreadOnly, category, limit: pageSize }),
    getNextPageParam: (last) => (last.length < pageSize ? undefined : last[last.length - 1].created_at),
    placeholderData: keepPreviousData,
  });
}

export function useUnreadCount() {
  const { userId } = useAuthUserId();
  return useQuery({
    queryKey: notifyKeys.unread(userId),
    enabled: !!userId,
    queryFn: unreadCount,
    // Realtime refreshes it; the poll only covers a dropped connection.
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useNotificationActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: notifyKeys.all });
  return {
    markRead: useMutation({ mutationFn: (ids: string[]) => markRead(ids), onSuccess: refresh }),
    markAllRead: useMutation({ mutationFn: markAllRead, onSuccess: refresh }),
    archive: useMutation({ mutationFn: (ids: string[]) => archiveNotifications(ids), onSuccess: refresh }),
  };
}

/**
 * Subscribe once (the header bell mounts it) to this user's notifications.
 * `onNew` gets each newly inserted notification, already resolved to its
 * Desktop link.
 */
export function useNotificationRealtime(onNew?: (item: NotificationItem) => void) {
  const { userId } = useAuthUserId();
  const queryClient = useQueryClient();
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notify-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "notify", table: "notifications", filter: `recipient_user_id=eq.${userId}` },
        async (payload) => {
          queryClient.invalidateQueries({ queryKey: notifyKeys.all });
          if (payload.eventType !== "INSERT" || !onNewRef.current) return;
          const id = (payload.new as { id?: string })?.id;
          if (!id) return;
          // The row itself has no Desktop link; the list function resolves it.
          try {
            const latest = await listNotifications({ limit: 10 });
            const item = latest.find((n) => n.id === id);
            if (item) onNewRef.current?.(item);
          } catch {
            // the inbox still refreshes; only the toast is lost
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}

/** Dock/launcher badge = unread count (Electron only; a no-op in a browser). */
export function useUnreadBadge(count: number | undefined) {
  useEffect(() => {
    if (count === undefined) return;
    void window.electronAPI?.setBadgeCount?.(count);
  }, [count]);
}

/** Clicking an OS notification opens its screen. */
export function useNotificationOpenRoute(navigate: (route: string) => void) {
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    const off = window.electronAPI?.onNotificationOpen?.((route) => navigateRef.current(route));
    return () => off?.();
  }, []);
}

/** True when the app window has focus (a browser tab: when it is visible and focused). */
export async function isAppFocused(): Promise<boolean> {
  if (window.electronAPI?.isWindowFocused) {
    try {
      return await window.electronAPI.isWindowFocused();
    } catch {
      return document.hasFocus();
    }
  }
  return document.visibilityState === "visible" && document.hasFocus();
}
