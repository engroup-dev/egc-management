import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabaseClient";
import {
  filesApiDelete,
  filesApiDownload,
  filesApiUpload,
} from "../../../lib/filesApiClient";
import type { Json } from "../../../lib/supabase";
import { useAuthUserId } from "../../permissions/useCan";
import type {
  DrawingAccess,
  DrawingFolder,
  DrawingNotice,
  DrawingVersion,
  MapType,
} from "../../../types/global.type";

// =====================================================================
// PROJECT DRAWINGS — /operations/maps/project/:projectId
// =====================================================================
// One folder per map type (map_types) per project. Each folder holds
// numbered versions of a drawing file, a status, and "must comply"
// notices to and from other folders. Tables, RLS and RPCs live in the
// `drawings` schema: supabase/migrations/20261020120000_project_drawings.sql.
// PostgREST can't embed across schemas, so map type names and people's
// names are looked up in `public` with a second query by id.
//
// Files are NOT in Supabase Storage. Uploads, downloads and deletes go
// through the EGC files service (lib/filesApiClient.ts); everything else
// is plain Supabase. Permissions are decided by the database either way:
// drawings.my_caps() tells the UI what to show, and RLS / the RPCs
// enforce the same rules.
// =====================================================================

export type DrawingStatus = "ok" | "design" | "modification";

export interface FolderCaps {
  view: boolean;
  download: boolean;
  upload: boolean;
  edit: boolean;
}

export interface DrawingCaps {
  is_manager: boolean;
  folders: Record<string, FolderCaps>;
}

const NO_CAPS: FolderCaps = { view: false, download: false, upload: false, edit: false };
export const capsFor = (caps: DrawingCaps | undefined, folderId: string): FolderCaps =>
  caps?.folders[folderId] ?? NO_CAPS;

export interface DrawingFolderRow extends DrawingFolder {
  name: string;
  statusByName: string | null;
  latest: Pick<DrawingVersion, "id" | "version" | "created_at" | "file_name"> | null;
}

export interface DrawingVersionRow extends DrawingVersion {
  uploaderName: string | null;
}

export const drawingKeys = {
  all: (projectId: string) => ["project-drawings", projectId],
  caps: (projectId: string, userId: string | null) => ["project-drawings", projectId, "caps", userId ?? "anonymous"],
  folders: (projectId: string) => ["project-drawings", projectId, "folders"],
  notices: (projectId: string) => ["project-drawings", projectId, "notices"],
  versions: (projectId: string, folderId: string) => ["project-drawings", projectId, "versions", folderId],
  access: (projectId: string, folderId: string) => ["project-drawings", projectId, "access", folderId],
  projectName: (projectId: string) => ["project-drawings", projectId, "project-name"],
  mapTypes: ["project-drawings", "map-types"],
};

const drawings = () => supabase.schema("drawings");

type NameRow = { first_name: string | null; last_name: string | null } | null;
const personName = (u: NameRow) => (u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || null : null);

function toError(error: { message: string; code?: string }, fallback: string): Error {
  if (error.code === "23505") return new Error("نوع الخريطة هذا موجود بالفعل في المشروع");
  if (error.code === "42501") return new Error(error.message || "ليست لديك صلاحية لهذه العملية");
  return new Error(error.message || fallback);
}

const uniqueIds = (ids: (string | null)[]) => [...new Set(ids.filter((id): id is string => !!id))];

async function userNames(ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = uniqueIds(ids);
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from("users").select("id, first_name, last_name").in("id", unique);
  if (error) throw toError(error, "تعذر تحميل أسماء المستخدمين");
  return new Map((data ?? []).map((u) => [u.id, personName(u)]));
}

async function mapTypeNames(ids: string[]): Promise<Map<string, string>> {
  const unique = uniqueIds(ids);
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from("map_types").select("id, name").in("id", unique);
  if (error) throw toError(error, "تعذر تحميل أنواع الخرائط");
  return new Map((data ?? []).map((t) => [t.id, t.name]));
}

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

export function useMyDrawingCaps(projectId: string | undefined) {
  const { userId, resolved } = useAuthUserId();
  return useQuery({
    queryKey: drawingKeys.caps(projectId ?? "", userId),
    enabled: !!projectId && resolved && !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<DrawingCaps> => {
      const { data, error } = await drawings().rpc("my_caps", {
        p_project_id: projectId as string,
      });
      if (error) throw toError(error, "تعذر تحميل الصلاحيات");
      const caps = (data ?? {}) as Partial<DrawingCaps>;
      return { is_manager: !!caps.is_manager, folders: caps.folders ?? {} };
    },
  });
}

/** Every folder of the project the user takes part in, with its latest
 * version (when the user may view that folder). Sorted by name. */
export function useDrawingFolders(projectId: string | undefined) {
  return useQuery({
    queryKey: drawingKeys.folders(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<DrawingFolderRow[]> => {
      const { data: folders, error } = await drawings()
        .from("folders")
        .select("*")
        .eq("project_id", projectId as string);
      if (error) throw toError(error, "تعذر تحميل أنواع الخرائط");
      const rows = folders ?? [];

      const latest = new Map<string, DrawingFolderRow["latest"]>();
      const loadLatest = async () => {
        if (!rows.length) return;
        // RLS only returns versions of folders the user may view.
        const { data: versions, error: vError } = await drawings()
          .from("versions")
          .select("id, folder_id, version, created_at, file_name")
          .in("folder_id", rows.map((f) => f.id))
          .order("version", { ascending: false });
        if (vError) throw toError(vError, "تعذر تحميل الإصدارات");
        for (const v of versions ?? []) {
          if (!latest.has(v.folder_id)) latest.set(v.folder_id, v);
        }
      };
      const [names, people] = await Promise.all([
        mapTypeNames(rows.map((f) => f.map_type_id)),
        userNames(rows.map((f) => f.status_by)),
        loadLatest(),
      ]);

      return rows
        .map((f) => ({
          ...f,
          name: names.get(f.map_type_id) ?? "—",
          statusByName: f.status_by ? people.get(f.status_by) ?? null : null,
          latest: latest.get(f.id) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ar"));
    },
  });
}

/** Notices the user can see in this project (to or from a viewable folder). */
export function useDrawingNotices(projectId: string | undefined) {
  return useQuery({
    queryKey: drawingKeys.notices(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<DrawingNotice[]> => {
      const { data, error } = await drawings()
        .from("notices")
        .select("*")
        .eq("project_id", projectId as string)
        .order("created_at", { ascending: false });
      if (error) throw toError(error, "تعذر تحميل الإشعارات");
      return data ?? [];
    },
  });
}

export function useDrawingVersions(projectId: string | undefined, folderId: string | undefined) {
  return useQuery({
    queryKey: drawingKeys.versions(projectId ?? "", folderId ?? ""),
    enabled: !!projectId && !!folderId,
    queryFn: async (): Promise<DrawingVersionRow[]> => {
      const { data, error } = await drawings()
        .from("versions")
        .select("*")
        .eq("folder_id", folderId as string)
        .order("version", { ascending: false });
      if (error) throw toError(error, "تعذر تحميل الإصدارات");
      const people = await userNames((data ?? []).map((v) => v.uploaded_by));
      return (data ?? []).map((v) => ({
        ...v,
        uploaderName: v.uploaded_by ? people.get(v.uploaded_by) ?? null : null,
      }));
    },
  });
}

export function useFolderAccess(projectId: string | undefined, folderId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: drawingKeys.access(projectId ?? "", folderId ?? ""),
    enabled: enabled && !!projectId && !!folderId,
    queryFn: async (): Promise<DrawingAccess[]> => {
      const { data, error } = await drawings()
        .from("access")
        .select("*")
        .eq("folder_id", folderId as string);
      if (error) throw toError(error, "تعذر تحميل صلاحيات الوصول");
      return data ?? [];
    },
  });
}

/** The project's name, for previewing standard file names before upload. */
export function useDrawingProjectName(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: drawingKeys.projectName(projectId ?? ""),
    enabled: enabled && !!projectId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId as string)
        .maybeSingle();
      if (error) throw toError(error, "تعذر تحميل اسم المشروع");
      return data?.name ?? "";
    },
  });
}

/** The company-wide list a folder is picked from (Settings › الخرائط). */
export function useAllMapTypes(enabled = true) {
  return useQuery({
    queryKey: drawingKeys.mapTypes,
    enabled,
    queryFn: async (): Promise<MapType[]> => {
      const { data, error } = await supabase.from("map_types").select("*").order("name");
      if (error) throw toError(error, "تعذر تحميل أنواع الخرائط");
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------

function useInvalidateProject(projectId: string | undefined) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: drawingKeys.all(projectId ?? "") });
}

export function useAddDrawingFolder(projectId: string | undefined) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: async (mapTypeId: string) => {
      const { error } = await drawings()
        .from("folders")
        .insert({ project_id: projectId as string, map_type_id: mapTypeId });
      if (error) throw toError(error, "تعذر إضافة نوع الخريطة");
    },
    onSuccess: invalidate,
  });
}

export function useDeleteDrawingFolder(projectId: string | undefined) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: (folderId: string) => filesApiDelete(`/drawings/folders/${folderId}`),
    onSuccess: invalidate,
  });
}

export function useUploadDrawingVersion(projectId: string | undefined) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: ({
      folderId,
      file,
      notifyFolderIds,
      onProgress,
    }: {
      folderId: string;
      file: File;
      notifyFolderIds: string[];
      onProgress?: (fraction: number) => void;
    }) => {
      const query = notifyFolderIds.length ? `?notify=${notifyFolderIds.join(",")}` : "";
      return filesApiUpload<{ id: string; version: number }>(
        `/drawings/folders/${folderId}/versions${query}`,
        file,
        onProgress,
      );
    },
    onSuccess: invalidate,
  });
}

export function useDeleteDrawingVersion(projectId: string | undefined) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: (versionId: string) => filesApiDelete(`/drawings/versions/${versionId}`),
    onSuccess: invalidate,
  });
}

export function useDownloadDrawingVersion() {
  return useMutation({
    mutationFn: ({ versionId, fileName }: { versionId: string; fileName: string }) =>
      filesApiDownload(`/drawings/versions/${versionId}/file`, fileName),
  });
}

export function useSetDrawingStatus(projectId: string | undefined) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: async ({ folderId, status, note }: { folderId: string; status: DrawingStatus; note?: string }) => {
      const { error } = await drawings().rpc("set_status", {
        p_folder_id: folderId,
        p_status: status,
        p_note: note ?? undefined,
      });
      if (error) throw toError(error, "تعذر تحديث الحالة");
    },
    onSuccess: invalidate,
  });
}

export function useMarkNoticeComplied(projectId: string | undefined) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: async (noticeId: string) => {
      const { error } = await drawings().rpc("mark_complied", { p_notice_id: noticeId });
      if (error) throw toError(error, "تعذر تأكيد الالتزام");
    },
    onSuccess: invalidate,
  });
}

export interface AccessEntry {
  user_id: string;
  download: boolean;
  upload: boolean;
  edit: boolean;
}

export function useSetFolderAccess(projectId: string | undefined) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: async ({ folderId, entries }: { folderId: string; entries: AccessEntry[] }) => {
      const { error } = await drawings().rpc("set_access", {
        p_folder_id: folderId,
        p_entries: entries as unknown as Json,
      });
      if (error) throw toError(error, "تعذر حفظ صلاحيات الوصول");
    },
    onSuccess: invalidate,
  });
}
