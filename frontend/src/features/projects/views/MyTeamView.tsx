import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { LoadingState } from "../../../shared/ui/States";
import type { TeamMemberWorkload } from "../types";

interface MyTeamViewProps {
  companyId: string;
  permissions: string[];
}

export function MyTeamView({ companyId }: MyTeamViewProps) {
  const workloadQuery = useQuery({
    queryKey: ["projects-team-workload", companyId],
    queryFn: () => api<{ results: TeamMemberWorkload[] }>(`/api/v1/companies/${companyId}/projects/team-workload/`),
  });

  if (workloadQuery.isLoading || !workloadQuery.data) {
    return <LoadingState label="Loading team workload & capacity metrics..." />;
  }

  const team = workloadQuery.data.results;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-pulse-border pb-4">
        <div>
          <h2 className="text-base font-bold text-pulse-ink">Team Capacity & Workload</h2>
          <p className="text-xs text-pulse-muted">
            Track workload distribution, active assignments, overdue tasks, and logged hours across your team.
          </p>
        </div>
        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 border border-teal-200">
          {team.length} Active Members
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {team.map((member) => {
          const isOverloaded = member.active_tasks_count > 6;
          const hasOverdue = member.overdue_tasks_count > 0;

          return (
            <div
              key={member.person_id}
              className="rounded-xl border border-pulse-border bg-white p-5 shadow-sm hover:shadow-md transition space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-pulse-ink">{member.name}</h3>
                  <p className="text-xs text-pulse-muted">
                    {member.designation ? `${member.designation} · ` : ""}
                    {member.department}
                  </p>
                </div>
                {isOverloaded ? (
                  <span className="rounded bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5">
                    High Workload
                  </span>
                ) : (
                  <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                    Optimal
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-pulse-surface p-3 text-center">
                <div>
                  <div className="text-lg font-black text-pulse-ink">{member.active_tasks_count}</div>
                  <div className="text-[10px] uppercase font-semibold text-pulse-muted">Active Tasks</div>
                </div>
                <div>
                  <div className={`text-lg font-black ${hasOverdue ? "text-rose-600" : "text-pulse-ink"}`}>
                    {member.overdue_tasks_count}
                  </div>
                  <div className="text-[10px] uppercase font-semibold text-pulse-muted">Overdue</div>
                </div>
                <div>
                  <div className="text-lg font-black text-teal-700">{member.weekly_hours}h</div>
                  <div className="text-[10px] uppercase font-semibold text-pulse-muted">This Week</div>
                </div>
              </div>

              <div className="text-xs text-pulse-muted pt-1">
                <div className="flex items-center justify-between mb-1">
                  <span>Capacity Utilization</span>
                  <span className="font-semibold text-pulse-ink">
                    {Math.min(100, Math.round((member.weekly_hours / 40) * 100))}%
                  </span>
                </div>
                <div className="w-full bg-pulse-border rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full ${
                      member.weekly_hours > 40 ? "bg-amber-500" : "bg-[#0D9488]"
                    }`}
                    style={{ width: `${Math.min(100, (member.weekly_hours / 40) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

