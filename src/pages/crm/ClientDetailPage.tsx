import { useParams, Link } from "react-router-dom";
import { useClient, useClientProjects } from "../../hooks/useClients";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { useCan } from "../../hooks/permissions/useCan";
import LoadingPage from "../../components/ui/LoadingPage";
import ErrorPage from "../../components/ui/errorPage";
import { formatDate } from "../../utils/helpper";
import {
  User,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  FileText,
  Edit,
  Save,
  X,
  Loader2,
} from "lucide-react";

const ClientDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  // manage_clients already covers /crm/clients/new (issue 19 gap 4); this
  // is the description's other half — "وتعديل بياناتهم" — actually
  // enforced now instead of just documented. Deny while loading, same
  // convention as every other permission check: don't flash the edit
  // button before the answer is in.
  const { can: canManageClients, loading: checkingCanManage } =
    useCan("manage_clients");
  const queryClient = useQueryClient();
  const { projects, loadingProjects } = useClientProjects(id);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
  });

  if (!id) {
    return <div>Client ID is missing</div>;
  }

  const { client, error, loading } = useClient(id);

  // Initialize form data when client loads
  useEffect(() => {
    if (client) {
      setFormData({
        first_name: client.first_name || "",
        last_name: client.last_name || "",
        email: client.email || "",
        phone_number: client.phone_number || "",
      });
    }
  }, [client]);

  const handleSave = async () => {
    if (!id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email,
          phone_number: formData.phone_number,
        })
        .eq("id", id);

      if (error) throw error;

      // Refresh client data. Was a full window reload, which now would just
      // restore the old row from the persisted cache.
      await queryClient.invalidateQueries({ queryKey: ["crm"] });
      setEditMode(false);
    } catch (err) {
      console.error("Error updating client:", err);
      alert("حدث خطأ أثناء حفظ البيانات");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (client) {
      setFormData({
        first_name: client.first_name || "",
        last_name: client.last_name || "",
        email: client.email || "",
        phone_number: client.phone_number || "",
      });
    }
    setEditMode(false);
  };

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return <LoadingPage label="جاري تحميل بيانات العميل..." />;
  }

  if (error) {
    return (
      <ErrorPage error={error.message} label="خطأ في تحميل بيانات العميل" />
    );
  }

  if (!client) {
    return <ErrorPage error="العميل غير موجود" label="خطأ" />;
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-emerald-50 text-emerald-700 border-emerald-200",
      completed: "bg-blue-50 text-blue-700 border-blue-200",
      on_hold: "bg-amber-50 text-amber-700 border-amber-200",
      cancelled: "bg-red-50 text-red-700 border-red-200",
    };
    return colors[status] || "bg-gray-50 text-gray-700 border-gray-200";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <TrendingUp className="w-4 h-4" />;
      case "completed":
        return <CheckCircle2 className="w-4 h-4" />;
      case "on_hold":
        return <Clock className="w-4 h-4" />;
      case "cancelled":
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: "نشط",
      completed: "مكتمل",
      on_hold: "متوقف مؤقتاً",
      cancelled: "ملغي",
    };
    return labels[status] || status;
  };

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const completedProjects = projects.filter(
    (p) => p.status === "completed",
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-6 flex-1">
                {/* Avatar */}
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                    {editMode
                      ? formData.first_name?.[0]
                      : client.first_name?.[0]}
                    {editMode ? formData.last_name?.[0] : client.last_name?.[0]}
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full border-4 border-white flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                </div>

                {/* Client Info */}
                <div className="flex-1">
                  {editMode ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            الاسم الأول
                          </label>
                          <input
                            type="text"
                            value={formData.first_name}
                            onChange={(e) =>
                              updateField("first_name", e.target.value)
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            disabled={saving}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            الاسم الأخير
                          </label>
                          <input
                            type="text"
                            value={formData.last_name}
                            onChange={(e) =>
                              updateField("last_name", e.target.value)
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            disabled={saving}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            البريد الإلكتروني
                          </label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) =>
                              updateField("email", e.target.value)
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            disabled={true}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            رقم الهاتف
                          </label>
                          <input
                            type="tel"
                            value={formData.phone_number}
                            onChange={(e) =>
                              updateField("phone_number", e.target.value)
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {client.first_name} {client.last_name}
                      </h1>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span>{client.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span>{client.phone_number}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>عضو منذ {formatDate(client.created_at)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {!editMode ? (
                  !checkingCanManage &&
                  canManageClients && (
                    <button
                      onClick={() => setEditMode(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm"
                    >
                      <Edit className="w-4 h-4" />
                      <span>تعديل</span>
                    </button>
                  )
                ) : (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>جاري الحفظ...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>حفظ</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" />
                      <span>إلغاء</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">
                  إجمالي المشاريع
                </p>
                <p className="text-3xl font-bold text-gray-900">
                  {totalProjects}
                </p>
              </div>
              <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center">
                <Building2 className="w-7 h-7 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">
                  المشاريع النشطة
                </p>
                <p className="text-3xl font-bold text-emerald-600">
                  {activeProjects}
                </p>
              </div>
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-7 h-7 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">
                  المشاريع المكتملة
                </p>
                <p className="text-3xl font-bold text-blue-600">
                  {completedProjects}
                </p>
              </div>
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-blue-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Projects Section */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Building2 className="w-6 h-6 text-indigo-600" />
              المشاريع
            </h2>
          </div>

          {loadingProjects ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-indigo-600"></div>
              <p className="mt-4 text-gray-600">جاري تحميل المشاريع...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                لا توجد مشاريع
              </h3>
              <p className="text-gray-600">
                لم يتم إنشاء أي مشاريع لهذا العميل
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-indigo-300 transition-all duration-300"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    {/* Project Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-4 mb-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md">
                          <Building2 className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-gray-900 truncate">
                              {project.name}
                            </h3>
                            <span
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                                project.status,
                              )}`}
                            >
                              {getStatusIcon(project.status)}
                              {getStatusLabel(project.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                              {project.code}
                            </span>
                            <span className="text-gray-400">•</span>
                            <span>{formatDate(project.created_at)}</span>
                          </div>
                          {project.description && (
                            <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                              {project.description}
                            </p>
                          )}
                          {project.address && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              <span>{project.address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex lg:flex-col gap-2">
                      <Link
                        to={`/projects/${project.id}`}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          عرض التفاصيل
                        </span>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientDetailPage;
