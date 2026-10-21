import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { ErrorState, LoadingState } from "../../shared/ui/States";
import { codeFromName, initials, personName, slugify } from "./format";
import type { PersonRow, WorkspacePayload } from "./types";

type UnitType = {
  id: string;
  key: string;
  singular_label: string;
  plural_label: string;
  is_active: boolean;
  position: number;
};

type Unit = {
  id: string;
  key: string;
  name: string;
  description: string;
  status: string;
  parent_id: string | null;
  unit_type_id: string | null;
  manager_id: string | null;
  manager_name: string;
  member_count: number;
};

type OrgPerson = { id: string; name: string; department_id: string | null };

type OrganizationPayload = { types: UnitType[]; units: Unit[]; people: OrgPerson[] };

type TypeDraft = { id: string; key: string; singular_label: string };

type UnitForm = {
  id: string;
  name: string;
  key: string;
  parent_id: string;
  unit_type_id: string;
  manager_id: string;
  status: string;
};

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700";
const emptyUnit: UnitForm = { id: "", name: "", key: "", parent_id: "", unit_type_id: "", manager_id: "", status: "active" };

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The request failed.";
}

function isDescendant(unit: Unit, ancestorId: string, units: Unit[], seen = new Set<string>()): boolean {
  if (!ancestorId || !unit.parent_id || seen.has(unit.id)) return false;
  if (unit.parent_id === ancestorId) return true;
  const parent = units.find((item) => item.id === unit.parent_id);
  if (!parent) return false;
  const next = new Set(seen);
  next.add(unit.id);
  return isDescendant(parent, ancestorId, units, next);
}

export function OrganizationPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const canManage = workspace.permissions.includes("departments.manage");
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const opened = useRef(false);
  const organization = useQuery({
    queryKey: ["organization", companyId],
    queryFn: () => api<OrganizationPayload>(`/api/v1/companies/${companyId}/organization/units/`),
  });
  const directory = useQuery({
    queryKey: ["people", companyId],
    queryFn: () => api<{ results: PersonRow[] }>(`/api/v1/companies/${companyId}/people/`),
    retry: false,
  });
  const [selectedId, setSelectedId] = useState("company");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [unitForm, setUnitForm] = useState<UnitForm>(emptyUnit);
  const [drafts, setDrafts] = useState<TypeDraft[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [formError, setFormError] = useState("");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["organization", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["company-overview"] });
    await queryClient.invalidateQueries({ queryKey: ["people", companyId] });
  };

  const saveType = useMutation({
    mutationFn: async (rows: TypeDraft[]) => {
      for (const [index, row] of rows.entries()) {
        const label = row.singular_label.trim();
        if (!label) continue;
        const plural = label.endsWith("s") ? label : `${label}s`;
        if (row.id) {
          await api(`/api/v1/companies/${companyId}/organization/unit-types/${row.id}/`, {
            method: "PATCH",
            body: JSON.stringify({ singular_label: label, plural_label: plural, position: index }),
          });
        } else {
          await api(`/api/v1/companies/${companyId}/organization/unit-types/`, {
            method: "POST",
            body: JSON.stringify({
              key: row.key || slugify(label),
              singular_label: label,
              plural_label: plural,
              position: index,
              is_active: true,
              allowed_parent_keys: [],
            }),
          });
        }
      }
    },
    onSuccess: async () => {
      setFormError("");
      setTypesOpen(false);
      await refresh();
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const saveUnit = useMutation({
    mutationFn: () => {
      const body = {
        name: unitForm.name,
        ...(unitForm.key.trim() ? { key: unitForm.key.trim() } : {}),
        parent_id: unitForm.parent_id || null,
        unit_type_id: unitForm.unit_type_id || null,
        manager_id: unitForm.manager_id || null,
        status: unitForm.status,
      };
      const path = unitForm.id
        ? `/api/v1/companies/${companyId}/organization/units/${unitForm.id}/`
        : `/api/v1/companies/${companyId}/organization/units/`;
      return api<Unit>(path, { method: unitForm.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (unit) => {
      setFormError("");
      setAddOpen(false);
      setSelectedId(unit.id);
      await refresh();
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const saveMembers = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/organization/units/${selectedId}/members/`, {
        method: "PUT",
        body: JSON.stringify({ person_ids: memberIds }),
      }),
    onSuccess: async () => {
      setFormError("");
      await refresh();
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const units = organization.data?.units ?? [];
  const types = organization.data?.types ?? [];
  const people = useMemo(() => {
    if (directory.data?.results) {
      return directory.data.results
        .filter((person) => person.person_id)
        .map((person) => ({
          id: person.person_id as string,
          name: personName(person.first_name, person.last_name, person.email),
          title: person.job_title,
          department_id: person.department_id,
        }));
    }
    return (organization.data?.people ?? []).map((person) => ({ id: person.id, name: person.name, title: "", department_id: person.department_id }));
  }, [directory.data, organization.data]);

  useEffect(() => {
    if (opened.current || params.get("add") !== "1" || !organization.data) return;
    opened.current = true;
    openAdd("");
    const next = new URLSearchParams(params);
    next.delete("add");
    setParams(next, { replace: true });
  }, [organization.data, params, setParams]);

  useEffect(() => {
    if (selectedId === "company") return;
    setMemberIds(people.filter((person) => person.department_id === selectedId).map((person) => person.id));
  }, [selectedId, people]);

  if (organization.isLoading) return <LoadingState label="Loading organization" />;
  if (organization.isError) return <ErrorState title="Organization is unavailable" body={errorMessage(organization.error)} />;

  const needle = search.trim().toLowerCase();
  const visibleUnits = needle
    ? units.filter((unit) => unit.name.toLowerCase().includes(needle) || unit.key.toLowerCase().includes(needle))
    : units;
  const selected = units.find((unit) => unit.id === selectedId) ?? null;
  const typeName = (id: string | null) => types.find((type) => type.id === id)?.singular_label ?? "Unit";

  function childrenOf(parentId: string | null) {
    return visibleUnits.filter((unit) => (unit.parent_id ?? null) === parentId).sort((left, right) => left.name.localeCompare(right.name));
  }

  function subtreeCount(id: string | null): number {
    const direct = people.filter((person) => (person.department_id ?? null) === id).length;
    const kids = units.filter((unit) => (unit.parent_id ?? null) === id);
    return direct + kids.reduce((sum, kid) => sum + subtreeCount(kid.id), 0);
  }

  function openAdd(parentId: string) {
    const team = types.find((type) => type.singular_label.toLowerCase() === "team") ?? types.find((type) => type.is_active) ?? types[0];
    setUnitForm({ ...emptyUnit, parent_id: parentId, unit_type_id: team?.id ?? "" });
    setFormError("");
    setAddOpen(true);
  }

  function openEdit(unit: Unit) {
    setUnitForm({
      id: unit.id,
      name: unit.name,
      key: unit.key,
      parent_id: unit.parent_id ?? "",
      unit_type_id: unit.unit_type_id ?? "",
      manager_id: unit.manager_id ?? "",
      status: unit.status,
    });
    setFormError("");
    setAddOpen(true);
  }

  function openTypes() {
    const existing = [...types].sort((left, right) => left.position - right.position).map((type) => ({ id: type.id, key: type.key, singular_label: type.singular_label }));
    setDrafts(existing.length ? existing : [
      { id: "", key: "division", singular_label: "Division" },
      { id: "", key: "department", singular_label: "Department" },
      { id: "", key: "team", singular_label: "Team" },
    ]);
    setFormError("");
    setTypesOpen(true);
  }

  function renderBranch(parentId: string | null, depth: number) {
    return childrenOf(parentId).map((unit) => (
      <div key={unit.id}>
        <button
          type="button"
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selectedId === unit.id ? "bg-teal-50 text-teal-900" : "text-slate-700 hover:bg-slate-50"}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => setSelectedId(unit.id)}
        >
          <span>{unit.name} <span className="text-xs text-slate-400">{typeName(unit.unit_type_id)}</span></span>
          <span className="text-xs text-slate-400">{subtreeCount(unit.id)}</span>
        </button>
        {renderBranch(unit.id, depth + 1)}
      </div>
    ));
  }

  const detailPeople = selected ? people.filter((person) => person.department_id === selected.id) : people.filter((person) => !person.department_id);
  const manager = selected?.manager_id ? people.find((person) => person.id === selected.manager_id) : people[0];
  const detailTitle = selected ? selected.name : workspace.company.display_name;
  const detailType = selected ? typeName(selected.unit_type_id) : "Company";
  const detailCode = selected ? (selected.key || codeFromName(selected.name)) : codeFromName(workspace.company.display_name);
  const parentName = selected?.parent_id ? units.find((unit) => unit.id === selected.parent_id)?.name ?? "—" : selected ? workspace.company.display_name : "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Organization</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">One primary hierarchy for your company. Units define scope for permissions, dashboards and reports.</p>
        </div>
        <div className="flex gap-2">
          {canManage ? <Button type="button" variant="secondary" onClick={openTypes}>Unit types</Button> : null}
          {canManage ? <Button type="button" onClick={() => openAdd(selected && selected.id !== "company" ? selected.id : "")}>+ Add unit</Button> : null}
        </div>
      </div>
      {formError && !addOpen && !typesOpen ? <p className="text-sm text-rose-700">{formError}</p> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="relative block">
            <span className="sr-only">Search units or codes</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8.5" cy="8.5" r="5" /><path d="m12.5 12.5 4 4" /></svg>
            </span>
            <input className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" placeholder="Search units or codes" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <button type="button" className={`mt-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selectedId === "company" ? "bg-teal-50 text-teal-900" : "text-slate-700 hover:bg-slate-50"}`} onClick={() => setSelectedId("company")}>
            <span className="font-medium">{workspace.company.display_name} <span className="font-normal text-xs text-slate-400">Company</span></span>
            <span className="text-xs text-slate-400">{people.length || 1}</span>
          </button>
          {needle ? (
            <div className="mt-1">
              {visibleUnits.map((unit) => (
                <button key={unit.id} type="button" className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selectedId === unit.id ? "bg-teal-50" : "hover:bg-slate-50"}`} onClick={() => setSelectedId(unit.id)}>
                  <span>{unit.name}</span>
                  <span className="text-xs text-slate-400">{unit.key}</span>
                </button>
              ))}
            </div>
          ) : units.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 20V7h7v13M11 10h8v10" /></svg>
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-900">Only your company exists so far</p>
              <p className="mt-1 text-sm text-slate-500">Add departments and teams to model how your company is organized.</p>
              {canManage ? <Button type="button" className="mt-4" onClick={() => openAdd("")}>+ Add first unit</Button> : null}
            </div>
          ) : (
            <div className="mt-1">{renderBranch(null, 1)}</div>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{detailTitle}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{detailType}</span>
              </div>
              <p className="text-sm text-slate-500">{selected ? (selected.parent_id ? "In the hierarchy" : "Reports to the company") : "Top of hierarchy"}{selected && selected.status !== "active" ? ` · ${selected.status}` : ""}</p>
            </div>
            {selected && canManage ? <Button type="button" variant="secondary" onClick={() => openEdit(selected)}>Edit</Button> : null}
            {!selected ? <Link to="/app/settings" className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">Edit</Link> : null}
          </div>
          <dl className="grid sm:grid-cols-2">
            <div className="border-b border-slate-100 px-5 py-3"><dt className="text-xs text-slate-500">Unit type</dt><dd className="text-sm text-slate-900">{detailType}</dd></div>
            <div className="border-b border-slate-100 px-5 py-3"><dt className="text-xs text-slate-500">Unit code</dt><dd className="text-sm uppercase text-slate-900">{detailCode}</dd></div>
            <div className="border-b border-slate-100 px-5 py-3"><dt className="text-xs text-slate-500">Parent</dt><dd className="text-sm text-slate-900">{parentName}</dd></div>
            <div className="border-b border-slate-100 px-5 py-3"><dt className="text-xs text-slate-500">Members (incl. sub-units)</dt><dd className="text-sm text-slate-900">{selected ? subtreeCount(selected.id) : people.length}</dd></div>
          </dl>
          <div className="border-b border-slate-100 px-5 py-3">
            <p className="text-xs text-slate-500">Responsible person</p>
            {manager ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials(manager.name)}</span>
                <span><span className="block text-sm font-medium text-slate-900">{manager.name}</span><span className="block text-xs text-slate-500">{manager.title || detailType}</span></span>
              </div>
            ) : <p className="mt-1 text-sm text-slate-500">None</p>}
          </div>
          <div className="px-5 py-3">
            <p className="text-xs text-slate-500">Direct members</p>
            {detailPeople.length === 0 ? <p className="mt-2 text-sm text-slate-500">No direct members.</p> : (
              <ul className="mt-2 space-y-2">
                {detailPeople.map((person) => (
                  <li key={person.id} className="flex items-center gap-2 text-sm text-slate-800">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{initials(person.name)}</span>
                    {person.name}
                  </li>
                ))}
              </ul>
            )}
            {canManage && selected ? (
              <form className="mt-4 space-y-2 border-t border-slate-100 pt-3" onSubmit={(event) => { event.preventDefault(); saveMembers.mutate(); }}>
                <p className="text-sm font-medium text-slate-900">Assign people</p>
                {people.length === 0 ? <p className="text-sm text-slate-500">No people are available to assign.</p> : people.map((person) => (
                  <label key={person.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={memberIds.includes(person.id)} onChange={(event) => setMemberIds(event.target.checked ? [...memberIds, person.id] : memberIds.filter((id) => id !== person.id))} />
                    {person.name}
                  </label>
                ))}
                <Button type="submit" variant="secondary" disabled={saveMembers.isPending || people.length === 0}>Save people</Button>
              </form>
            ) : null}
          </div>
        </section>
      </div>
      <Modal
        open={addOpen}
        title={unitForm.id ? "Edit organization unit" : "Add organization unit"}
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="button" disabled={saveUnit.isPending || !unitForm.name.trim() || !unitForm.unit_type_id} onClick={() => saveUnit.mutate()}>{unitForm.id ? "Save unit" : "Add unit"}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Unit name *
            <input className={fieldClass} value={unitForm.name} onChange={(event) => setUnitForm({ ...unitForm, name: event.target.value })} required />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Unit type *
              <select className={fieldClass} value={unitForm.unit_type_id} onChange={(event) => setUnitForm({ ...unitForm, unit_type_id: event.target.value })} required>
                <option value="">Select a type</option>
                {types.filter((type) => type.is_active || type.id === unitForm.unit_type_id).map((type) => <option key={type.id} value={type.id}>{type.singular_label}</option>)}
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">Labels are configurable.</span>
            </label>
            <label className="block text-sm font-medium text-slate-700">Unit code <span className="font-normal text-slate-400">Optional</span>
              <input className={fieldClass} placeholder="ENG-QA" value={unitForm.key} onChange={(event) => setUnitForm({ ...unitForm, key: event.target.value })} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Parent unit *
              <select className={fieldClass} value={unitForm.parent_id} onChange={(event) => setUnitForm({ ...unitForm, parent_id: event.target.value })}>
                <option value="">{workspace.company.display_name}</option>
                {units.filter((unit) => unit.id !== unitForm.id && !isDescendant(unit, unitForm.id, units)).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">Responsible person <span className="font-normal text-slate-400">Optional</span>
              <select className={fieldClass} value={unitForm.manager_id} onChange={(event) => setUnitForm({ ...unitForm, manager_id: event.target.value })}>
                <option value="">None</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
          </div>
          {unitForm.id ? (
            <label className="block text-sm font-medium text-slate-700">Status
              <select className={fieldClass} value={unitForm.status} onChange={(event) => setUnitForm({ ...unitForm, status: event.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          ) : null}
          {!types.length ? <p className="text-sm text-slate-600">Add a unit type before creating a unit. <button type="button" className="font-medium text-teal-800" onClick={() => { setAddOpen(false); openTypes(); }}>Open unit types</button></p> : null}
          {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
        </div>
      </Modal>
      <Modal
        open={typesOpen}
        title="Unit types"
        description="Labels for levels in your hierarchy. They don't grant access or define roles."
        onClose={() => setTypesOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDrafts([...drafts, { id: "", key: "", singular_label: "" }])}>Add type</Button>
            <Button type="button" disabled={saveType.isPending} onClick={() => saveType.mutate(drafts)}>Done</Button>
          </>
        }
      >
        <div className="space-y-2">
          <input className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" value="Company" disabled />
          {drafts.map((row, index) => (
            <input
              key={row.id || `new-${index}`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={row.singular_label}
              onChange={(event) => setDrafts(drafts.map((item, itemIndex) => itemIndex === index ? { ...item, singular_label: event.target.value } : item))}
            />
          ))}
          {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
