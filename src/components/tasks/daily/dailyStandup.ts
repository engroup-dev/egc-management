import type { TaskDirectoryData } from "../../../hooks/tasks/useTaskDirectory";
import type { TaskRow } from "../../../hooks/tasks/useTaskBoard";
import { workingDaysBetween } from "../board/workingDays";

export type DailyTaskUrgency = "overdue_start" | "should_start_today" | "ready_to_start" | "in_progress" | "due_today";

export interface DailyAssigneeInfo {
  id: string;
  name: string;
  isContractor: boolean;
}

export interface DailyTaskItem {
  task: TaskRow;
  urgency: DailyTaskUrgency;
  urgencyLabel: string;
  urgencyBadgeColor: string;
  boardName: string;
  discipline: string;
  assignees: DailyAssigneeInfo[];
  assigneeNames: string[];
  daysOverdueStart?: number;
}

export interface DailyAnswer {
  taskId: string;
  didWork: boolean;
  // If did work:
  progressPercent?: number; // 25, 50, 75, 100
  remainingDays?: number; // 0, 1, 2, 3, 5, etc.
  markCompleted?: boolean;
  workersCount?: number; // 1, 2, 3, 4, 5, 6+
  // If did not work:
  delayReason?: string;
  postponeAction?: "keep" | "tomorrow" | "next_week";
  // Notes:
  note?: string;
}

/** Formats today's date in YYYY-MM-DD */
export function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function categoryOf(task: TaskRow, data: TaskDirectoryData): string | null {
  return data.statuses.find((s) => s.id === task.status_id)?.category ?? null;
}

export function getTaskDiscipline(task: TaskRow, data: TaskDirectoryData): string {
  const title = (task.title ?? "").trim();

  // 1. Precise Construction Keywords from Title (Highest priority)
  if (/توريد|مشتريات|شراء|مواد/i.test(title)) return "توريدات ومشتريات";
  if (/كهربا|إنارة|قواطع|سحب أسلاك|علب|تأسيس الكهرباء/i.test(title)) return "كهرباء";
  if (/سباك|صرف|مياه|مواسير|تغذية|خزان|أمطار/i.test(title)) return "سباكة";
  if (/لياس|بياض|محارة|طرطشة/i.test(title)) return "لياسة";
  if (/تكييف|تهوية|دكت/i.test(title)) return "تكييف";
  if (/حداد|تسليح|كانات/i.test(title)) return "حدادة";
  if (/نجار|طوبار/i.test(title)) return "نجارة";
  if (/خرسان|صب/i.test(title)) return "خرسانة";
  if (/بناء|طوب|بلوك|سور|أسوار/i.test(title)) return "بناء وأسوار";
  if (/عزل|رطوبة|حراري/i.test(title)) return "عزل";
  if (/دهان|صبغ|معجون/i.test(title)) return "دهانات";
  if (/سيراميك|بورسلين|رخام|بلاط/i.test(title)) return "أرضيات وسيراميك";
  if (/ألمنيوم|زجاج|نوافذ|أبواب/i.test(title)) return "ألمنيوم وزجاج";
  if (/جبس|بورد|أسقف/i.test(title)) return "جبس بورد";

  // 2. Tags
  const tags = data.tagsByTask.get(task.id);
  if (tags && tags.length > 0 && tags[0].name?.trim()) {
    const tagName = tags[0].name.trim();
    if (!/task|مهمة/i.test(tagName)) return tagName;
  }

  // 3. Parent Task Title
  const parent = data.parentTitleByTask.get(task.id);
  if (parent && parent.trim()) {
    const p = parent.trim();
    if (/كهربا/i.test(p)) return "كهرباء";
    if (/سباك/i.test(p)) return "سباكة";
    if (/لياس/i.test(p)) return "لياسة";
    if (/حداد/i.test(p)) return "حدادة";
    if (/تكييف/i.test(p)) return "تكييف";
    if (!/task|مهمة/i.test(p)) return p;
  }

  // 4. Task Type (ignoring generic 'Task' or 'مهمة')
  if (task.task_type_id && data.taskTypes.has(task.task_type_id)) {
    const typeObj = data.taskTypes.get(task.task_type_id);
    const typeName = typeObj?.name?.trim();
    if (typeName && !/task|مهمة|default/i.test(typeName)) return typeName;
  }

  return "أعمال عامة";
}

/**
 * Filter tasks to only those that matter TODAY:
 * 1. Overdue start: not_started, but start_date was before today.
 * 2. Should start today: not_started, and start_date is today.
 * 3. In progress: category is in_progress (actively running).
 * 4. Due today: not completed, and due_date is today or passed.
 */
export function filterDailyTasks(data: TaskDirectoryData): DailyTaskItem[] {
  const today = getTodayString();
  const result: DailyTaskItem[] = [];

  for (const task of data.tasks) {
    if (task.is_archived) continue;
    const cat = categoryOf(task, data);
    if (cat === "done") continue; // Already finished, skip

    const boardName = data.boardNamesById.get(task.board_id) ?? "عام";
    const discipline = getTaskDiscipline(task, data);
    const assigneeIds = data.assigneesByTask.get(task.id) ?? [];
    const assignees: DailyAssigneeInfo[] = [];
    const assigneeNames: string[] = [];

    for (const id of assigneeIds) {
      const p = data.employeesById.get(id);
      if (p) {
        const fullName = `${p.first_name} ${p.last_name ?? ""}`.trim();
        const isContractor = p.person_type === "contractor";
        assignees.push({
          id,
          name: fullName,
          isContractor,
        });
        assigneeNames.push(isContractor ? `${fullName} (مقاول)` : fullName);
      }
    }

    // 1. In Progress (Active)
    if (cat === "active" || cat === "in_progress") {
      result.push({
        task,
        urgency: "in_progress",
        urgencyLabel: "قيد التنفيذ بالموقع",
        urgencyBadgeColor: "#0284C7", // Sky blue
        boardName,
        discipline,
        assignees,
        assigneeNames,
      });
      continue;
    }

    // 2. Not started
    if (cat === "not_started") {
      // 2a. Overdue start: start_date was before today
      if (task.start_date && task.start_date < today) {
        const days = workingDaysBetween(task.start_date, today);
        result.push({
          task,
          urgency: "overdue_start",
          urgencyLabel: `متأخرة في البدء (${days} ${days === 1 ? "يوم" : "أيام"})`,
          urgencyBadgeColor: "#DC2626", // Red
          boardName,
          discipline,
          assignees,
          assigneeNames,
          daysOverdueStart: days,
        });
        continue;
      }

      // 2b. Scheduled to start today
      if (task.start_date === today) {
        result.push({
          task,
          urgency: "should_start_today",
          urgencyLabel: "مفترض تبدأ اليوم",
          urgencyBadgeColor: "#D97706", // Amber
          boardName,
          discipline,
          assignees,
          assigneeNames,
        });
        continue;
      }

      // 2c. Dependencies cleared (all predecessor tasks finished)
      const depFlag = data.dependencyFlags.get(task.id);
      if (depFlag?.cleared) {
        result.push({
          task,
          urgency: "ready_to_start",
          urgencyLabel: "جاهزة للبدء (اكتملت المهام السابقة)",
          urgencyBadgeColor: "#059669", // Emerald
          boardName,
          discipline,
          assignees,
          assigneeNames,
        });
        continue;
      }
    }

    // 3. Due today or overdue finish
    if (task.due_date && task.due_date <= today && cat !== "done") {
      result.push({
        task,
        urgency: "due_today",
        urgencyLabel: task.due_date === today ? "مطلوب تسليمها اليوم" : "متأخرة عن موعد التسليم",
        urgencyBadgeColor: "#EA580C", // Orange
        boardName,
        discipline,
        assignees,
        assigneeNames,
      });
    }
  }

  // Sort priority: overdue_start > should_start_today > ready_to_start > in_progress > due_today
  const priorityOrder: Record<DailyTaskUrgency, number> = {
    overdue_start: 1,
    should_start_today: 2,
    ready_to_start: 3,
    in_progress: 4,
    due_today: 5,
  };

  return result.sort((a, b) => priorityOrder[a.urgency] - priorityOrder[b.urgency]);
}

