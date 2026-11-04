import React from "react";
import { Archive, Check, ShieldAlert } from "lucide-react";
import type { NotificationItem } from "../../services/notifications/notifyApi";
import { CATEGORY_LABELS, PRIORITY_DOT } from "../../config/notifications";
import { isPenaltyNotification } from "./CriticalPenaltyBanner";

// Arabic month names with Latin digits — the house rule (MyWorkPage.tsx).
const LOCALE = "ar-u-nu-latn";
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/** "قبل 5 دقائق", "أمس", or a date for anything older than a week. */
export function notificationTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "الآن";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
}

interface NotificationRowProps {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
  onArchive?: (item: NotificationItem) => void;
  compact?: boolean;
}

/** One notification: unread dot, title, text, when. Click opens its screen. */
export default function NotificationRow({ item, onOpen, onArchive, compact = false }: NotificationRowProps) {
  const unread = !item.read_at;
  const isPenalty = isPenaltyNotification(item);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(item);
      }}
      className={`group flex items-start gap-3 px-4 ${compact ? "py-2.5" : "py-3"} cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
        isPenalty && unread
          ? "bg-red-50/70 border-r-4 border-r-red-600 hover:bg-red-50"
          : isPenalty
            ? "bg-red-50/30 hover:bg-red-50/50"
            : unread
              ? "bg-blue-50/50 hover:bg-blue-50"
              : "hover:bg-gray-50"
      }`}
    >
      {isPenalty ? (
        <span className="mt-1 shrink-0 text-red-600" title="غرامة / خصم مالي">
          <ShieldAlert className="h-4 w-4 animate-pulse" />
        </span>
      ) : (
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? PRIORITY_DOT[item.priority] : "bg-transparent"}`}
          aria-label={unread ? "غير مقروء" : undefined}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-1.5 truncate">
            {isPenalty && (
              <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                غرامة مالية
              </span>
            )}
            <p className={`truncate text-sm ${unread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
              {item.title}
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-gray-400">{notificationTime(item.created_at)}</span>
        </div>

        <p className={`mt-0.5 whitespace-pre-line text-xs ${isPenalty ? "text-red-950 font-medium" : "text-gray-600"} ${compact ? "line-clamp-2" : ""}`}>
          {item.body}
        </p>

        <div className="mt-1 flex items-center justify-between">
          {!compact && (
            <span className="text-[11px] text-gray-400">{CATEGORY_LABELS[item.category] ?? item.category}</span>
          )}

          {isPenalty && unread && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(item);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 hover:text-red-900 bg-red-100/80 hover:bg-red-200/90 px-2 py-0.5 rounded transition-colors"
            >
              <Check className="h-3 w-3 stroke-[3]" />
              تأكيد العلم (تمام)
            </button>
          )}
        </div>
      </div>

      {onArchive && (
        <button
          type="button"
          title="أرشفة"
          onClick={(e) => {
            e.stopPropagation();
            onArchive(item);
          }}
          className="mt-0.5 shrink-0 rounded p-1 text-gray-300 opacity-0 transition hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
