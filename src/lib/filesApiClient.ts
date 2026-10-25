import { supabase } from "./supabaseClient";

const FILES_API_URL =
  (import.meta.env.VITE_FILES_API_URL as string | undefined) ??
  "https://files.engroup.ly";

/**
 * Client for the EGC files service (its own repo, files-service-egc), which keeps drawing
 * files on the EGC server. Every request carries the user's Supabase access
 * token; the service passes it on to Supabase, so the database decides what
 * the user may upload, download or delete.
 */
async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("انتهت الجلسة، يرجى تسجيل الدخول من جديد");
  return token;
}

async function messageFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.message === "string") return body.message;
  } catch {
    // not JSON
  }
  return fallback;
}

const NETWORK_ERROR = "تعذر الاتصال بخادم الملفات";

export async function filesApiDelete(path: string): Promise<void> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${FILES_API_URL}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  if (!res.ok) throw new Error(await messageFrom(res, "تعذر الحذف"));
}

/**
 * Uploads one file as multipart/form-data. Uses XMLHttpRequest rather than
 * fetch so a 100 MB drawing can report progress (0–1).
 */
export async function filesApiUpload<T>(
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  const token = await accessToken();
  const body = new FormData();
  body.append("file", file, file.name);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${FILES_API_URL}${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "json";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new Error(NETWORK_ERROR));
    xhr.onload = () => {
      const response = xhr.response as { message?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response as T);
      } else {
        reject(new Error(response?.message ?? "تعذر رفع الملف"));
      }
    };
    xhr.send(body);
  });
}

/** Downloads a file and hands it to the browser/Electron save flow. */
export async function filesApiDownload(path: string, fileName: string): Promise<void> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${FILES_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  if (!res.ok) throw new Error(await messageFrom(res, "تعذر تنزيل الملف"));

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}
