import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { LoadingState } from "../../../shared/ui/States";
import type { TaskSummary, ProjectSummary } from "../types";

interface CalendarViewProps {
  companyId: string;
  onOpenTaskDetail: (taskId: string) => void;
}

export function CalendarView({ companyId, onOpenTaskDetail }: CalendarViewProps) {
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0);

  const tasksQuery = useQuery({
    queryKey: ["projects-calendar-tasks", companyId],
    queryFn: () => api<{ results: TaskSummary[] }>(`/api/v1/companies/${companyId}/projects/tasks/`),
  });

  const projectsQuery = useQuery({
    queryKey: ["projects-list", companyId],
    queryFn: () => api<{ results: ProjectSummary[] }>(`/api/v1/companies/${companyId}/projects/projects/`),
  });

  if (tasksQuery.isLoading || projectsQuery.isLoading) {
    return <LoadingState label="Loading project calendar & schedules..." />;
  }

  const tasks = tasksQuery.data?.results || [];
  const projects = projectsQuery.data?.results || [];

  // Current view date
  const now = new Date();
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth() + selectedMonthOffset, 1);
  const monthName = currentMonthDate.toLocaleString("default", { month: "long", year: "numeric" });

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayWeekday = new Date(year, month, 1).getDay(); // 0 is Sun

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Group items by day string "YYYY-MM-DD"
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  const tasksByDay: Record<number, TaskSummary[]> = {};
  for (const t of tasks) {
    if (t.due_date && t.due_date.startsWith(monthPrefix)) {
      const dayNum = parseInt(t.due_date.split("-")[2], 10);
      if (!tasksByDay[dayNum]) tasksByDay[dayNum] = [];
      tasksByDay[dayNum].push(t);
    }
  }

  const projectsByDay: Record<number, ProjectSummary[]> = {};
  for (const p of projects) {
    if (p.due_date && p.due_date.startsWith(monthPrefix)) {
      const dayNum = parseInt(p.due_date.split("-")[2], 10);
      if (!projectsByDay[dayNum]) projectsByDay[dayNum] = [];
      projectsByDay[dayNum].push(p);
    }
  }

  return (
    <div className="space-y-6">
      {/* Month Navigator */}
      <div className="flex items-center justify-between border-b border-pulse-border pb-4">
        <div>
          <h2 className="text-base font-bold text-pulse-ink">Project Schedule & Calendar</h2>
          <p className="text-xs text-pulse-muted">
            Deadlines, project milestones, and task deliverables for {monthName}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedMonthOffset((prev) => prev - 1)}
            className="rounded border border-pulse-border bg-white px-3 py-1 text-xs font-semibold hover:bg-pulse-surface"
          >
            &larr; Prev
          </button>
          <button
            type="button"
            onClick={() => setSelectedMonthOffset(0)}
            className="rounded border border-pulse-border bg-white px-3 py-1 text-xs font-semibold hover:bg-pulse-surface"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setSelectedMonthOffset((prev) => prev + 1)}
            className="rounded border border-pulse-border bg-white px-3 py-1 text-xs font-semibold hover:bg-pulse-surface"
          >
            Next &rarr;
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-pulse-border bg-white overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-pulse-border bg-pulse-surface text-center text-xs font-bold text-pulse-muted py-2">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-pulse-border min-h-[500px]">
          {/* Empty cells before month starts */}
          {Array.from({ length: firstDayWeekday }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-pulse-surface/40 p-2 min-h-[90px]" />
          ))}

          {/* Days */}
          {daysArray.map((day) => {
            const dayTasks = tasksByDay[day] || [];
            const dayProjects = projectsByDay[day] || [];
            const isToday =
              now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;

            return (
              <div
                key={day}
                className={`p-2 min-h-[90px] flex flex-col justify-between transition ${
                  isToday ? "bg-teal-50/40" : "bg-white hover:bg-pulse-surface/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-bold ${
                      isToday
                        ? "rounded-full bg-teal-600 text-white w-5 h-5 flex items-center justify-center text-[10px]"
                        : "text-pulse-muted"
                    }`}
                  >
                    {day}
                  </span>
                  {(dayTasks.length > 0 || dayProjects.length > 0) && (
                    <span className="text-[10px] font-bold text-teal-700">
                      {dayTasks.length + dayProjects.length}
                    </span>
                  )}
                </div>

                <div className="space-y-1 overflow-y-auto max-h-24">
                  {dayProjects.map((p) => (
                    <div
                      key={p.id}
                      className="rounded bg-teal-100 border border-teal-200 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 truncate"
                      title={`Project Due: ${p.name}`}
                    >
                      📁 {p.code}
                    </div>
                  ))}

                  {dayTasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onOpenTaskDetail(t.id)}
                      className="cursor-pointer rounded bg-slate-100 border border-slate-200 hover:border-teal-500 px-1.5 py-0.5 text-[10px] font-semibold text-pulse-ink truncate"
                      title={t.title}
                    >
                      ✓ {t.code}: {t.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

