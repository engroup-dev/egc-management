import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { supabase } from "../../lib/supabaseClient";
import { agreementsDb } from "../../lib/agreementsDb";
import { fetchManagementApi } from "../../lib/managementApiClient";
import { attachmentUrl } from "./useAgreements";
import type { AgreementDetail, AgreementItem, PenaltyRow } from "../../types/agreements.types";
import {
  changesInVersion,
  currentItems,
  headerChanges,
  itemsAtVersion,
  PAYMENT_STATUS,
  PENALTY_STATUS,
} from "../../utils/agreements/versions";
import { formatDate as formatDateAr } from "../../utils/helpper";

// ar-LY dates carry invisible right-to-left marks; the PDF wants plain text.
const formatDate = (value: string | null | undefined) => formatDateAr(value).replace(/[\u200e\u200f]/g, "");

// =====================================================================
// Agreement PDFs (pdf-service)
// =====================================================================
//   agreement/pdf       — the agreement: header + current items
//   agreement/full/pdf  — + summary, every version's changes, payments,
//                         old expense payments, penalties
// Labels (statuses, method) are sent ready to print; dates formatted.
// =====================================================================

const fullName = (e?: { first_name: string; last_name: string | null } | null) =>
  e ? `${e.first_name} ${e.last_name ?? ""}`.trim() : null;

const line = (i: AgreementItem) => ({
  quantity: Number(i.quantity) || 0,
  unit_name: i.unit_name,
  unit_price: Number(i.unit_price) || 0,
  total: Number(i.price) || 0,
});

async function agreementBlock(detail: AgreementDetail) {
  const a = detail.agreement;
  const { data: contractor } = await supabase
    .from("contractors")
    .select("phone_number")
    .eq("id", a.contractor_id)
    .maybeSingle();
  return {
    title: a.title,
    project_name: a.project_name,
    contractor_name: a.contractor_name,
    contractor_phone: contractor?.phone_number ?? null,
    description: a.description,
    note: a.note,
    version: a.current_version,
    created_at: formatDate(a.created_at),
    created_by_name: a.created_by_name,
    updated_at: a.updated_at ? formatDate(a.updated_at) : null,
    currency: "LYD",
    total: Number(a.total) || 0,
    items: currentItems(detail.items).map((i, n) => ({
      no: n + 1,
      description: i.description,
      ...line(i),
      note: i.note,
    })),
  };
}

async function fullBody(detail: AgreementDetail) {
  const a = detail.agreement;
  const paymentIds = detail.payments.map((p) => p.id);

  const [agreement, approvals, penalties, expenses] = await Promise.all([
    agreementBlock(detail),
    paymentIds.length
      ? supabase.schema("contracts").from("payments").select("id, approved_by, approved_at").in("id", paymentIds)
      : Promise.resolve({ data: [], error: null }),
    agreementsDb.schema("contracts").rpc("penalties_list", { p_project_id: a.project_id }),
    a.opening_paid > 0
      ? supabase
          .from("expense_payments")
          .select(
            "serial_number, payment_no, amount, created_at, project_expenses!inner(serial_number, description, project_id, contractor_id, deleted_at)",
          )
          .eq("project_expenses.project_id", a.project_id)
          .eq("project_expenses.contractor_id", a.contractor_id)
          .is("project_expenses.deleted_at", null)
          .lte("created_at", a.created_at)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (approvals.error) throw approvals.error;
  if (penalties.error) throw penalties.error;
  if (expenses.error) throw expenses.error;

  const approverIds = [...new Set((approvals.data ?? []).map((r) => r.approved_by).filter(Boolean))] as string[];
  const { data: approvers, error: approversError } = approverIds.length
    ? await supabase.from("employees").select("id, first_name, last_name").in("id", approverIds)
    : { data: [], error: null };
  if (approversError) throw approversError;
  const approverName = new Map((approvers ?? []).map((e) => [e.id, fullName(e)]));
  const approvalOf = new Map((approvals.data ?? []).map((r) => [r.id, r]));

  // the version each payment was made against: the latest one before it
  const versionAt = (at: string) =>
    detail.versions.filter((v) => v.created_at <= at).reduce((n, v) => Math.max(n, v.version_no), 1);

  const contractorPenalties = ((penalties.data ?? []) as PenaltyRow[]).filter(
    (x) => x.contractor_id === a.contractor_id,
  );

  return {
    agreement,
    summary: {
      total: Number(a.total) || 0,
      opening_paid: Number(a.opening_paid) || 0,
      paid: Number(a.paid) || 0,
      pending: Number(a.pending) || 0,
      remaining: Number(a.remaining) || 0,
      penalties_total: contractorPenalties
        .filter((x) => x.display_status !== "cancelled")
        .reduce((s, x) => s + (Number(x.amount) || 0), 0),
    },
    versions: detail.versions.map((v, idx) => {
      const prev = idx > 0 ? detail.versions[idx - 1] : null;
      return {
        version_no: v.version_no,
        created_at: formatDate(v.created_at),
        created_by_name: v.created_by_name,
        change_note: v.change_note,
        total: Number(v.total) || 0,
        // only on version 1: the original item list
        items: prev
          ? []
          : itemsAtVersion(detail.items, 1).map((i, n) => ({
              no: n + 1,
              description: i.description,
              ...line(i),
              note: i.note,
            })),
        header_changes: prev ? headerChanges(prev, v) : [],
        changes: prev
          ? changesInVersion(detail.items, v.version_no).map((c) => ({
              kind: c.kind,
              kind_label: { added: "مضاف", edited: "معدّل", removed: "محذوف" }[c.kind],
              description: c.item.description,
              before: c.kind === "added" ? null : line(c.kind === "edited" ? c.before : c.item),
              after: c.kind === "removed" ? null : line(c.item),
            }))
          : [],
      };
    }),
    payments: [...detail.payments]
      .sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map((p) => {
        const approval = approvalOf.get(p.id);
        return {
          payments_number: p.payments_number,
          created_at: formatDate(p.created_at),
          amount: Number(p.amount) || 0,
          penalty_amount: Number(p.penalty_amount) || 0,
          net: Number(p.grand_total ?? p.amount - p.penalty_amount) || 0,
          status: PAYMENT_STATUS[p.status]?.label ?? p.status,
          method: p.method === "bank" ? "بنك" : "نقداً",
          reason: p.payments_reason,
          agreement_version: versionAt(p.created_at),
          created_by_name: p.created_by_name,
          approved_by_name: approval?.approved_by ? (approverName.get(approval.approved_by) ?? null) : null,
          approved_at: approval?.approved_at ? formatDate(approval.approved_at) : null,
        };
      }),
    expense_payments: (expenses.data ?? []).map((e) => ({
      // "139.1" = expense 139, payment 1 — text, not a number
      serial_number: e.serial_number != null ? String(e.serial_number) : null,
      expense_serial_number: e.project_expenses?.serial_number ?? null,
      description: e.project_expenses?.description ?? null,
      payment_no: e.payment_no,
      amount: Number(e.amount) || 0,
      created_at: formatDate(e.created_at),
    })),
    penalties: contractorPenalties
      .sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map((x) => ({
        created_at: formatDate(x.created_at),
        amount: Number(x.amount) || 0,
        reason: x.reason,
        status: PENALTY_STATUS[x.display_status]?.label ?? x.display_status,
        payment_number: x.payment_number,
        created_by_name: x.created_by_name,
        cancel_reason: x.cancel_reason,
      })),
  };
}

async function appendAttachmentsToPdf(
  basePdfBytes: ArrayBuffer,
  attachments: AgreementDetail["attachments"],
): Promise<Uint8Array> {
  if (!attachments || attachments.length === 0) {
    return new Uint8Array(basePdfBytes);
  }

  const pdfDoc = await PDFDocument.load(basePdfBytes);

  for (const att of attachments) {
    try {
      const url = attachmentUrl(att.file_path);
      const res = await fetch(url);
      if (!res.ok) continue;

      const fileBuffer = await res.arrayBuffer();
      const bytes = new Uint8Array(fileBuffer);

      // PNG magic number: 89 50 4E 47
      const isPng =
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      // JPEG magic number: FF D8 FF
      const isJpg =
        bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      // PDF magic number: %PDF (25 50 44 46)
      const isPdf =
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46;

      if (isPdf) {
        const attachedPdf = await PDFDocument.load(fileBuffer);
        const copiedPages = await pdfDoc.copyPages(
          attachedPdf,
          attachedPdf.getPageIndices(),
        );
        copiedPages.forEach((p) => pdfDoc.addPage(p));
      } else if (isJpg || isPng) {
        const img = isPng
          ? await pdfDoc.embedPng(fileBuffer)
          : await pdfDoc.embedJpg(fileBuffer);

        const pageWidth = 595.28;
        const pageHeight = 841.89;
        const margin = 36;
        const maxWidth = pageWidth - margin * 2;
        const maxHeight = pageHeight - margin * 2;

        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const x = (pageWidth - drawWidth) / 2;
        const y = (pageHeight - drawHeight) / 2;

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(img, {
          x,
          y,
          width: drawWidth,
          height: drawHeight,
        });
      }
    } catch (err) {
      console.warn("Could not embed attachment in PDF:", att.file_name, err);
    }
  }

  return pdfDoc.save();
}

export function useAgreementPdf() {
  const [loading, setLoading] = useState<"agreement" | "full" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function print(kind: "agreement" | "full", detail: AgreementDetail) {
    setLoading(kind);
    setError(null);
    try {
      const body = kind === "full" ? await fullBody(detail) : { agreement: await agreementBlock(detail) };
      const res = await fetchManagementApi(
        kind === "full" ? "/api/v1/egc/management/agreement/full/pdf" : "/api/v1/egc/management/agreement/pdf",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      let blob: Blob;
      if (kind === "full" && detail.attachments && detail.attachments.length > 0) {
        const baseBuffer = await res.arrayBuffer();
        const mergedBytes = await appendAttachmentsToPdf(baseBuffer, detail.attachments);
        blob = new Blob([mergedBytes], { type: "application/pdf" });
      } else {
        blob = await res.blob();
      }

      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error("Error generating agreement PDF:", err);
      setError("فشل إنشاء ملف الاتفاقية: " + (err instanceof Error ? err.message : "خطأ غير معروف"));
    } finally {
      setLoading(null);
    }
  }

  return { print, loading, error };
}
