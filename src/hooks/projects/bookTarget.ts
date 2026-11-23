// The project a bookkeeping expense is saved into.
//
// The form carries its own project_id, while the page knows which project
// it is showing. They must be the same project. In 2026-11 the form kept
// the previous project after the bookkeeper switched projects from the
// sidebar, and the save wrote the expense, its payment and the balances
// into that previous project, with the page project's serial number.
// Refusing the save is better than writing it to the wrong project.
export function bookTargetProject(
  pageProjectId: string,
  formProjectId: string | undefined,
): string {
  if (!pageProjectId || !formProjectId) {
    throw new Error("لم يتم تحديد المشروع");
  }
  if (formProjectId !== pageProjectId) {
    throw new Error(
      "النموذج يخص مشروعاً آخر غير المشروع المفتوح، أعد تحميل الصفحة وأدخل المصروف من جديد",
    );
  }
  return pageProjectId;
}
