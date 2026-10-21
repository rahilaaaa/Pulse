import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../../shared/api/client";
import { ErrorState, LoadingState } from "../../shared/ui/States";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { actionLabel, initials } from "./format";
import { NavIcon, SHELL_LINKS, type IconName } from "./navigation";
import type { OverviewPayload, WorkspacePayload } from "./types";

const COUNTRIES: Record<string, string> = {
  IN: "India",
  AE: "United Arab Emirates",
  SG: "Singapore",
  GB: "United Kingdom",
  US: "United States",
  DE: "Germany",
};

const APP_ORDER = ["hrms", "organization", "billing", "studio", "users", "roles", "settings", "notifications", "audit", "modules"];

const APP_COPY: Record<string, { label?: string; blurb: string; tint: string }> = {
  hrms: { label: "HRMS", blurb: "People, attendance and leave", tint: "bg-violet-50 text-violet-700" },
  organization: { blurb: "Departments and structure", tint: "bg-sky-50 text-sky-700" },
  billing: { label: "Billing", blurb: "Subscription and payments", tint: "bg-emerald-50 text-emerald-700" },
  studio: { label: "Studio", blurb: "Customize your workspace", tint: "bg-amber-50 text-amber-700" },
  users: { blurb: "People and memberships", tint: "bg-teal-50 text-teal-800" },
  roles: { blurb: "Roles and permissions", tint: "bg-indigo-50 text-indigo-700" },
  settings: { blurb: "Company configuration", tint: "bg-slate-100 text-slate-700" },
  modules: { blurb: "Install business applications", tint: "bg-fuchsia-50 text-fuchsia-700" },
  notifications: { blurb: "Inbox and announcements", tint: "bg-rose-50 text-rose-700" },
  audit: { blurb: "Administrative history", tint: "bg-slate-100 text-slate-700" },
};

type Task = { id: string; title: string; detail: string; to: string; tint: string };

export function OverviewPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const overview = useQuery({ queryKey: ["company-overview"], queryFn: () => api<OverviewPayload>("/api/v1/workspace/overview/") });
  const notices = useQuery({
    queryKey: ["notifications", workspace.company.id],
    queryFn: () => api<{ unread_count: number }>(`/api/v1/companies/${workspace.company.id}/notifications/`),
  });

  if (overview.isLoading) {
    return <LoadingState label="Loading the dashboard" />;
  }
  if (overview.isError || !overview.data) {
    return <ErrorState title="Dashboard unavailable" body="The company overview could not be loaded." />;
  }

  const data = overview.data;
  const allowed = new Set(workspace.permissions);
  const can = (code: string) => allowed.has(code);
  const navCodes = new Set(workspace.navigation.map((item) => item.code));
  const links = SHELL_LINKS.filter((item) => item.code !== "dashboard" && (navCodes.has(item.code) || (item.code === "billing" && can("billing.view")) || (item.code === "users" && can("people.view")) || (item.code === "notifications" && navCodes.has("dashboard"))));
  const apps = APP_ORDER.map((code) => links.find((item) => item.code === code)).filter((item) => item != null).slice(0, 4);
  const tasks = pendingTasks(data, can, notices.data?.unread_count ?? 0);
  const team = data.people ?? data.users.total;
  const joined = data.users.joined_this_month ?? 0;
  const country = countryName(data.billing?.country_code || data.company.country_code);
  const since = data.company.created_at ? formatDate(data.company.created_at) : null;
  const operational = data.company.status === "active" && data.module_issues.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-slate-500">{formatToday()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {greeting()}, {data.company.display_name}! <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Welcome to {data.company.display_name}. Here is what is happening in your workspace today.</p>
        </div>
        <div className="flex items-center gap-3 self-start rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-800 text-sm font-semibold text-white">{initials(data.company.display_name)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">{data.company.display_name}</span>
            <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <StatusBadge status={data.company.status} />
              {since ? <span>Since {since}</span> : null}
            </span>
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Team members" value={String(team)} hint={joined > 0 ? `+${joined} this month` : `${data.users.active} active`} hintTone={joined > 0 ? "text-emerald-700" : "text-slate-500"} to="/app/people" tint="bg-teal-50 text-teal-800" icon="people" />
        <StatCard label="Installed modules" value={String(data.installed_modules)} hint={`${data.available_modules} available to install`} hintTone="text-slate-500" to={can("modules.view") ? "/app/modules" : "/app"} tint="bg-violet-50 text-violet-700" icon="modules" />
        <StatCard label="Pending tasks" value={String(tasks.length)} hint={tasks.length === 0 ? "Nothing is waiting" : tasks.length === 1 ? "1 needs attention" : `${tasks.length} need attention`} hintTone={tasks.length > 0 ? "text-amber-700" : "text-slate-500"} to={tasks[0]?.to ?? "/app/people"} tint="bg-emerald-50 text-emerald-700" icon="audit" />
        <StatCard label="Company status" value={titleCase(data.company.status)} hint={operational ? "All systems operational" : data.module_issues.length ? "A module needs attention" : "Check company access"} hintTone={operational ? "text-emerald-700" : "text-amber-700"} to={can("company.update") ? "/app/settings" : "/app"} tint="bg-orange-50 text-orange-700" icon="organization" />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
          <SectionTitle title="Your applications" action={can("modules.view") ? { label: "View all modules", to: "/app/modules" } : undefined} />
          {apps.length === 0 ? <p className="mt-4 text-sm text-slate-500">Your role does not include extra workspace applications.</p> : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {apps.map((app) => {
                const copy = APP_COPY[app.code] ?? { blurb: app.label, tint: "bg-slate-100 text-slate-700" };
                const installedModule = app.code === "hrms" || (data.modules ?? []).some((item) => item.slug === app.code);
                return (
                  <Link key={app.code} to={app.to} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-teal-700 hover:bg-teal-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${copy.tint}`}><NavIcon name={app.icon} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{copy.label ?? app.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${installedModule ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{installedModule ? "Installed" : "Ready"}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-500">{copy.blurb}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
          {can("modules.view") ? (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-lg text-slate-500">+</span>
                <div>
                  <p className="font-semibold text-slate-900">Explore more modules</p>
                  <p className="mt-0.5 text-sm text-slate-500">Discover applications your plan can add to this workspace.</p>
                </div>
              </div>
              <Link to="/app/modules#marketplace" className="inline-flex shrink-0 items-center justify-center rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900">Browse modules</Link>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <SectionTitle title="Pending tasks" action={can("membership.view") ? { label: "View all", to: "/app/people" } : undefined} />
          {tasks.length === 0 ? (
            <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-8 text-center text-sm text-emerald-800">You are caught up. Nothing in this workspace is waiting on you.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link to={task.to} className="flex items-start gap-3 rounded-lg py-3 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${task.tint}`}><TaskIcon id={task.id} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{task.title}</span>
                      <span className="block text-xs text-slate-500">{task.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
          <SectionTitle title="Recent activity" action={can("audit.view") ? { label: "View all", to: "/app/audit" } : undefined} />
          {data.activity.length === 0 ? <p className="mt-4 text-sm text-slate-500">No administrative activity yet.</p> : (
            <ul className="mt-2 divide-y divide-slate-100">
              {data.activity.map((item) => (
                <li key={`${item.action}-${item.created_at}`} className="flex items-start gap-3 py-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${activityTone(item.action)}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{actionLabel(item.action)}</span>
                    <span className="block text-xs text-slate-500">{item.actor_name || item.actor_email || "System"} · {daysAgo(item.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <SectionTitle title="Company information" action={can("company.update") ? { label: "Edit", to: "/app/settings" } : undefined} />
          <dl className="mt-3 space-y-3 text-sm">
            <Info label="Legal name" value={data.company.legal_name} />
            <Info label="Country" value={country} />
            <Info label="Timezone" value={data.company.timezone || workspace.company.timezone} />
            <Info label="GSTIN" value={data.billing?.gstin || "Not provided"} />
            <Info label="Plan" value={data.subscription ? `${data.subscription.plan_name} · ${titleCase(data.subscription.status)}` : "No plan"} />
            <Info label="Workspace" value={data.company.slug} />
            {since ? <Info label="Member since" value={since} /> : null}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Status</dt>
              <dd><StatusBadge status={data.company.status} /></dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function TaskIcon({ id }: { id: string }) {
  const common = { viewBox: "0 0 24 24", className: "h-4 w-4", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (id === "invites" || id === "invited" || id === "login" || id === "suspended") {
    return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5 19c.8-2.6 3.2-4 7-4s6.2 1.4 7 4" /></svg>;
  }
  if (id === "org") {
    return <svg {...common}><path d="M4 20V7.5A1.5 1.5 0 0 1 5.5 6H11v14" /><path d="M11 10h7.5A1.5 1.5 0 0 1 20 11.5V20" /></svg>;
  }
  if (id === "billing") {
    return <svg {...common}><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M3.5 10h17" /></svg>;
  }
  if (id === "notices") {
    return <svg {...common}><path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5L6 16Z" /></svg>;
  }
  return <svg {...common}><path d="M8 4.5h8l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 6.5 19V6A1.5 1.5 0 0 1 8 4.5Z" /></svg>;
}

function pendingTasks(data: OverviewPayload, can: (code: string) => boolean, unread: number): Task[] {
  const tasks: Task[] = [];
  if (can("membership.view") && data.pending_invitations > 0) {
    tasks.push({ id: "invites", title: "Review pending invitations", detail: `${data.pending_invitations} waiting to join`, to: "/app/people#invitations", tint: "bg-amber-50 text-amber-800" });
  }
  if (can("membership.view") && data.users.invited > 0) {
    tasks.push({ id: "invited", title: "Members have not joined yet", detail: `${data.users.invited} memberships are still invited`, to: "/app/people", tint: "bg-violet-50 text-violet-800" });
  }
  if (can("membership.view") && data.users.suspended > 0) {
    tasks.push({ id: "suspended", title: "Review suspended members", detail: `${data.users.suspended} memberships are suspended`, to: "/app/people", tint: "bg-rose-50 text-rose-800" });
  }
  if (can("membership.view") && (data.users.no_login ?? 0) > 0) {
    tasks.push({ id: "login", title: "Members have never signed in", detail: `${data.users.no_login} active memberships`, to: "/app/people", tint: "bg-sky-50 text-sky-800" });
  }
  if (can("modules.view") && data.module_issues.length > 0) {
    tasks.push({ id: "modules", title: "Fix a failed module install", detail: data.module_issues.map((issue) => issue.slug).join(", "), to: "/app/modules", tint: "bg-rose-50 text-rose-800" });
  }
  if (can("modules.install") && data.installed_modules === 0) {
    tasks.push({ id: "install", title: "Install a business module", detail: `${data.available_modules} available in the catalog`, to: "/app/modules#marketplace", tint: "bg-teal-50 text-teal-800" });
  }
  if (can("departments.view") && (data.units ?? 0) === 0) {
    tasks.push({ id: "org", title: "Set up the organization", detail: "No active units yet", to: "/app/organization", tint: "bg-sky-50 text-sky-800" });
  }
  if (!data.billing && (can("billing.view") || can("company.update"))) {
    tasks.push({ id: "billing", title: "Complete billing information", detail: "The billing profile is still empty", to: "/app/billing", tint: "bg-emerald-50 text-emerald-800" });
  }
  if (unread > 0) {
    tasks.push({ id: "notices", title: "Read unread notifications", detail: `${unread} unread`, to: "/app/notifications?tab=inbox", tint: "bg-rose-50 text-rose-800" });
  }
  return tasks.slice(0, 6);
}

function StatCard({ label, value, hint, hintTone, to, tint, icon }: { label: string; value: string; hint: string; hintTone: string; to: string; tint: string; icon: IconName }) {
  return (
    <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm text-slate-500">{label}</span>
          <span className="mt-2 block text-3xl font-semibold text-slate-900">{value}</span>
          <span className={`mt-1 block text-xs font-medium ${hintTone}`}>{hint}</span>
        </span>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tint}`}><NavIcon name={icon} /></span>
      </span>
    </Link>
  );
}

function SectionTitle({ title, action }: { title: string; action?: { label: string; to: string } }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {action ? <Link to={action.to} className="text-sm font-medium text-teal-800 hover:text-teal-950">{action.label}</Link> : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="max-w-[14rem] text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatToday() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysAgo(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function countryName(code: string | undefined) {
  if (!code) return "Not set";
  return COUNTRIES[code.toUpperCase()] ?? code;
}

function activityTone(action: string) {
  if (action.startsWith("module.")) return "bg-violet-500";
  if (action.startsWith("membership.") || action.startsWith("person.")) return "bg-teal-600";
  if (action.startsWith("organization")) return "bg-sky-500";
  if (action.startsWith("subscription.") || action.startsWith("company.billing")) return "bg-emerald-500";
  return "bg-slate-400";
}
