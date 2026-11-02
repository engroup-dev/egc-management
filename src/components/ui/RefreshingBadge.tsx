import { RefreshCw } from "lucide-react";

/**
 * Shown next to money figures while they are being re-checked against
 * the server. The numbers on screen come from the local cache until the
 * refresh lands, so the user knows they may be about to change.
 */
export default function RefreshingBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
      dir="rtl"
    >
      <RefreshCw className="h-3 w-3 animate-spin" />
      يتم التحديث…
    </span>
  );
}
