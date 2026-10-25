import { z } from "zod";

export const DrawingStatusSchema = z.object({
  status: z.enum(["ok", "design", "modification"]),
  note: z.string().trim().max(500, "الملاحظة طويلة جداً").optional(),
});

export type DrawingStatusFormValues = z.infer<typeof DrawingStatusSchema>;

export const AddDrawingFolderSchema = z.object({
  mapTypeId: z.string().min(1, "اختر نوع الخريطة"),
});

export type AddDrawingFolderFormValues = z.infer<typeof AddDrawingFolderSchema>;
