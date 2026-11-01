import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { ErrorState, LoadingState } from "../../shared/ui/States";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { actionLabel, initials, personName } from "./format";
import { NavIcon, SHELL_LINKS, type IconName } from "./navigation";
import type { MePayload, OverviewPayload, WorkspacePayload } from "./types";

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
  hrms: { label: "HRMS", blurb: "People, attendance and leave", tint: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200" },
  organization: { blurb: "Structure, units and reporting lines", tint: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200" },
  billing: { label: "Billing", blurb: "Subscription and payments", tint: "bg-pulse-accent-tint text-pulse-accent-strong" },
  studio: { label: "Studio", blurb: "Customize role dashboards", tint: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  users: { blurb: "People and memberships", tint: "bg-pulse-accent-tint text-pulse-accent-strong" },
  roles: { blurb: "Roles and permissions", tint: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200" },
  settings: { blurb: "Company configuration", tint: "bg-pulse-hover text-pulse-muted" },
  modules: { blurb: "Install business applications", tint: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-200" },
  notifications: { blurb: "Inbox and announcements", tint: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200" },
  audit: { blurb: "Administrative history", tint: "bg-pulse-hover text-pulse-muted" },
};

type Task = { id: string; title: string; detail: string; to: string; tint: string };
type QuickAction = { id: string; title: string; detail: string; to: string; icon: IconName; tint: string };

const cardClass = "rounded-2xl border border-pulse-border bg-pulse-surface shadow-sm";

export function OverviewPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const overview = useQuery({ queryKey: ["company-overview"], queryFn: () => api<OverviewPayload>("/api/v1/workspace/overview/") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MePayload>("/api/v1/auth/me/") });
  const notices = useQuery({
    queryKey: ["notifications", workspace.company.id],
    queryFn: () => api<{ unread_count: number }>(`/api/v1/companies/${workspace.company.id}/notifications/`),
  });

  if (overview.isLoading) {
    return <LoadingState label="Loading the dashboard" />;
  }
  if (overview.isError || !overview.data) {
    const body =
      overview.error instanceof ApiError && overview.error.status === 403
        ? "You do not have access to the company dashboard yet. Ask an owner to assign you a role (for example Employee)."
        : "The company overview could not be loaded.";
    return <ErrorState title="Dashboard unavailable" body={body} />;
  }

  const data = overview.data;
  const allowed = new Set(workspace.permissions);
  const can = (code: string) => allowed.has(code);
  const navCodes = new Set(workspace.navigation.map((item) => item.code));
  const links = SHELL_LINKS.filter(
    (item) =>
      item.code !== "dashboard" &&
      (navCodes.has(item.code) ||
        (item.code === "billing" && can("billing.view")) ||
        (item.code === "users" && can("people.view")) ||
        (item.code === "notifications" && navCodes.has("dashboard"))),
  );
  const apps = APP_ORDER.map((code) => links.find((item) => item.code === code)).filter((item) => item != null).slice(0, 6);
  const installedSlugs = new Set((data.modules ?? []).map((item) => item.slug));
  const tasks = pendingTasks(data, can, notices.data?.unread_count ?? 0);
  const quickActions = buildQuickActions(can, navCodes);
  const team = data.people ?? data.users.total;
  const joined = data.users.joined_this_month ?? 0;
  const units = data.units ?? 0;
  const country = countryName(data.billing?.country_code || data.company.country_code);
  const since = data.company.created_at ? formatDate(data.company.created_at) : null;
  const userName = personName(me.data?.first_name ?? "", me.data?.last_name ?? "", me.data?.email ?? "");
  const firstName = (me.data?.first_name || "").trim() || userName.split(" ")[0] || "";
  const activityGroups = groupActivityByDate(data.activity);

  return (
    <div className="space-y-5">
      {/* Welcome header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-pulse-muted">{formatToday()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-pulse-ink sm:text-[1.75rem]">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-pulse-muted">
            {data.company.display_name}
            <span className="text-pulse-border"> · </span>
            Here is what needs attention in your workspace today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
          <div className="flex items-center gap-2.5 rounded-xl border border-pulse-border bg-pulse-surface px-3 py-2 shadow-sm">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-pulse-accent text-xs font-semibold text-white">
              {initials(data.company.display_name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-pulse-ink">{data.company.display_name}</span>
              <span className="mt-0.5 flex items-center gap-2 text-xs text-pulse-muted">
                <StatusBadge status={data.company.status} />
                {data.subscription ? <span>{data.subscription.plan_name}</span> : null}
              </span>
            </span>
          </div>
          {can("membership.invite") ? (
            <Link
              to="/app/people#invitations"
              className="inline-flex items-center rounded-xl bg-pulse-accent px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-pulse-accent-strong"
            >
              Invite people
            </Link>
          ) : can("company.update") ? (
            <Link
              to="/app/settings?section=company"
              className="inline-flex items-center rounded-xl border border-pulse-border bg-pulse-surface px-3.5 py-2.5 text-sm font-semibold text-pulse-ink transition hover:border-pulse-accent"
            >
              Company settings
            </Link>
          ) : null}
        </div>
      </header>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Team members"
          value={String(team)}
          hint={joined > 0 ? `+${joined} joined this month` : `${data.users.active} active`}
          to={navCodes.has("users") || can("people.view") ? "/app/people" : "/app"}
          tint="bg-pulse-accent-tint text-pulse-accent-strong"
          icon="people"
        />
        <StatCard
          label="Installed modules"
          value={String(data.installed_modules)}
          hint={data.available_modules > 0 ? `${data.available_modules} available to install` : "Catalog up to date"}
          to={can("modules.view") ? "/app/modules" : "/app"}
          tint="bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200"
          icon="modules"
        />
        <StatCard
          label="Action items"
          value={String(tasks.length)}
          hint={tasks.length === 0 ? "Nothing waiting on you" : tasks.length === 1 ? "1 needs attention" : `${tasks.length} need attention`}
          to={tasks[0]?.to ?? "/app"}
          tint="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          icon="audit"
        />
        <StatCard
          label="Organization units"
          value={String(units)}
          hint={units === 0 ? "No units yet" : "Active units in the hierarchy"}
          to={can("departments.view") || navCodes.has("organization") ? "/app/organization" : "/app"}
          tint="bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200"
          icon="organization"
        />
      </div>

      {/* Quick actions */}
      {quickActions.length > 0 ? (
        <section>
          <SectionTitle title="Quick actions" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => (
              <Link
                key={action.id}
                to={action.to}
                className={`${cardClass} flex items-start gap-3 p-3.5 transition hover:border-pulse-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pulse-accent`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${action.tint}`}>
                  <NavIcon name={action.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-pulse-ink">{action.title}</span>
                  <span className="mt-0.5 block text-xs text-pulse-muted">{action.detail}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Main two-column grid */}
      <div className="grid items-start gap-4 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          {/* Applications */}
          <section className={`${cardClass} p-4 sm:p-5`}>
            <SectionTitle
              title="Your applications"
              action={can("modules.view") ? { label: "Browse modules", to: "/app/modules#marketplace" } : undefined}
            />
            {apps.length === 0 ? (
              <p className="mt-4 rounded-xl bg-pulse-hover px-4 py-8 text-center text-sm text-pulse-muted">
                Your role does not include workspace applications yet.
              </p>
            ) : (
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {apps.map((app) => {
                  const copy = APP_COPY[app.code] ?? {
                    blurb: app.label,
                    tint: "bg-pulse-hover text-pulse-muted",
                  };
                  // Only catalog modules report install state; platform apps (people, roles, …) are always "Open".
                  const catalogModule = (data.modules ?? []).find((item) => item.slug === app.code);
                  const showInstallState = app.code === "hrms" || Boolean(catalogModule);
                  const installed = showInstallState ? installedSlugs.has(app.code) || Boolean(catalogModule) : true;
                  return (
                    <li key={app.code}>
                      <Link
                        to={app.to}
                        className="flex items-start gap-3 rounded-xl border border-pulse-border p-3 transition hover:border-pulse-accent/60 hover:bg-pulse-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pulse-accent"
                      >
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${copy.tint}`}>
                          <NavIcon name={app.icon} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-pulse-ink">{copy.label ?? app.label}</span>
                            {showInstallState ? (
                              <span
                                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  installed
                                    ? "bg-pulse-accent-tint text-pulse-success"
                                    : "bg-pulse-hover text-pulse-muted"
                                }`}
                              >
                                {installed ? "Installed" : "Available"}
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-md bg-pulse-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pulse-muted">
                                Open
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-pulse-muted">{copy.blurb}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {can("modules.view") ? (
              <Link
                to="/app/modules#marketplace"
                className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-pulse-border px-4 py-3 text-sm transition hover:border-pulse-accent hover:bg-pulse-accent-tint/40"
              >
                <span>
                  <span className="block font-semibold text-pulse-ink">Explore the module catalog</span>
                  <span className="text-xs text-pulse-muted">
                    {data.available_modules > 0
                      ? `${data.available_modules} modules available for this plan`
                      : "Review applications for this workspace"}
                  </span>
                </span>
                <span className="shrink-0 font-medium text-pulse-accent">Browse</span>
              </Link>
            ) : null}
          </section>

          {/* Recent activity */}
          <section className={`${cardClass} p-4 sm:p-5`}>
            <SectionTitle title="Recent activity" action={can("audit.view") ? { label: "View all", to: "/app/audit" } : undefined} />
            {data.activity.length === 0 ? (
              <p className="mt-4 rounded-xl bg-pulse-hover px-4 py-8 text-center text-sm text-pulse-muted">
                No administrative activity yet.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {activityGroups.map((group) => (
                  <div key={group.label}>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-pulse-muted">{group.label}</p>
                    <ul className="divide-y divide-pulse-border">
                      {group.items.map((item) => (
                        <li key={`${item.action}-${item.created_at}-${item.actor_email}`} className="flex items-start gap-3 py-2.5">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activityTone(item.action)}`} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-pulse-ink">{actionLabel(item.action)}</span>
                            <span className="mt-0.5 block text-xs text-pulse-muted">
                              {item.actor_name || item.actor_email || "System"}
                              <span className="text-pulse-border"> · </span>
                              <time dateTime={item.created_at} title={formatDateTime(item.created_at)}>
                                {relativeActivity(item.created_at)}
                              </time>
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4 xl:col-span-2">
          {/* Action center */}
          <section className={`${cardClass} p-4 sm:p-5`}>
            <SectionTitle title="Action center" />
            {tasks.length === 0 ? (
              <div className="mt-4 rounded-xl border border-pulse-success/30 bg-pulse-accent-tint/50 px-4 py-6 text-center">
                <p className="text-sm font-medium text-pulse-ink">You are caught up</p>
                <p className="mt-1 text-xs text-pulse-muted">Nothing in this workspace is waiting on you.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-pulse-border">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      to={task.to}
                      className="flex items-start gap-3 rounded-lg py-2.5 transition hover:bg-pulse-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pulse-accent"
                    >
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${task.tint}`}>
                        <TaskIcon id={task.id} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-pulse-ink">{task.title}</span>
                        <span className="block text-xs text-pulse-muted">{task.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Company overview */}
          <section className={`${cardClass} p-4 sm:p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-pulse-accent text-sm font-semibold text-white">
                  {initials(data.company.display_name)}
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-pulse-ink">Company overview</h2>
                  <p className="mt-0.5 truncate text-xs text-pulse-muted">{data.company.display_name}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={data.company.status} />
                {can("company.update") ? (
                  <Link className="text-sm font-medium text-pulse-accent hover:text-pulse-accent-strong dark:hover:text-pulse-accent-soft" to="/app/settings?section=company">
                    Edit
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="mt-4 space-y-3.5">
              <OverviewGroup title="Identity">
                <Info label="Legal name" value={data.company.legal_name} />
                <Info label="Workspace" value={data.company.slug} />
                {since ? <Info label="Member since" value={since} /> : null}
              </OverviewGroup>
              <OverviewGroup title="Localization">
                <Info label="Country" value={country} />
                <Info label="Timezone" value={data.company.timezone || workspace.company.timezone} />
              </OverviewGroup>
              <OverviewGroup title="Subscription">
                <Info
                  label="Plan"
                  value={data.subscription ? `${data.subscription.plan_name} · ${titleCase(data.subscription.status)}` : "No plan"}
                />
                <Info label="GSTIN" value={data.billing?.gstin || "Not provided"} />
              </OverviewGroup>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function OverviewGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-pulse-border pt-3 first:border-0 first:pt-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-pulse-muted">{title}</p>
      <dl className="mt-2 space-y-2 text-sm">{children}</dl>
    </div>
  );
}

function TaskIcon({ id }: { id: string }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-4 w-4",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (id === "invites" || id === "invited" || id === "login" || id === "suspended") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19c.8-2.6 3.2-4 7-4s6.2 1.4 7 4" />
      </svg>
    );
  }
  if (id === "org") {
    return (
      <svg {...common}>
        <path d="M4 20V7.5A1.5 1.5 0 0 1 5.5 6H11v14" />
        <path d="M11 10h7.5A1.5 1.5 0 0 1 20 11.5V20" />
      </svg>
    );
  }
  if (id === "billing") {
    return (
      <svg {...common}>
        <rect x="3.5" y="6" width="17" height="12" rx="2" />
        <path d="M3.5 10h17" />
      </svg>
    );
  }
  if (id === "notices") {
    return (
      <svg {...common}>
        <path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5L6 16Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 4.5h8l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 6.5 19V6A1.5 1.5 0 0 1 8 4.5Z" />
    </svg>
  );
}

function buildQuickActions(can: (code: string) => boolean, navCodes: Set<string>): QuickAction[] {
  const actions: QuickAction[] = [];
  if (can("membership.invite") || (can("people.view") && navCodes.has("users"))) {
    actions.push({
      id: "invite",
      title: can("membership.invite") ? "Invite people" : "Manage people",
      detail: can("membership.invite") ? "Add members to this company" : "People and memberships",
      to: can("membership.invite") ? "/app/people#invitations" : "/app/people",
      icon: "people",
      tint: "bg-pulse-accent-tint text-pulse-accent-strong",
    });
  }
  if (can("departments.view") || can("departments.manage") || navCodes.has("organization")) {
    actions.push({
      id: "org",
      title: "Manage organization",
      detail: "Units, hierarchy and structure",
      to: "/app/organization",
      icon: "organization",
      tint: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200",
    });
  }
  if (can("modules.view") || can("modules.install") || navCodes.has("modules")) {
    actions.push({
      id: "modules",
      title: "Browse modules",
      detail: "Install business applications",
      to: "/app/modules#marketplace",
      icon: "modules",
      tint: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200",
    });
  }
  if (can("company.update") || navCodes.has("settings")) {
    actions.push({
      id: "settings",
      title: "Configure workspace",
      detail: "Company information and fields",
      to: "/app/settings?section=company",
      icon: "settings",
      tint: "bg-pulse-hover text-pulse-muted",
    });
  }
  return actions.slice(0, 4);
}

function pendingTasks(data: OverviewPayload, can: (code: string) => boolean, unread: number): Task[] {
  const tasks: Task[] = [];
  if (can("membership.view") && data.pending_invitations > 0) {
    tasks.push({
      id: "invites",
      title: "Review pending invitations",
      detail: `${data.pending_invitations} waiting to join`,
      to: "/app/people#invitations",
      tint: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    });
  }
  if (can("membership.view") && data.users.invited > 0) {
    tasks.push({
      id: "invited",
      title: "Members have not joined yet",
      detail: `${data.users.invited} memberships are still invited`,
      to: "/app/people",
      tint: "bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
    });
  }
  if (can("membership.view") && data.users.suspended > 0) {
    tasks.push({
      id: "suspended",
      title: "Review suspended members",
      detail: `${data.users.suspended} memberships are suspended`,
      to: "/app/people",
      tint: "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
    });
  }
  if (can("membership.view") && (data.users.no_login ?? 0) > 0) {
    tasks.push({
      id: "login",
      title: "Members have never signed in",
      detail: `${data.users.no_login} active memberships`,
      to: "/app/people",
      tint: "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
    });
  }
  if (can("modules.view") && data.module_issues.length > 0) {
    tasks.push({
      id: "modules",
      title: "Fix a failed module install",
      detail: data.module_issues.map((issue) => issue.slug).join(", "),
      to: "/app/modules",
      tint: "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
    });
  }
  if (can("modules.install") && data.installed_modules === 0 && data.available_modules > 0) {
    tasks.push({
      id: "install",
      title: "Install a business module",
      detail: `${data.available_modules} available in the catalog`,
      to: "/app/modules#marketplace",
      tint: "bg-pulse-accent-tint text-pulse-accent-strong",
    });
  }
  if (can("departments.view") && (data.units ?? 0) === 0) {
    tasks.push({
      id: "org",
      title: "Set up the organization",
      detail: "No active units yet",
      to: "/app/organization",
      tint: "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
    });
  }
  if (!data.billing && (can("billing.view") || can("company.update"))) {
    tasks.push({
      id: "billing",
      title: "Complete billing information",
      detail: "The billing profile is still empty",
      to: "/app/billing",
      tint: "bg-pulse-accent-tint text-pulse-success",
    });
  }
  if (unread > 0) {
    tasks.push({
      id: "notices",
      title: "Read unread notifications",
      detail: `${unread} unread`,
      to: "/app/notifications?tab=inbox",
      tint: "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
    });
  }
  return tasks.slice(0, 6);
}

function StatCard({
  label,
  value,
  hint,
  to,
  tint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  to: string;
  tint: string;
  icon: IconName;
}) {
  return (
    <Link
      to={to}
      className={`${cardClass} flex h-full flex-col p-4 transition hover:border-pulse-accent/60`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="text-sm text-pulse-muted">{label}</span>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tint}`}>
          <NavIcon name={icon} />
        </span>
      </span>
      <span className="mt-3 text-3xl font-semibold tracking-tight text-pulse-ink">{value}</span>
      <span className="mt-1 text-xs text-pulse-muted">{hint}</span>
    </Link>
  );
}

function SectionTitle({ title, action }: { title: string; action?: { label: string; to: string } }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-pulse-ink">{title}</h2>
      {action ? (
        <Link to={action.to} className="text-sm font-medium text-pulse-accent hover:text-pulse-accent-strong dark:hover:text-pulse-accent-soft">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-pulse-muted">{label}</dt>
      <dd className="max-w-[14rem] text-right font-medium text-pulse-ink">{value}</dd>
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function relativeActivity(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

function groupActivityByDate(activity: OverviewPayload["activity"]) {
  const groups: Array<{ label: string; items: OverviewPayload["activity"] }> = [];
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const item of activity) {
    const date = new Date(item.created_at);
    let label = formatDate(item.created_at);
    if (!Number.isNaN(date.getTime())) {
      const day = startOfDay(date).getTime();
      if (day === today.getTime()) label = "Today";
      else if (day === yesterday.getTime()) label = "Yesterday";
    }
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
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
  if (action.startsWith("membership.") || action.startsWith("person.")) return "bg-pulse-accent";
  if (action.startsWith("organization")) return "bg-sky-500";
  if (action.startsWith("subscription.") || action.startsWith("company.billing")) return "bg-pulse-success";
  return "bg-pulse-muted";
}
