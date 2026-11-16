// =====================================================================
// Text rules for agreements, payments and penalties
// =====================================================================
// The same limits the database enforces (plans/agreements/migrations/
// 05_round2.sql, contracts._text). The forms check them first so the user
// sees a live counter and the reason the save button is disabled, instead
// of a refusal after pressing it. Kept identical to
// Fields/utils/agreements/rules.ts.
// =====================================================================

export const LIMITS = {
  title: { min: 10, max: 80, label: "عنوان الاتفاقية" },
  description: { min: 30, max: 500, label: "وصف الاتفاقية" },
  item: { min: 5, max: 120, label: "وصف البند" },
  penaltyReason: { min: 15, max: 300, label: "سبب الغرامة" },
  paymentReason: { min: 15, max: 300, label: "سبب الدفعة" },
  paymentChangeNote: { min: 5, max: 300, label: "سبب التعديل" },
  cancelReason: { min: 15, max: 300, label: "سبب الإلغاء" },
  note: { min: 0, max: 300, label: "الملاحظة" },
} as const;

export type LimitKey = keyof typeof LIMITS;

/** Trimmed length — what the database counts. */
export const textLength = (value: string | null | undefined) => (value ?? "").trim().length;

/** True while the text is outside its limits (an empty optional note is fine). */
export function isOutOfRange(value: string | null | undefined, key: LimitKey) {
  const { min, max } = LIMITS[key];
  const n = textLength(value);
  if (n === 0) return min > 0;
  return n < min || n > max;
}

/** The Arabic reason a text is refused, or null when it's fine. */
export function lengthError(value: string | null | undefined, key: LimitKey): string | null {
  const { min, max, label } = LIMITS[key];
  const n = textLength(value);
  if (n === 0) return min > 0 ? `اكتب ${label}` : null;
  if (n < min) return `${label} قصير — ${min} حرفاً على الأقل (الآن ${n})`;
  if (n > max) return `${label} طويل — ${max} حرفاً على الأكثر (الآن ${n})`;
  return null;
}

/** "12 / 80" for the field's counter. */
export const counterText = (value: string | null | undefined, key: LimitKey) =>
  `${textLength(value)} / ${LIMITS[key].max}`;

/** The phone as it's saved: trimmed, Arabic-Indic digits made Latin. */
export const normalizePhone = (value: string | null | undefined) =>
  (value ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim();

/** 9–15 digits; spaces and a leading + are allowed. */
export function isValidPhone(value: string | null | undefined) {
  return /^[0-9]{9,15}$/.test(normalizePhone(value).replace(/[\s+]/g, ""));
}
