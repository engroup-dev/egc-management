import React, { useState, useEffect, useRef, useMemo } from "react";
import { AlertOctagon, Check, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import {
  useNotificationFeed,
  useNotificationActions,
} from "../../hooks/notifications/useNotifications";
import type { NotificationItem } from "../../services/notifications/notifyApi";

/**
 * Checks if a notification represents a penalty or monetary deduction.
 */
export function isPenaltyNotification(item?: NotificationItem | null): boolean {
  if (!item) return false;
  const event = String(item.event_key ?? "").toLowerCase();
  const title = String(item.title ?? "");
  const body = String(item.body ?? "");

  return (
    event.includes("penalty") ||
    event.includes("deduction") ||
    event.includes("fine") ||
    title.includes("غرامة") ||
    title.includes("خصم") ||
    body.includes("غرامة") ||
    body.includes("خصم") ||
    ((item.category === "finance" || item.category === "contracts") && item.priority === "critical")
  );
}

/**
 * Plays a distinctive, non-intrusive attention tone for critical alerts
 * using the Web Audio API (works offline, zero external file dependencies).
 */
function playPenaltyAlertTone() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Alert sequence: 440Hz -> 660Hz -> 880Hz
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.46);
  } catch {
    // Ignore audio autoplay restrictions if user hasn't interacted yet
  }
}

/**
 * CriticalPenaltyBanner:
 * A prominent, persistent sticky red alert banner displayed at the top of the app
 * whenever the authenticated user has an unacknowledged/unread penalty or deduction.
 * It will NOT disappear until the user clicks "تأكيد العلم والمشاهدة (تمام)".
 */
export default function CriticalPenaltyBanner() {
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [justAcknowledgedId, setJustAcknowledgedId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const hasPlayedSoundRef = useRef<boolean>(false);

  // Fetch unread notifications
  const { data: feedData } = useNotificationFeed({ unreadOnly: true, pageSize: 20 });
  const { markRead } = useNotificationActions();

  // Extract all unread penalties safely
  const unreadPenalties = useMemo(() => {
    try {
      if (!feedData || !Array.isArray(feedData.pages)) return [];
      const allUnread = feedData.pages.flat();
      if (!Array.isArray(allUnread)) return [];
      return allUnread.filter(
        (n) => n && isPenaltyNotification(n) && !n.read_at && !acknowledgedIds.has(n.id)
      );
    } catch (e) {
      console.warn("Failed to compute unread penalties:", e);
      return [];
    }
  }, [feedData, acknowledgedIds]);

  // Adjust current index if list shrinks
  useEffect(() => {
    if (currentIndex >= unreadPenalties.length && unreadPenalties.length > 0) {
      setCurrentIndex(unreadPenalties.length - 1);
    }
  }, [unreadPenalties.length, currentIndex]);

  // Play alert sound when a new penalty appears
  useEffect(() => {
    if (unreadPenalties.length > 0 && !hasPlayedSoundRef.current) {
      playPenaltyAlertTone();
      hasPlayedSoundRef.current = true;
    } else if (unreadPenalties.length === 0) {
      hasPlayedSoundRef.current = false;
    }
  }, [unreadPenalties.length]);

  if (unreadPenalties.length === 0 && !justAcknowledgedId) {
    return null;
  }

  // Temporary acknowledgment success animation
  if (justAcknowledgedId && unreadPenalties.length === 0) {
    return (
      <aside
        aria-label="تأكيد استلام الغرامة"
        className="w-full bg-emerald-600 text-white px-4 py-2.5 shadow-md flex items-center justify-center gap-2 text-xs font-semibold animate-fade-in"
      >
        <Check size={16} className="text-white" />
        <span>تم تأكيد إقرارك بالعلم والمشاهدة بنجاح، شُكراً لك.</span>
      </aside>
    );
  }

  const currentPenalty = unreadPenalties[currentIndex] ?? unreadPenalties[0];
  if (!currentPenalty) return null;

  const handleAcknowledge = () => {
    const id = currentPenalty.id;
    setJustAcknowledgedId(id);
    setAcknowledgedIds((prev) => new Set(prev).add(id));

    // Save acknowledgment to backend (records read_at timestamp in Supabase DB)
    markRead.mutate([id], {
      onSuccess: () => {
        setTimeout(() => {
          setJustAcknowledgedId((curr) => (curr === id ? null : curr));
        }, 3000);
      },
    });
  };

  return (
    <aside
      aria-label="تنبيه غرامة عاجل"
      className="w-full bg-gradient-to-r from-red-700 via-rose-700 to-red-800 text-white shadow-xl border-b-2 border-red-900 transition-all duration-300 relative z-30"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-6">
        {/* Warning Icon & Details */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="relative mt-0.5 shrink-0">
            <div className="h-9 w-9 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/25 shadow-inner">
              <ShieldAlert className="text-white h-5 w-5 animate-pulse" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-bold text-white tracking-wide uppercase border border-white/30">
                <AlertOctagon size={12} className="text-amber-300" />
                تنبيه إداري عاجل
              </span>
              <h3 className="text-sm sm:text-base font-bold text-white truncate">
                {currentPenalty.title || "تم تسجيل خصم / غرامة مالية بحقك"}
              </h3>
              {unreadPenalties.length > 1 && (
                <span className="text-[11px] bg-red-900/60 text-red-200 px-2 py-0.5 rounded-md font-medium">
                  {currentIndex + 1} من {unreadPenalties.length}
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-red-100/90 leading-relaxed font-normal whitespace-pre-line line-clamp-2">
              {currentPenalty.body || "يرجى الاطلاع على تفاصيل المخالفة وتأكيد العلم."}
            </p>
          </div>
        </div>

        {/* Action Controls: Carousel switch + Acknowledgment Button */}
        <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto justify-end pt-1 md:pt-0 border-t md:border-t-0 border-white/10">
          {unreadPenalties.length > 1 && (
            <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5 border border-white/15">
              <button
                type="button"
                onClick={() =>
                  setCurrentIndex((prev) => (prev > 0 ? prev - 1 : unreadPenalties.length - 1))
                }
                title="السابق"
                className="p-1 rounded text-white/80 hover:text-white hover:bg-white/15 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentIndex((prev) => (prev < unreadPenalties.length - 1 ? prev + 1 : 0))
                }
                title="التالي"
                className="p-1 rounded text-white/80 hover:text-white hover:bg-white/15 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={markRead.isPending}
            className="flex items-center justify-center gap-2 bg-white text-red-800 hover:bg-red-50 active:bg-red-100 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all duration-150 transform active:scale-95 disabled:opacity-75 disabled:pointer-events-none cursor-pointer"
          >
            <Check size={16} className="text-emerald-700 stroke-[3]" />
            <span>تأكيد العلم والمشاهدة (تمام)</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
