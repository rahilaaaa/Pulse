import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { Modal } from "../../shared/ui/Modal";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { EmptyState, LoadingState } from "../../shared/ui/States";
import {
  CustomFieldInputs,
  emptyCustomValues,
  formatCustomFieldDisplay,
  serializeCustomData,
  validateRequiredCustomFields,
  type CustomFieldDef,
} from "./CustomFieldInputs";
import { initials, personName, relativeTime } from "./format";
import type { PersonRow, WorkspacePayload } from "./types";

type Invitation = { id: string; email: string; status: string; expires_at: string; created_at: string };
type DisplayStatus = "pending" | "accepted" | "revoked" | "expired";
type SortKey = "sent_desc" | "sent_asc" | "email_asc" | "email_desc" | "status" | "expires_asc" | "expires_desc";
type Role = { id: string; name: string; is_owner_role: boolean };
type RoleList = { results: Role[]; caller_holds_owner_role: boolean };

function membershipLabel(row: PersonRow) {
  if (row.membership_status === "active") return "Active";
  if (row.membership_status === "invited") return "Invited";
  if (row.membership_status === "suspended") return "Suspended";
  return "No login";
}

function splitCsvLine(line: string) {
  return line.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
}

function invitationDisplayStatus(item: Invitation): DisplayStatus {
  if (item.status === "pending" && item.expires_at && new Date(item.expires_at).getTime() < Date.now()) {
    return "expired";
  }
  if (item.status === "accepted" || item.status === "revoked" || item.status === "expired" || item.status === "pending") {
    return item.status;
  }
  return "pending";
}

function formatInviteDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function PeoplePage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const opened = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState(window.location.hash === "#invitations" ? "invitations" : "people");
  const [addOpen, setAddOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [viewing, setViewing] = useState<PersonRow | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCustomData, setInviteCustomData] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; title?: string }>({});
  const [inviteError, setInviteError] = useState("");
  const [importNote, setImportNote] = useState("");
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteStatusFilter, setInviteStatusFilter] = useState("");
  const [inviteSort, setInviteSort] = useState<SortKey>("sent_desc");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const canInvite = workspace.permissions.includes("membership.invite");
  const canCreate = workspace.permissions.includes("people.create");
  const canManage = workspace.permissions.includes("membership.update");
  const canRemove = workspace.permissions.includes("membership.remove");
  const canAssign = workspace.permissions.includes("roles.manage");

  const people = useQuery({
    queryKey: ["people", companyId, "all"],
    queryFn: () => api<{ results: PersonRow[] }>(`/api/v1/companies/${companyId}/people/?status=all`),
    retry: false,
  });
  const memberships = useQuery({
    queryKey: ["memberships", companyId, "", ""],
    queryFn: () => api<{ results: Array<{ id: string; email: string; first_name: string; last_name: string; status: string; roles: Array<{ id: string; name: string }>; permissions: string[]; job_title?: string; organization?: string; last_login?: string | null }> }>(`/api/v1/companies/${companyId}/memberships/`),
    enabled: people.isError,
    retry: false,
  });
  const invitations = useQuery({
    queryKey: ["invitations", companyId],
    queryFn: () => api<{ results: Invitation[] }>(`/api/v1/companies/${companyId}/invitations/`),
  });
  const personFields = useQuery({
    queryKey: ["custom-fields", companyId, "person"],
    queryFn: () => api<{ results: CustomFieldDef[] }>(`/api/v1/companies/${companyId}/custom-fields/?entity=person`),
  });
  const invitationFields = useQuery({
    queryKey: ["custom-fields", companyId, "invitation"],
    queryFn: () => api<{ results: CustomFieldDef[] }>(`/api/v1/companies/${companyId}/custom-fields/?entity=invitation`),
    enabled: canInvite,
  });
  const customFieldDefs = personFields.data?.results ?? [];
  const invitationFieldDefs = invitationFields.data?.results ?? [];
  const hasRoleLinks = customFieldDefs.some((def) => def.field_type === "reference" && def.config?.target === "role");
  const hasUnitLinks = customFieldDefs.some((def) => def.field_type === "reference" && def.config?.target === "organization_unit");
  const roles = useQuery({
    queryKey: ["roles", companyId],
    queryFn: () => api<RoleList>(`/api/v1/companies/${companyId}/roles/`),
    enabled: canAssign || hasRoleLinks,
  });
  const orgForLabels = useQuery({
    queryKey: ["organization", companyId],
    queryFn: () => api<{ units: Array<{ id: string; name: string }> }>(`/api/v1/companies/${companyId}/organization/units/`),
    enabled: hasUnitLinks,
  });

  useEffect(() => {
    if (!addOpen) return;
    setCustomData(emptyCustomValues(personFields.data?.results ?? []));
  }, [addOpen, personFields.data?.results]);

  useEffect(() => {
    if (!sendOpen) return;
    setInviteCustomData(emptyCustomValues(invitationFields.data?.results ?? []));
  }, [sendOpen, invitationFields.data?.results]);

  useEffect(() => {
    if (opened.current || params.get("add") !== "1") return;
    opened.current = true;
    setAddOpen(true);
    const next = new URLSearchParams(params);
    next.delete("add");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["people", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["invitations", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["company-overview"] });
    await queryClient.invalidateQueries({ queryKey: ["organization", companyId] });
  };

  const createPerson = useMutation({
    mutationFn: (body: { name: string; work_email: string; job_title: string; custom_data: Record<string, unknown> }) =>
      api<PersonRow>(`/api/v1/companies/${companyId}/people/`, { method: "POST", body: JSON.stringify(body) }),
  });
  const invite = useMutation({
    mutationFn: (body: { email: string; custom_data: Record<string, unknown> }) =>
      api(`/api/v1/companies/${companyId}/invitations/`, { method: "POST", body: JSON.stringify(body) }),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      api(`/api/v1/companies/${companyId}/memberships/${id}/status/`, { method: "POST", body: JSON.stringify({ status: next }) }),
    onSuccess: refresh,
  });
  const changePersonStatus = useMutation({
    mutationFn: ({ personId, next }: { personId: string; next: "active" | "inactive" }) =>
      api(`/api/v1/companies/${companyId}/people/${personId}/status/`, { method: "POST", body: JSON.stringify({ status: next }) }),
    onSuccess: async () => {
      setViewing(null);
      await refresh();
    },
  });
  const assign = useMutation({
    mutationFn: ({ id, roleIds }: { id: string; roleIds: string[] }) =>
      api(`/api/v1/companies/${companyId}/memberships/${id}/roles/`, { method: "PUT", body: JSON.stringify({ role_ids: roleIds }) }),
    onSuccess: refresh,
  });

  const invitationRows = invitations.data?.results ?? [];
  const pendingInvites = invitationRows.filter((item) => invitationDisplayStatus(item) === "pending");

  if (people.isLoading || (people.isError && memberships.isLoading)) {
    return <LoadingState label="Loading people" />;
  }
  if (people.isError && memberships.isError) {
    return <EmptyState title="People are unavailable" body={people.error instanceof ApiError ? people.error.message : "The directory could not be loaded."} />;
  }

  const rows: PersonRow[] = people.data?.results ?? (memberships.data?.results ?? []).map((row) => ({
    id: row.id,
    person_id: null,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    job_title: row.job_title ?? "",
    status: row.status,
    organization: row.organization ?? workspace.company.display_name,
    department_id: null,
    membership_id: row.id,
    membership_status: row.status,
    roles: row.roles,
    last_login: row.last_login ?? null,
    permissions: row.permissions,
  }));

  const pendingEmails = new Set(
    invitationRows.filter((item) => invitationDisplayStatus(item) === "pending").map((item) => item.email.toLowerCase()),
  );
  const readyToInvite = rows.filter((row) => {
    const address = row.email.trim().toLowerCase();
    if (!address) return false;
    if (pendingEmails.has(address)) return false;
    if (row.roles.some((role) => role.is_owner_role)) return false;
    if (row.membership_id && row.membership_status !== "removed") return false;
    return true;
  });

  const filteredReady = (() => {
    const needle = inviteSearch.trim().toLowerCase();
    let list = readyToInvite;
    if (needle) {
      list = list.filter(
        (row) =>
          row.email.toLowerCase().includes(needle) ||
          personName(row.first_name, row.last_name, row.email).toLowerCase().includes(needle),
      );
    }
    if (inviteStatusFilter && inviteStatusFilter !== "ready") return [];
    if (!inviteStatusFilter || inviteStatusFilter === "ready") {
      const sorted = [...list];
      sorted.sort((a, b) => {
        if (inviteSort === "email_desc") return b.email.localeCompare(a.email);
        return a.email.localeCompare(b.email);
      });
      return sorted;
    }
    return [];
  })();

  const filteredInvitations = (() => {
    if (inviteStatusFilter === "ready") return [];
    const needle = inviteSearch.trim().toLowerCase();
    let list = invitationRows.map((item) => ({ item, display: invitationDisplayStatus(item) }));
    if (needle) {
      list = list.filter(({ item }) => item.email.toLowerCase().includes(needle));
    }
    if (inviteStatusFilter) {
      list = list.filter(({ display }) => display === inviteStatusFilter);
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (inviteSort === "email_asc") return a.item.email.localeCompare(b.item.email);
      if (inviteSort === "email_desc") return b.item.email.localeCompare(a.item.email);
      if (inviteSort === "status") return a.display.localeCompare(b.display) || b.item.created_at.localeCompare(a.item.created_at);
      if (inviteSort === "expires_asc") return a.item.expires_at.localeCompare(b.item.expires_at);
      if (inviteSort === "expires_desc") return b.item.expires_at.localeCompare(a.item.expires_at);
      if (inviteSort === "sent_asc") return a.item.created_at.localeCompare(b.item.created_at);
      return b.item.created_at.localeCompare(a.item.created_at);
    });
    return sorted;
  })();

  const invitationsEmpty = readyToInvite.length === 0 && invitationRows.length === 0;
  const filteredEmpty = filteredReady.length === 0 && filteredInvitations.length === 0;

  function validatePersonForm() {
    const next: { name?: string; email?: string; title?: string } = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedTitle = title.trim();
    if (!trimmedName) next.name = "Enter a name.";
    if (!trimmedEmail) next.email = "Enter an email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) next.email = "Enter a valid email address.";
    if (!trimmedTitle) next.title = "Enter a designation.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submitPerson() {
    setFormError("");
    if (!validatePersonForm()) {
      setFormError("Fill in name, email, and designation to add a person.");
      return;
    }
    const customError = validateRequiredCustomFields(customFieldDefs, customData);
    if (customError) {
      setFormError(customError);
      return;
    }
    try {
      if (!canCreate) {
        setFormError("You do not have permission to add people.");
        return;
      }
      await createPerson.mutateAsync({
        name: name.trim(),
        work_email: email.trim(),
        job_title: title.trim(),
        custom_data: serializeCustomData(customFieldDefs, customData),
      });
      setName("");
      setEmail("");
      setTitle("");
      setCustomData(emptyCustomValues(customFieldDefs));
      setFieldErrors({});
      setFormError("");
      setAddOpen(false);
      await refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        const byField: { name?: string; email?: string; title?: string } = {};
        for (const detail of error.details ?? []) {
          if (detail.field === "name" || detail.field === "first_name") byField.name = detail.message;
          if (detail.field === "work_email") byField.email = detail.message;
          if (detail.field === "job_title") byField.title = detail.message;
        }
        setFieldErrors(byField);
        setFormError(error.message || "The person could not be saved.");
      } else {
        setFormError("The person could not be saved.");
      }
    }
  }

  async function submitInvite() {
    setInviteError("");
    const address = inviteEmail.trim();
    if (!address) {
      setInviteError("Enter an email address.");
      return;
    }
    const requiredError = validateRequiredCustomFields(invitationFieldDefs, inviteCustomData);
    if (requiredError) {
      setInviteError(requiredError);
      return;
    }
    try {
      await invite.mutateAsync({
        email: address,
        custom_data: serializeCustomData(invitationFieldDefs, inviteCustomData),
      });
      setInviteEmail("");
      setInviteCustomData(emptyCustomValues(invitationFieldDefs));
      setSendOpen(false);
      setTab("invitations");
      await refresh();
    } catch (error) {
      setInviteError(error instanceof ApiError ? error.message : "The invitation could not be sent.");
    }
  }

  async function runInviteAction(id: string, action: "resend" | "revoke") {
    setActionBusyId(id);
    setInviteError("");
    try {
      await api(`/api/v1/companies/${companyId}/invitations/${id}/${action}/`, { method: "POST" });
      await refresh();
    } catch (error) {
      setInviteError(
        error instanceof ApiError
          ? error.message
          : action === "resend"
            ? "The invitation could not be resent."
            : "The invitation could not be updated.",
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function importCsv(file: File) {
    setImportNote("");
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const header = (lines[0] ?? "").toLowerCase();
    const start = header.includes("name") || header.includes("email") ? 1 : 0;
    const parsed = lines.slice(start).map((line) => {
      const [first, second, third] = splitCsvLine(line);
      if (first?.includes("@") && !second) return { name: first.split("@")[0], email: first, title: "" };
      return { name: first ?? "", email: second ?? "", title: third ?? "" };
    }).filter((row) => row.name || row.email);
    let saved = 0;
    const problems: string[] = [];
    for (const row of parsed) {
      try {
        if (!canCreate) continue;
        if (!row.name.trim()) {
          problems.push(`${row.email || "row"}: Enter a name.`);
          continue;
        }
        if (!row.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
          problems.push(`${row.name}: Enter a valid email address.`);
          continue;
        }
        if (!row.title.trim()) {
          problems.push(`${row.email}: Enter a designation.`);
          continue;
        }
        await createPerson.mutateAsync({
          name: row.name.trim(),
          work_email: row.email.trim(),
          job_title: row.title.trim(),
          custom_data: serializeCustomData(customFieldDefs, emptyCustomValues(customFieldDefs)),
        });
        saved += 1;
      } catch (error) {
        problems.push(error instanceof ApiError ? `${row.email || row.name}: ${error.message}` : row.email || row.name);
      }
    }
    await refresh();
    setImportNote(problems.length ? `Imported ${saved}. ${problems[0]}` : `Imported ${saved} ${saved === 1 ? "person" : "people"}.`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">People</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">The base identity for everyone in your company. Modules extend people — they never duplicate them.</p>
        </div>
        <div className="flex gap-2">
          {tab === "invitations" && canInvite ? (
            <Button type="button" onClick={() => { setInviteError(""); setInviteEmail(""); setSendOpen(true); }}>Send invitation</Button>
          ) : null}
          {tab === "people" && canCreate ? <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>↑ Import</Button> : null}
          {tab === "people" && canCreate ? <Button type="button" onClick={() => { setFormError(""); setAddOpen(true); }}>+ Add Person</Button> : null}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.target.value = ""; }} />
        </div>
      </div>
      {importNote ? <p className="text-sm text-slate-600 dark:text-slate-300">{importNote}</p> : null}
      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 text-sm">
        <button type="button" className={`border-b-2 px-1 pb-2 ${tab === "people" ? "border-teal-800 font-medium text-slate-900 dark:text-slate-100" : "border-transparent text-slate-500 dark:text-slate-400"}`} onClick={() => setTab("people")}>All people <span className="text-slate-400">{rows.length}</span></button>
        <button type="button" className={`border-b-2 px-1 pb-2 ${tab === "invitations" ? "border-teal-800 font-medium text-slate-900 dark:text-slate-100" : "border-transparent text-slate-500 dark:text-slate-400"}`} onClick={() => setTab("invitations")}>Invitations <span className="text-slate-400">{pendingInvites.length + readyToInvite.length}</span></button>
      </div>
      {tab === "invitations" ? (
        <section id="invitations" className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:grid-cols-[1fr_12rem_14rem]">
            <TextField
              label="Search"
              value={inviteSearch}
              onChange={(event) => setInviteSearch(event.target.value)}
              placeholder="Name or email"
            />
            <SelectField
              label="Status"
              value={inviteStatusFilter}
              onChange={(event) => setInviteStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="ready">Not sent</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </SelectField>
            <SelectField
              label="Sort"
              value={inviteSort}
              onChange={(event) => setInviteSort(event.target.value as SortKey)}
            >
              <option value="sent_desc">Sent (newest)</option>
              <option value="sent_asc">Sent (oldest)</option>
              <option value="email_asc">Email A–Z</option>
              <option value="email_desc">Email Z–A</option>
              <option value="status">Status</option>
              <option value="expires_asc">Expires (soonest)</option>
              <option value="expires_desc">Expires (latest)</option>
            </SelectField>
          </div>
          {invitations.isLoading ? (
            <LoadingState label="Loading invitations" />
          ) : invitationsEmpty ? (
            <EmptyState
              title="No invitations yet"
              body={canInvite ? "Add people with an email on the People tab, then send their invitation here." : "No invitations have been sent yet."}
            />
          ) : filteredEmpty ? (
            <EmptyState title="No matching invitations" body="Try a different search or status filter." />
          ) : (
            <DataTable columns={["Person", "Email", "Status", "Sent", "Expires", "Actions"]}>
              {filteredReady.map((row) => {
                const nameText = personName(row.first_name, row.last_name, row.email);
                return (
                  <tr key={`ready-${row.id}`}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{nameText}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.email}</td>
                    <td className="px-4 py-3"><StatusBadge status="ready" /></td>
                    <td className="px-4 py-3 text-slate-400">—</td>
                    <td className="px-4 py-3 text-slate-400">—</td>
                    <td className="px-4 py-3 text-right">
                      {canInvite ? (
                        <Button
                          type="button"
                          disabled={sendingEmail === row.email}
                          onClick={() => {
                            setInviteError("");
                            setSendingEmail(row.email);
                            void invite
                              .mutateAsync({ email: row.email, custom_data: {} })
                              .then(refresh)
                              .catch((error) => {
                                setInviteError(error instanceof ApiError ? error.message : "The invitation could not be sent.");
                              })
                              .finally(() => setSendingEmail(null));
                          }}
                        >
                          {sendingEmail === row.email ? "Sending…" : "Send"}
                        </Button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredInvitations.map(({ item, display }) => {
                const matched = rows.find((row) => row.email.trim().toLowerCase() === item.email.toLowerCase());
                const nameText = matched
                  ? personName(matched.first_name, matched.last_name, matched.email)
                  : item.email.split("@")[0];
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{nameText}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.email}</td>
                    <td className="px-4 py-3"><StatusBadge status={display} /></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatInviteDate(item.created_at)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatInviteDate(item.expires_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {canInvite && display === "pending" ? (
                        <span className="inline-flex gap-2">
                          <Button
                            variant="secondary"
                            type="button"
                            disabled={actionBusyId === item.id}
                            onClick={() => void runInviteAction(item.id, "resend")}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="secondary"
                            type="button"
                            disabled={actionBusyId === item.id}
                            onClick={() => void runInviteAction(item.id, "revoke")}
                          >
                            Revoke
                          </Button>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
          {inviteError ? <p className="text-sm text-rose-700">{inviteError}</p> : null}
        </section>
      ) : rows.length === 0 ? (
        <EmptyState title="No people yet" body="Add people to the directory, or import a CSV. Send login invitations from the Invitations tab." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Organization</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Membership</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => {
                  const nameText = personName(row.first_name, row.last_name, row.email);
                  const label = membershipLabel(row);
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">{initials(nameText)}</span>
                          <span>
                            <span className="block font-medium text-slate-900 dark:text-slate-100">{nameText}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">{row.job_title || "—"}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.organization}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.roles.map((role) => role.name).join(", ") || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${label === "Active" ? "bg-teal-50 dark:bg-teal-950 text-teal-800" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${label === "Active" ? "bg-teal-600" : "bg-slate-400"}`} />
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{row.last_login ? relativeTime(row.last_login) : "No login"}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" className="font-medium text-teal-800" onClick={() => setViewing(row)}>View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length < 2 ? (
            <div className="border-t border-slate-100 px-6 py-12 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3" /><path d="M6 19c1-3 2.8-4.5 6-4.5s5 1.5 6 4.5" /></svg>
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">No other people yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">Add people to the directory, or import a CSV. Send login invitations from the Invitations tab.</p>
              <div className="mt-4 flex justify-center gap-2">
                {canCreate ? <Button type="button" onClick={() => setAddOpen(true)}>+ Add Person</Button> : null}
                {canCreate ? <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>↑ Import CSV</Button> : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
      <Modal
        open={addOpen}
        title="Add person"
        description="Name, email, and designation are required. Send a login invitation later from the Invitations tab."
        onClose={() => {
          setAddOpen(false);
          setFormError("");
          setFieldErrors({});
        }}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="button" disabled={createPerson.isPending} onClick={() => void submitPerson()}>
              {createPerson.isPending ? "Saving…" : "Add person"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField
            label="Name"
            required
            value={name}
            error={fieldErrors.name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
            autoComplete="name"
          />
          <TextField
            label="Email"
            required
            type="email"
            value={email}
            error={fieldErrors.email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
            autoComplete="email"
          />
          <TextField
            label="Designation"
            required
            value={title}
            error={fieldErrors.title}
            onChange={(event) => {
              setTitle(event.target.value);
              setFieldErrors((prev) => ({ ...prev, title: undefined }));
            }}
          />
          <CustomFieldInputs companyId={companyId} defs={customFieldDefs} values={customData} onChange={setCustomData} />
          {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
        </div>
      </Modal>
      <Modal
        open={sendOpen}
        title="Send invitation"
        description="Email a login link. Creating a person does not send this automatically."
        onClose={() => setSendOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button type="button" disabled={invite.isPending || !inviteEmail.trim()} onClick={() => void submitInvite()}>
              {invite.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField
            label="Email"
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="name@company.com"
            required
            autoComplete="email"
          />
          <CustomFieldInputs
            companyId={companyId}
            defs={invitationFieldDefs}
            values={inviteCustomData}
            onChange={setInviteCustomData}
          />
          {inviteError ? <p className="text-sm text-rose-700">{inviteError}</p> : null}
        </div>
      </Modal>
      <Modal open={Boolean(viewing)} title={viewing ? personName(viewing.first_name, viewing.last_name, viewing.email) : "Person"} onClose={() => setViewing(null)}>
        {viewing ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">{viewing.email || "No email"} · {viewing.job_title || "No job title"}</p>
            <p className="text-slate-600 dark:text-slate-300">{viewing.organization} · {membershipLabel(viewing)}</p>
            {customFieldDefs.length ? (
              <dl className="grid gap-2 sm:grid-cols-2">
                {customFieldDefs.map((def) => {
                  const linkLabels: Record<string, string> = {
                    ...Object.fromEntries((roles.data?.results ?? []).map((role) => [role.id, role.name])),
                    ...Object.fromEntries(
                      (people.data?.results ?? [])
                        .filter((row) => row.person_id)
                        .map((row) => [row.person_id as string, personName(row.first_name, row.last_name, row.email)]),
                    ),
                    ...Object.fromEntries((orgForLabels.data?.units ?? []).map((unit) => [unit.id, unit.name])),
                  };
                  return (
                    <div key={def.id}>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{def.name}</dt>
                      <dd className="mt-0.5 text-slate-800 dark:text-slate-200">
                        {formatCustomFieldDisplay(def, viewing.custom_data?.[def.key], linkLabels)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
            {viewing.permissions.length ? <p className="text-slate-500 dark:text-slate-400">Effective permissions: {viewing.permissions.join(", ")}</p> : null}
            {viewing.membership_id && canManage && viewing.membership_status === "active" ? <Button variant="secondary" type="button" onClick={() => changeStatus.mutate({ id: viewing.membership_id!, next: "suspended" })}>Suspend</Button> : null}
            {viewing.membership_id && canManage && viewing.membership_status === "suspended" ? <Button variant="secondary" type="button" onClick={() => changeStatus.mutate({ id: viewing.membership_id!, next: "active" })}>Activate</Button> : null}
            {viewing.membership_id && canRemove && viewing.membership_status !== "removed" ? <Button variant="secondary" type="button" onClick={() => changeStatus.mutate({ id: viewing.membership_id!, next: "removed" })}>Remove</Button> : null}
            {viewing.person_id && canCreate && viewing.status === "active" ? (
              <Button
                variant="secondary"
                type="button"
                disabled={changePersonStatus.isPending}
                onClick={() => changePersonStatus.mutate({ personId: viewing.person_id!, next: "inactive" })}
              >
                Deactivate person
              </Button>
            ) : null}
            {viewing.person_id && canCreate && viewing.status === "inactive" ? (
              <Button
                variant="secondary"
                type="button"
                disabled={changePersonStatus.isPending}
                onClick={() => changePersonStatus.mutate({ personId: viewing.person_id!, next: "active" })}
              >
                Reactivate person
              </Button>
            ) : null}
            {changeStatus.error instanceof ApiError ? <p className="text-rose-700">{changeStatus.error.message}</p> : null}
            {changePersonStatus.error instanceof ApiError ? <p className="text-rose-700">{changePersonStatus.error.message}</p> : null}
            {canAssign && roles.data && viewing.membership_id ? (
              <RoleAssignment
                key={viewing.roles.map((role) => role.id).join("-") || viewing.id}
                list={roles.data}
                selected={viewing}
                pending={assign.isPending}
                error={assign.error}
                onSave={(roleIds) => assign.mutate({ id: viewing.membership_id!, roleIds })}
              />
            ) : null}
            {!viewing.membership_id && canInvite && viewing.email ? (
              <p className="text-slate-500 dark:text-slate-400">No login yet. Send an invitation from the Invitations tab.</p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RoleAssignment({
  list,
  selected,
  pending,
  error,
  onSave,
}: {
  list: RoleList;
  selected: PersonRow;
  pending: boolean;
  error: unknown;
  onSave: (roleIds: string[]) => void;
}) {
  return (
    <form className="space-y-2 border-t border-slate-100 pt-3" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const chosen = form.getAll("role").map(String);
      const preserved = list.caller_holds_owner_role
        ? []
        : selected.roles.filter((role) => list.results.some((item) => item.id === role.id && item.is_owner_role)).map((role) => role.id);
      onSave([...new Set([...chosen, ...preserved])]);
    }}>
      <p className="font-medium text-slate-900 dark:text-slate-100">Roles</p>
      {list.results.map((role) => {
        const locked = role.is_owner_role && !list.caller_holds_owner_role;
        return (
          <label key={role.id} className={`flex items-center gap-2 ${locked ? "text-slate-500 dark:text-slate-400" : ""}`}>
            <input type="checkbox" name="role" value={role.id} defaultChecked={selected.roles.some((item) => item.id === role.id)} disabled={locked} />
            {role.name}
          </label>
        );
      })}
      <Button type="submit" disabled={pending}>Save roles</Button>
      {error instanceof ApiError ? <p className="text-rose-700">{error.message}</p> : null}
    </form>
  );
}
