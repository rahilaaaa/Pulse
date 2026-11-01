import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { LoadingState } from "../../shared/ui/States";
import { initials, relativeTime } from "./format";
import type { WorkspacePayload } from "./types";

type Notice = {
  id: string;
  category: "work" | "people" | "billing" | "system";
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

type Announcement = {
  id: string;
  title: string;
  message: string;
  audience: string;
  author_name: string;
  created_at: string;
};

type Preference = {
  group: string;
  event: string;
  label: string;
  in_app: boolean;
  email: boolean;
};

const TABS = [
  { id: "inbox", label: "Inbox" },
  { id: "announcements", label: "Announcements" },
  { id: "preferences", label: "Preferences" },
] as const;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "work", label: "Work" },
  { id: "people", label: "People" },
  { id: "billing", label: "Billing" },
  { id: "system", label: "System" },
] as const;

const AVATARS = ["bg-teal-700", "bg-emerald-600", "bg-rose-500", "bg-amber-600", "bg-slate-600"];

function avatarClass(name: string) {
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATARS[sum % AVATARS.length];
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationsPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const canPublish = workspace.permissions.includes("company.update");
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((item) => item.id === params.get("tab")) ? params.get("tab")! : "inbox";
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  const inbox = useQuery({
    queryKey: ["notifications", companyId],
    queryFn: () => api<{ results: Notice[]; unread_count: number }>(`/api/v1/companies/${companyId}/notifications/`),
  });
  const announcements = useQuery({
    queryKey: ["announcements", companyId],
    queryFn: () => api<{ results: Announcement[] }>(`/api/v1/companies/${companyId}/announcements/`),
    enabled: tab === "announcements",
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences", companyId],
    queryFn: () => api<{ results: Preference[] }>(`/api/v1/companies/${companyId}/notification-preferences/`),
    enabled: tab === "preferences",
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api(`/api/v1/companies/${companyId}/notifications/`, {
      method: "POST",
      body: JSON.stringify(ids ? { ids } : {}),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications", companyId] });
    },
  });
  const publish = useMutation({
    mutationFn: () => api(`/api/v1/companies/${companyId}/announcements/`, {
      method: "POST",
      body: JSON.stringify({ title, message }),
    }),
    onSuccess: async () => {
      setOpen(false);
      setFormError("");
      await queryClient.invalidateQueries({ queryKey: ["announcements", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["notifications", companyId] });
    },
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "The announcement could not be published."),
  });
  const savePreference = useMutation({
    mutationFn: (row: Preference) => api(`/api/v1/companies/${companyId}/notification-preferences/`, {
      method: "PATCH",
      body: JSON.stringify({ event: row.event, in_app: row.in_app, email: row.email }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences", companyId] });
    },
  });

  function openComposer() {
    setTitle("");
    setMessage("");
    setFormError("");
    setOpen(true);
  }

  const notices = inbox.data?.results ?? [];
  const visible = notices.filter((item) => {
    if (filter === "unread") return !item.read;
    if (filter === "all") return true;
    return item.category === filter;
  });
  const groups = (preferences.data?.results ?? []).reduce<Array<{ group: string; rows: Preference[] }>>((list, row) => {
    const current = list.find((item) => item.group === row.group);
    if (current) current.rows.push(row);
    else list.push({ group: row.group, rows: [row] });
    return list;
  }, []);

  if (inbox.isLoading && !inbox.data) {
    return <LoadingState label="Loading notifications" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">One notification system for the whole platform, including installed modules.</p>
        </div>
        {tab === "inbox" ? (
          <Button type="button" variant="secondary" disabled={markRead.isPending || (inbox.data?.unread_count ?? 0) === 0} onClick={() => markRead.mutate(undefined)}>Mark all read</Button>
        ) : null}
        {tab === "announcements" && canPublish ? <Button type="button" onClick={openComposer}>+ New announcement</Button> : null}
      </div>
      <div className="flex gap-6 border-b border-slate-200 dark:border-slate-700 text-sm">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`border-b-2 pb-2 ${tab === item.id ? "border-teal-800 font-medium text-slate-900 dark:text-slate-100" : "border-transparent text-slate-500 dark:text-slate-400"}`}
            onClick={() => setParams({ tab: item.id })}
          >
            {item.label}
            {item.id === "inbox" ? <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs text-slate-600 dark:text-slate-300">{inbox.data?.unread_count ?? 0}</span> : null}
          </button>
        ))}
      </div>
      {tab === "inbox" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" className={`rounded-full px-3 py-1 text-sm ${filter === item.id ? "bg-slate-900 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"}`} onClick={() => setFilter(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? <p className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No notifications in this view.</p> : visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-left hover:border-slate-300 dark:border-slate-600"
              onClick={() => { if (!item.read) markRead.mutate([item.id]); }}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-teal-700"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</span>
                {item.body ? <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{item.body}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{relativeTime(item.created_at)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {tab === "announcements" ? (
        announcements.isLoading || !announcements.data ? <LoadingState label="Loading announcements" /> : (
          <div className="space-y-3">
            {announcements.data.results.length === 0 ? <p className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No announcements yet.</p> : announcements.data.results.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
                <div className="flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-800">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 10v4a2 2 0 0 0 2 2h1l4 4V4L7 8H6a2 2 0 0 0-2 2Z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 7a7 7 0 0 1 0 10" /></svg>
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</h2>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{item.message}</p>
                    <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold text-white ${avatarClass(item.author_name)}`}>{initials(item.author_name)}</span>
                      {item.author_name} · {shortDate(item.created_at)} · {item.audience}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : null}
      {tab === "preferences" ? (
        preferences.isLoading || !preferences.data ? <LoadingState label="Loading preferences" /> : (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="grid grid-cols-[1fr_4.5rem_4.5rem] border-b border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              <span>Event</span>
              <span className="text-center">In-app</span>
              <span className="text-center">Email</span>
            </div>
            {groups.map((group) => (
              <div key={group.group}>
                <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{group.group}</p>
                {group.rows.map((row) => (
                  <div key={row.event} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center border-b border-slate-100 px-4 py-3 last:border-b-0">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{row.label}</span>
                    <span className="flex justify-center"><Switch label={`${row.label} in-app`} checked={row.in_app} onChange={(value) => savePreference.mutate({ ...row, in_app: value })} /></span>
                    <span className="flex justify-center"><Switch label={`${row.label} email`} checked={row.email} onChange={(value) => savePreference.mutate({ ...row, email: value })} /></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      ) : null}
      <Modal
        open={open}
        title="New announcement"
        description="Delivered through Notifications to the selected audience."
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={publish.isPending || !title.trim() || !message.trim()} onClick={() => publish.mutate()}>Publish</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Title *
            <input className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-teal-700" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Message *
            <textarea className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-teal-700" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-teal-800" : "bg-slate-300"}`} onClick={() => onChange(!checked)}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white dark:bg-slate-900 transition ${checked ? "left-5" : "left-0.5"}`} />
    </button>
  );
}
