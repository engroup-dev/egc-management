import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import Dialog from "../../ui/Dialog";
import Button from "../../ui/Button";
import {
  useDrawingProjectName,
  useUploadDrawingVersion,
  type DrawingFolderRow,
} from "../../../hooks/operations/drawings/useProjectDrawings";
import { formatFileSize, MAX_FILE_MB } from "./drawingLabels";
import { standardDrawingFileName } from "./drawingFileName";

interface Props {
  projectId: string;
  folder: DrawingFolderRow;
  /** Every other folder of the project: candidates for "must comply". */
  otherFolders: DrawingFolderRow[];
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: (version: number, notified: number) => void;
}

const UploadVersionDialog = ({ projectId, folder, otherFolders, isOpen, onClose, onUploaded }: Props) => {
  const upload = useUploadDrawingVersion(projectId);
  const projectName = useDrawingProjectName(projectId, isOpen);
  const [file, setFile] = useState<File | null>(null);
  const [notify, setNotify] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setNotify([]);
      setProgress(0);
      setError(null);
    }
  }, [isOpen]);

  const pickFile = (picked: File | undefined) => {
    setError(null);
    if (!picked) return setFile(null);
    if (picked.size > MAX_FILE_MB * 1024 * 1024) {
      setFile(null);
      setError(`حجم الملف يتجاوز الحد المسموح (${MAX_FILE_MB} ميغابايت)`);
      return;
    }
    setFile(picked);
  };

  const toggle = (id: string) =>
    setNotify((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (!file) return setError("اختر ملفاً للرفع");
    setError(null);
    try {
      const result = await upload.mutateAsync({
        folderId: folder.id,
        file,
        notifyFolderIds: notify,
        onProgress: setProgress,
      });
      onUploaded?.(result.version, notify.length);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر رفع الملف");
    }
  };

  const close = () => {
    if (!upload.isPending) onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={close}>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">رفع إصدار جديد – {folder.name}</h2>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-center hover:border-primary">
          <Upload size={22} className="text-primary" />
          {file ? (
            <span className="text-sm">
              {projectName.data !== undefined && (
                <span className="block">
                  سيُحفظ باسم:{" "}
                  <b dir="ltr">
                    {standardDrawingFileName(projectName.data, folder.name, folder.next_version, file.name)}
                  </b>
                </span>
              )}
              <span className="block text-gray-500">
                {file.name} <span dir="ltr">({formatFileSize(file.size)})</span>
              </span>
            </span>
          ) : (
            <span className="text-sm text-gray-600">
              اختر ملفاً (الحد الأقصى {MAX_FILE_MB} ميغابايت)
            </span>
          )}
          <input
            type="file"
            className="hidden"
            disabled={upload.isPending}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </label>

        <div>
          <p className="mb-1 text-sm font-semibold">أنواع الخرائط التي يجب أن تلتزم بهذا التعديل</p>
          {otherFolders.length ? (
            <div className="flex flex-col">
              {otherFolders.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={notify.includes(f.id)}
                    disabled={upload.isPending}
                    onChange={() => toggle(f.id)}
                  />
                  {f.name}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">لا توجد أنواع خرائط أخرى في هذا المشروع لإشعارها.</p>
          )}
        </div>

        {upload.isPending && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {progress < 1 ? `جاري الرفع ${Math.round(progress * 100)}%` : "جاري الحفظ..."}
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close} disabled={upload.isPending}>
            إلغاء
          </Button>
          <Button type="button" onClick={submit} loading={upload.isPending} disabled={!file}>
            رفع الإصدار
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default UploadVersionDialog;
