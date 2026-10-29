import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agreementsDb } from "../../lib/agreementsDb";
import { supabase } from "../../lib/supabaseClient";
import { uploadFile } from "../../lib/storage-client";
import { TIERS } from "../../lib/queryClient";
import { normalizePhone } from "../../utils/agreements/rules";
import { useAuthUserId } from "../permissions/useCan";
import type {
  AgreementDetail,
  AgreementItemInput,
  AgreementSummary,
  ContractorProjectMoney,
  PaymentMethod,
  PaymentPreview,
  PenaltyRow,
  ProjectOldMoney,
  Unit,
} from "../../types/agreements.types";

// =====================================================================
// Agreements, their payments, and penalties — every read and write.
// =====================================================================
// Same functions the field app calls (plans/agreements/migrations/
// 02_functions.sql), so both apps show the same numbers. Each read is one
// call that already carries names and totals. Every save invalidates the
// whole "agreements" prefix, so lists, totals and the pay form refresh.
// =====================================================================

/** The database raises its refusals in Arabic, ready to show as-is. */
export function agreementErrorMessage(err: unknown): string {
  const message = (err as { message?: string } | null)?.message;
  return message?.trim() || "حدث خطأ، حاول مرة أخرى";
}

async function rpcOrThrow<T>(label: string, call: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await call;
  if (error) {
    console.error(`${label} error:`, error);
    throw error;
  }
  return data;
}

const keys = {
  all: (uid: string) => ["agreements", uid] as const,
  project: (uid: string, projectId: string) => ["agreements", uid, "project", projectId] as const,
  detail: (uid: string, id: string) => ["agreements", uid, "detail", id] as const,
  preview: (uid: string, id: string) => ["agreements", uid, "preview", id] as const,
  penalties: (uid: string, projectId: string | null) =>
    ["agreements", uid, "penalties", projectId ?? "all"] as const,
  contractorMoney: (uid: string, projectId: string, contractorId: string) =>
    ["agreements", uid, "contractor-money", projectId, contractorId] as const,
  oldMoney: (uid: string, projectId: string) => ["agreements", uid, "old-money", projectId] as const,
};

// ─── Reads ───────────────────────────────────────────────────────────────────

export function useProjectAgreements(projectId: string) {
  const { userId } = useAuthUserId();
  return useQuery({
    queryKey: keys.project(userId ?? "", projectId),
    enabled: !!userId && !!projectId,
    queryFn: async () =>
      (await rpcOrThrow(
        "project_agreements",
        agreementsDb.schema("contracts").rpc("project_agreements", { p_project_id: projectId }),
      )) as AgreementSummary[],
  });
}

export function useAgreementDetail(agreementId: string | null) {
  const { userId } = useAuthUserId();
  return useQuery({
    queryKey: keys.detail(userId ?? "", agreementId ?? ""),
    enabled: !!userId && !!agreementId,
    queryFn: async () =>
      (await rpcOrThrow(
        "agreement_detail",
        agreementsDb.schema("contracts").rpc("agreement_detail", { p_agreement_id: agreementId ?? "" }),
      )) as AgreementDetail | null,
  });
}

export function usePaymentPreview(agreementId: string | null) {
  const { userId } = useAuthUserId();
  return useQuery({
    queryKey: keys.preview(userId ?? "", agreementId ?? ""),
    enabled: !!userId && !!agreementId,
    ...TIERS.C,
    queryFn: async () =>
      (await rpcOrThrow(
        "agreement_payment_preview",
        agreementsDb
          .schema("contracts")
          .rpc("agreement_payment_preview", { p_agreement_id: agreementId ?? "" }),
      )) as PaymentPreview | null,
  });
}

/** One project's penalties, or every project's when projectId is null. */
export function usePenalties(projectId: string | null) {
  const { userId } = useAuthUserId();
  return useQuery({
    queryKey: keys.penalties(userId ?? "", projectId),
    enabled: !!userId,
    queryFn: async () =>
      (await rpcOrThrow(
        "penalties_list",
        agreementsDb.schema("contracts").rpc("penalties_list", { p_project_id: projectId }),
      )) as PenaltyRow[],
  });
}

/** What a contractor already took in this project as expenses (the old
 * way) — the new-agreement form's banner, placeholder and minimum total. */
export function useContractorProjectMoney(projectId: string, contractorId: string | null) {
  const { userId } = useAuthUserId();
  return useQuery({
    queryKey: keys.contractorMoney(userId ?? "", projectId, contractorId ?? ""),
    enabled: !!userId && !!projectId && !!contractorId,
    ...TIERS.C,
    queryFn: async () =>
      (await rpcOrThrow(
        "contractor_project_money",
        agreementsDb.schema("contracts").rpc("contractor_project_money", {
          p_project_id: projectId,
          p_contractor_id: contractorId ?? "",
        }),
      )) as ContractorProjectMoney,
  });
}

/** Contractors who took money here and have no agreement yet, and every
 * old expense payment to a contractor here. */
export function useProjectOldMoney(projectId: string) {
  const { userId } = useAuthUserId();
  return useQuery({
    queryKey: keys.oldMoney(userId ?? "", projectId),
    enabled: !!userId && !!projectId,
    queryFn: async () =>
      (await rpcOrThrow(
        "project_old_money",
        agreementsDb.schema("contracts").rpc("project_old_money", { p_project_id: projectId }),
      )) as ProjectOldMoney,
  });
}

/** Units of measurement (lookups.units). activeOnly: what item rows may pick. */
export function useUnits(activeOnly = true) {
  return useQuery({
    queryKey: ["lookups", "units", activeOnly ? "active" : "all"],
    queryFn: async (): Promise<Unit[]> => {
      let q = agreementsDb
        .schema("lookups")
        .from("units")
        .select("id, name, sort_order, is_active")
        .order("sort_order")
        .order("name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Writes ──────────────────────────────────────────────────────────────────

function useInvalidateAgreements() {
  const { userId } = useAuthUserId();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all(userId ?? "") });
}

/** Public URL of an attachment's file (bucket "attachments" is public). */
export const attachmentUrl = (path: string) =>
  supabase.storage.from("attachments").getPublicUrl(path).data.publicUrl;

export type AgreementFormValues = {
  title: string;
  description: string;
  note: string;
  changeNote: string;
  items: AgreementItemInput[];
};

function cleanItems(items: AgreementItemInput[]): AgreementItemInput[] {
  return items.map((i) => ({
    ...(i.id ? { id: i.id } : {}),
    description: i.description.trim(),
    quantity: i.quantity,
    unit_id: i.unit_id,
    unit_price: i.unit_price,
    note: i.note?.trim() || null,
  }));
}

/** Uploads files to a record; returns how many failed (the record stays). */
async function uploadFiles(entityType: "agreement" | "contractor_penalty", entityId: string, files: File[]) {
  let failed = 0;
  for (const file of files) {
    try {
      await uploadFile({ file, entityType, entityId });
    } catch (err) {
      console.error(`${entityType} attachment upload error:`, err);
      failed += 1;
    }
  }
  return failed;
}

/** Creates the agreement, then uploads its attachments (photos, PDF). */
export function useCreateAgreement(projectId: string) {
  const invalidate = useInvalidateAgreements();
  return useMutation({
    mutationFn: async (
      v: AgreementFormValues & { contractorId: string; contractorPhone: string; files: File[] },
    ) => {
      const agreementId = (await rpcOrThrow(
        "create_agreement",
        agreementsDb.schema("contracts").rpc("create_agreement", {
          p_project_id: projectId,
          p_contractor_id: v.contractorId,
          p_title: v.title.trim(),
          p_description: v.description.trim() || null,
          p_note: v.note.trim() || null,
          p_items: cleanItems(v.items),
          // only saved by the database when the contractor has no phone
          p_contractor_phone: normalizePhone(v.contractorPhone) || null,
        }),
      )) as string;
      const failedFiles = await uploadFiles("agreement", agreementId, v.files);
      return { agreementId, failedFiles };
    },
    onSuccess: invalidate,
  });
}

/** Adds attachments to an existing agreement (anytime; never deleted). */
export function useAddAgreementFiles(agreementId: string) {
  const invalidate = useInvalidateAgreements();
  return useMutation({
    mutationFn: async (files: File[]) => ({ failedFiles: await uploadFiles("agreement", agreementId, files) }),
    onSuccess: invalidate,
  });
}

export function useEditAgreement(agreementId: string) {
  const invalidate = useInvalidateAgreements();
  return useMutation({
    mutationFn: async (v: AgreementFormValues) =>
      (await rpcOrThrow(
        "edit_agreement",
        agreementsDb.schema("contracts").rpc("edit_agreement", {
          p_agreement_id: agreementId,
          p_title: v.title.trim(),
          p_description: v.description.trim() || null,
          p_note: v.note.trim() || null,
          p_items: cleanItems(v.items),
          p_change_note: v.changeNote.trim() || null,
        }),
      )) as number,
    onSuccess: invalidate,
  });
}

export function useCreateAgreementPayment(agreementId: string) {
  const invalidate = useInvalidateAgreements();
  return useMutation({
    mutationFn: async (v: {
      amount: number;
      reason: string;
      method: PaymentMethod;
      bankName: string;
      bankNumber: string;
      bankHolderName: string;
    }) => {
      const bank = v.method === "bank";
      return (await rpcOrThrow(
        "create_agreement_payment",
        agreementsDb.schema("contracts").rpc("create_agreement_payment", {
          p_agreement_id: agreementId,
          p_amount: v.amount,
          p_reason: v.reason.trim() || null,
          p_method: v.method,
          p_bank_name: bank ? v.bankName.trim() : null,
          p_bank_number: bank ? v.bankNumber.trim() : null,
          p_bank_holder_name: bank ? v.bankHolderName.trim() : null,
        }),
      )) as string;
    },
    onSuccess: invalidate,
  });
}

/**
 * Records the penalty, then uploads its photos. A photo that fails to
 * upload doesn't undo the penalty: the result says how many failed.
 */
export function useCreatePenalty(projectId: string) {
  const invalidate = useInvalidateAgreements();
  return useMutation({
    mutationFn: async (v: { contractorId: string; amount: number; reason: string; photos: File[] }) => {
      const penaltyId = (await rpcOrThrow(
        "create_penalty",
        agreementsDb.schema("contracts").rpc("create_penalty", {
          p_project_id: projectId,
          p_contractor_id: v.contractorId,
          p_amount: v.amount,
          p_reason: v.reason.trim(),
        }),
      )) as string;
      const failedPhotos = await uploadFiles("contractor_penalty", penaltyId, v.photos);
      return { penaltyId, failedPhotos };
    },
    onSuccess: invalidate,
  });
}

/** Cancels a penalty before a payment deducts it (reason required). */
export function useCancelPenalty() {
  const invalidate = useInvalidateAgreements();
  return useMutation({
    mutationFn: async (v: { penaltyId: string; reason: string }) => {
      await rpcOrThrow(
        "cancel_penalty",
        agreementsDb
          .schema("contracts")
          .rpc("cancel_penalty", { p_penalty_id: v.penaltyId, p_reason: v.reason.trim() }),
      );
    },
    onSuccess: invalidate,
  });
}
