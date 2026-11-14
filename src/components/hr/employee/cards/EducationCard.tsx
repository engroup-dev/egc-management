import { Edit } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FullEmployee } from "../../../../types/extended.type";

type CertificationRow = {
  id?: string;
  certification: string;
};

export type EducationValues = {
  employee_certifications: CertificationRow[];
};

interface EducationCardProps {
  employee: FullEmployee;
  onSave?: (data: EducationValues) => Promise<void> | void;
}

const EducationCard = ({ employee, onSave }: EducationCardProps) => {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const initialValues = useMemo<EducationValues>(() => {
    const certs =
      (employee.employee_certifications as
        | CertificationRow[]
        | null
        | undefined) ?? [];

    return {
      employee_certifications: certs.map((c) => ({
        id: c.id,
        certification: c.certification ?? "",
      })),
    };
  }, [employee.employee_certifications]);

  const [formData, setFormData] = useState<EducationValues>(initialValues);

  useEffect(() => {
    setFormData(initialValues);
  }, [initialValues]);

  const updateCert = (idx: number, value: string) => {
    setFormData((prev) => {
      const next = [...prev.employee_certifications];
      next[idx] = { ...next[idx], certification: value };
      return { ...prev, employee_certifications: next };
    });
  };

  const addCert = () => {
    setFormData((prev) => ({
      ...prev,
      employee_certifications: [
        ...prev.employee_certifications,
        { certification: "" },
      ],
    }));
  };

  const removeCert = (idx: number) => {
    setFormData((prev) => {
      const next = [...prev.employee_certifications];
      next.splice(idx, 1);
      return { ...prev, employee_certifications: next };
    });
  };

  const handleCancel = () => {
    setFormData(initialValues);
    setEditMode(false);
  };

  const handleSave = async () => {
    if (!onSave) {
      setEditMode(false);
      return;
    }

    try {
      setSaving(true);
      await onSave(formData); // ✅ await update + refetch
      setEditMode(false); // ✅ close only on success
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border">
      <div className="flex justify-between items-start">
        <h4 className="text-md font-medium text-gray-800">التعليم</h4>

        {!editMode ? (
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={() => setEditMode(true)}
            aria-label="Edit education"
          >
            <Edit className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-md bg-green-600 text-white text-sm disabled:opacity-50"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "..." : "حفظ"}
            </button>

            <button
              className="px-3 py-1 rounded-md bg-gray-100 text-sm disabled:opacity-50"
              disabled={saving}
              onClick={handleCancel}
            >
              إلغاء
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4 text-sm text-gray-700">
        {formData.employee_certifications.length > 0 ? (
          formData.employee_certifications.map((ed, idx) => (
            <div key={ed.id ?? idx} className="p-4 bg-gray-50 rounded-md">
              {editMode ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 w-full border rounded px-2 py-1 text-sm"
                      value={ed.certification ?? ""}
                      onChange={(e) => updateCert(idx, e.target.value)}
                      disabled={saving}
                    />
                    <button
                      className="text-sm text-red-600 px-2 py-1 disabled:opacity-50"
                      onClick={() => removeCert(idx)}
                      disabled={saving}
                      aria-label="حذف"
                      type="button"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-semibold">
                    {ed.certification || "غير محدد"}
                  </div>
                  {/* Replace this static line with real fields if you have them */}
                  {/* <div className="text-xs text-gray-500 mt-2">GPA 3.3 • 2025</div> */}
                </>
              )}
            </div>
          ))
        ) : (
          <div className="text-gray-400">لا يوجد شهادات تعليمية</div>
        )}

        {editMode && (
          <div className="mt-3">
            <button
              className="px-3 py-1 rounded-md bg-primary text-white text-sm disabled:opacity-50"
              onClick={addCert}
              disabled={saving}
              type="button"
            >
              أضف شهادة
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EducationCard;
