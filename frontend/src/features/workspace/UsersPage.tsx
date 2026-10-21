import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { EmptyState, LoadingState } from "../../shared/ui/States";
import { initials, personName, relativeTime } from "./format";
import type { PersonRow, WorkspacePayload } from "./types";

type Invitation = { id: string; email: string; status: string };
type Role = { id: string; name: string; is_owner_role: boolean };
type RoleList = { results: Role[]; caller_holds_owner_role: boolean };

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700";

function membershipLabel(row: PersonRow) {
  if (row.membership_status === "active") return "Active";
  if (row.membership_status === "invited") return "Invited";
  if (row.membership_status === "suspended") return "Suspended";
  return "No login";
}

function splitCsvLine(line: string) {
  return line.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
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
  const [viewing, setViewing] = useState<PersonRow | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [inviteToo, setInviteToo] = useState(true);
  const [formError, setFormError] = useState("");
  const [importNote, setImportNote] = useState("");
  const canInvite = workspace.permissions.includes("membership.invite");
  const canCreate = workspace.permissions.includes("people.create");
  const canManage = workspace.permissions.includes("membership.update");
  const canRemove = workspace.permissions.includes("membership.remove");
  const canAssign = workspace.permissions.includes("roles.manage");

  const people = useQuery({
    queryKey: ["people", companyId],
    queryFn: () => api<{ results: PersonRow[] }>(`/api/v1/companies/${companyId}/people/`),
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
  const roles = useQuery({
    queryKey: ["roles", companyId],
    queryFn: () => api<RoleList>(`/api/v1/companies/${companyId}/roles/`),
    enabled: canAssign,
  });

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
    mutationFn: (body: { name: string; work_email: string; job_title: string }) =>
      api<PersonRow>(`/api/v1/companies/${companyId}/people/`, { method: "POST", body: JSON.stringify(body) }),
  });
  const invite = useMutation({
    mutationFn: (address: string) => api(`/api/v1/companies/${companyId}/invitations/`, { method: "POST", body: JSON.stringify({ email: address }) }),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      api(`/api/v1/companies/${companyId}/memberships/${id}/status/`, { method: "POST", body: JSON.stringify({ status: next }) }),
    onSuccess: refresh,
  });
  const assign = useMutation({
    mutationFn: ({ id, roleIds }: { id: string; roleIds: string[] }) =>
      api(`/api/v1/companies/${companyId}/memberships/${id}/roles/`, { method: "PUT", body: JSON.stringify({ role_ids: roleIds }) }),
    onSuccess: refresh,
  });

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
  const pendingInvites = (invitations.data?.results ?? []).filter((item) => item.status === "pending");
  const invitationRows = invitations.data?.results ?? [];

  async function submitPerson() {
    setFormError("");
    try {
      if (canCreate) {
        await createPerson.mutateAsync({ name, work_email: email, job_title: title });
      }
      if (inviteToo && email && canInvite) {
        await invite.mutateAsync(email);
      }
      setName("");
      setEmail("");
      setTitle("");
      setAddOpen(false);
      await refresh();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "The person could not be saved.");
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
        if (canCreate && row.name) {
          await createPerson.mutateAsync({ name: row.name, work_email: row.email, job_title: row.title });
          saved += 1;
        }
        if (row.email && canInvite) {
          await invite.mutateAsync(row.email);
        }
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
          <h1 className="text-2xl font-semibold text-slate-900">People</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">The base identity for everyone in your company. Modules extend people — they never duplicate them.</p>
        </div>
        <div className="flex gap-2">
          {canCreate ? <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>↑ Import</Button> : null}
          {canCreate || canInvite ? <Button type="button" onClick={() => { setFormError(""); setAddOpen(true); }}>+ Add Person</Button> : null}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.target.value = ""; }} />
        </div>
      </div>
      {importNote ? <p className="text-sm text-slate-600">{importNote}</p> : null}
      <div className="flex gap-4 border-b border-slate-200 text-sm">
        <button type="button" className={`border-b-2 px-1 pb-2 ${tab === "people" ? "border-teal-800 font-medium text-slate-900" : "border-transparent text-slate-500"}`} onClick={() => setTab("people")}>All people <span className="text-slate-400">{rows.length}</span></button>
        <button type="button" className={`border-b-2 px-1 pb-2 ${tab === "invitations" ? "border-teal-800 font-medium text-slate-900" : "border-transparent text-slate-500"}`} onClick={() => setTab("invitations")}>Invitations <span className="text-slate-400">{pendingInvites.length}</span></button>
      </div>
      {tab === "invitations" ? (
        <section id="invitations" className="rounded-xl border border-slate-200 bg-white">
          {invitationRows.length === 0 ? <p className="px-4 py-8 text-sm text-slate-500">No invitations.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {invitationRows.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>{item.email} · <span className="capitalize text-slate-500">{item.status}</span></span>
                  {canInvite && item.status === "pending" ? (
                    <span className="flex gap-2">
                      <Button variant="secondary" type="button" onClick={() => api(`/api/v1/companies/${companyId}/invitations/${item.id}/resend/`, { method: "POST" }).then(refresh)}>Resend</Button>
                      <Button variant="secondary" type="button" onClick={() => api(`/api/v1/companies/${companyId}/invitations/${item.id}/revoke/`, { method: "POST" }).then(refresh)}>Revoke</Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : rows.length === 0 ? (
        <EmptyState title="No people yet" body="Invite teammates with a login, add people who don't need to sign in, or import a CSV." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
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
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const nameText = personName(row.first_name, row.last_name, row.email);
                  const label = membershipLabel(row);
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials(nameText)}</span>
                          <span>
                            <span className="block font-medium text-slate-900">{nameText}</span>
                            <span className="block text-xs text-slate-500">{row.job_title || "—"}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.organization}</td>
                      <td className="px-4 py-3 text-slate-600">{row.roles.map((role) => role.name).join(", ") || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${label === "Active" ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${label === "Active" ? "bg-teal-600" : "bg-slate-400"}`} />
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{row.last_login ? relativeTime(row.last_login) : "No login"}</td>
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
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3" /><path d="M6 19c1-3 2.8-4.5 6-4.5s5 1.5 6 4.5" /></svg>
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-900">No other people yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Invite teammates with a login, add people who don't need to sign in, or import a CSV.</p>
              <div className="mt-4 flex justify-center gap-2">
                {canCreate || canInvite ? <Button type="button" onClick={() => setAddOpen(true)}>+ Add Person</Button> : null}
                {canCreate ? <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>↑ Import CSV</Button> : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
      <Modal
        open={addOpen}
        title="Add person"
        description="Add someone to the company directory. Invite them when they need a login."
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="button" disabled={createPerson.isPending || invite.isPending || (canCreate && !name.trim()) || (!canCreate && !email.trim())} onClick={() => void submitPerson()}>Add person</Button>
          </>
        }
      >
        <div className="space-y-3">
          {canCreate ? <label className="block text-sm font-medium text-slate-700">Name <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required /></label> : null}
          <label className="block text-sm font-medium text-slate-700">Email <input className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {canCreate ? <label className="block text-sm font-medium text-slate-700">Job title <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} /></label> : null}
          {canInvite ? <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={inviteToo} onChange={(event) => setInviteToo(event.target.checked)} /> Invite them to sign in</label> : null}
          {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
        </div>
      </Modal>
      <Modal open={Boolean(viewing)} title={viewing ? personName(viewing.first_name, viewing.last_name, viewing.email) : "Person"} onClose={() => setViewing(null)}>
        {viewing ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">{viewing.email || "No email"} · {viewing.job_title || "No job title"}</p>
            <p className="text-slate-600">{viewing.organization} · {membershipLabel(viewing)}</p>
            {viewing.permissions.length ? <p className="text-slate-500">Effective permissions: {viewing.permissions.join(", ")}</p> : null}
            {viewing.membership_id && canManage && viewing.membership_status === "active" ? <Button variant="secondary" type="button" onClick={() => changeStatus.mutate({ id: viewing.membership_id!, next: "suspended" })}>Suspend</Button> : null}
            {viewing.membership_id && canManage && viewing.membership_status === "suspended" ? <Button variant="secondary" type="button" onClick={() => changeStatus.mutate({ id: viewing.membership_id!, next: "active" })}>Activate</Button> : null}
            {viewing.membership_id && canRemove && viewing.membership_status !== "removed" ? <Button variant="secondary" type="button" onClick={() => changeStatus.mutate({ id: viewing.membership_id!, next: "removed" })}>Remove</Button> : null}
            {changeStatus.error instanceof ApiError ? <p className="text-rose-700">{changeStatus.error.message}</p> : null}
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
            {!viewing.membership_id && canInvite && viewing.email ? <Button type="button" onClick={() => invite.mutate(viewing.email, { onSuccess: refresh })}>Invite to sign in</Button> : null}
            {invite.error instanceof ApiError ? <p className="text-rose-700">{invite.error.message}</p> : null}
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
      <p className="font-medium text-slate-900">Roles</p>
      {list.results.map((role) => {
        const locked = role.is_owner_role && !list.caller_holds_owner_role;
        return (
          <label key={role.id} className={`flex items-center gap-2 ${locked ? "text-slate-500" : ""}`}>
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
