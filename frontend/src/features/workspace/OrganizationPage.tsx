import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { ErrorState, LoadingState } from "../../shared/ui/States";
import {
  CustomFieldInputs,
  emptyCustomValues,
  formatCustomFieldDisplay,
  serializeCustomData,
  validateRequiredCustomFields,
  type CustomFieldDef,
} from "./CustomFieldInputs";
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
  custom_data?: Record<string, unknown>;
};

type OrgPerson = { id: string; name: string; title?: string; department_id: string | null };

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
  custom_data: Record<string, unknown>;
};

type ViewMode = "tree" | "list";

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15";
const emptyUnit: UnitForm = {
  id: "",
  name: "",
  key: "",
  parent_id: "",
  unit_type_id: "",
  manager_id: "",
  status: "active",
  custom_data: {},
};
const COMPANY_ID = "company";

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

function unitPath(unit: Unit, units: Unit[]): Unit[] {
  const path: Unit[] = [];
  let current: Unit | undefined = unit;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parent_id ? units.find((item) => item.id === current!.parent_id) : undefined;
  }
  return path;
}

function typeKind(type: UnitType | undefined): "company" | "division" | "department" | "team" | "other" {
  const key = (type?.key || type?.singular_label || "").toLowerCase();
  if (key.includes("division")) return "division";
  if (key.includes("department")) return "department";
  if (key.includes("team")) return "team";
  if (key.includes("company")) return "company";
  return "other";
}

function typeBadgeClass(kind: ReturnType<typeof typeKind>) {
  if (kind === "division") return "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
  if (kind === "department") return "bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
  if (kind === "team") return "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  if (kind === "company") return "bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.5 12.5 4 4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="m6 3.5 5 4.5-5 4.5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <circle cx="8" cy="3.5" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="8" cy="12.5" r="1.2" />
    </svg>
  );
}

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-9 w-9 text-xs" : "h-6 w-6 text-[10px]";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-teal-50 font-semibold text-teal-900 dark:bg-teal-950 dark:text-teal-100 ${dim}`}
      title={name}
    >
      {initials(name)}
    </span>
  );
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
  const unitFields = useQuery({
    queryKey: ["custom-fields", companyId, "organization_unit"],
    queryFn: () =>
      api<{ results: CustomFieldDef[] }>(`/api/v1/companies/${companyId}/custom-fields/?entity=organization_unit`),
  });
  const customFieldDefs = unitFields.data?.results ?? [];
  const hasRoleLinks = customFieldDefs.some((def) => def.field_type === "reference" && def.config?.target === "role");
  const rolesForLabels = useQuery({
    queryKey: ["roles", companyId],
    queryFn: () => api<{ results: Array<{ id: string; name: string }> }>(`/api/v1/companies/${companyId}/roles/`),
    enabled: hasRoleLinks,
  });
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [unitForm, setUnitForm] = useState<UnitForm>(emptyUnit);
  const [drafts, setDrafts] = useState<TypeDraft[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [formError, setFormError] = useState("");
  const expandedSeeded = useRef(false);

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
    return (organization.data?.people ?? []).map((person) => ({
      id: person.id,
      name: person.name,
      title: "",
      department_id: person.department_id,
    }));
  }, [directory.data, organization.data]);

  const typeById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);

  const paramUnit = params.get("unit") || "";
  const selectedId = paramUnit && units.some((unit) => unit.id === paramUnit) ? paramUnit : COMPANY_ID;

  function selectUnit(id: string) {
    const next = new URLSearchParams(params);
    if (!id || id === COMPANY_ID) next.delete("unit");
    else next.set("unit", id);
    next.delete("add");
    setParams(next, { replace: true });
    setMobileDetailsOpen(true);
  }

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
        custom_data: serializeCustomData(customFieldDefs, unitForm.custom_data),
      };
      const path = unitForm.id
        ? `/api/v1/companies/${companyId}/organization/units/${unitForm.id}/`
        : `/api/v1/companies/${companyId}/organization/units/`;
      return api<Unit>(path, { method: unitForm.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (unit) => {
      setFormError("");
      setAddOpen(false);
      selectUnit(unit.id);
      await refresh();
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  function submitUnit() {
    const requiredError = validateRequiredCustomFields(customFieldDefs, unitForm.custom_data);
    if (requiredError) {
      setFormError(requiredError);
      return;
    }
    saveUnit.mutate();
  }

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

  const deleteUnit = useMutation({
    mutationFn: () => api(`/api/v1/companies/${companyId}/organization/units/${selectedId}/`, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirmDelete(false);
      setFormError("");
      selectUnit(COMPANY_ID);
      await refresh();
    },
    onError: (error) => {
      setConfirmDelete(false);
      setFormError(errorMessage(error));
    },
  });

  useEffect(() => {
    if (opened.current || params.get("add") !== "1" || !organization.data) return;
    opened.current = true;
    openAdd("");
    const next = new URLSearchParams(params);
    next.delete("add");
    setParams(next, { replace: true });
  }, [organization.data, params, setParams]);

  useEffect(() => {
    if (paramUnit && organization.data && !units.some((unit) => unit.id === paramUnit)) {
      const next = new URLSearchParams(params);
      next.delete("unit");
      setParams(next, { replace: true });
    }
  }, [organization.data, paramUnit, params, setParams, units]);

  useEffect(() => {
    setAssignOpen(false);
    setAssignSearch("");
  }, [selectedId]);

  useEffect(() => {
    if (selectedId === COMPANY_ID) {
      setMemberIds([]);
      return;
    }
    setMemberIds(people.filter((person) => person.department_id === selectedId).map((person) => person.id));
  }, [selectedId, people]);

  useEffect(() => {
    if (!addOpen || !unitFields.data) return;
    const defs = unitFields.data.results;
    setUnitForm((prev) => {
      const merged = emptyCustomValues(defs, prev.custom_data);
      const same =
        defs.every((def) => def.key in prev.custom_data) &&
        Object.keys(prev.custom_data).every((key) => defs.some((def) => def.key === key) || key in merged);
      if (same && defs.every((def) => def.key in prev.custom_data)) return prev;
      return { ...prev, custom_data: merged };
    });
  }, [addOpen, unitFields.data]);

  useEffect(() => {
    if (expandedSeeded.current || !organization.data) return;
    expandedSeeded.current = true;
    const roots = units.filter((unit) => !unit.parent_id).map((unit) => unit.id);
    setExpanded(new Set([COMPANY_ID, ...roots]));
  }, [organization.data, units]);

  useEffect(() => {
    if (!selectedId || selectedId === COMPANY_ID) return;
    const selectedUnit = units.find((unit) => unit.id === selectedId);
    if (!selectedUnit) return;
    const path = unitPath(selectedUnit, units);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(COMPANY_ID);
      for (const crumb of path) {
        if (crumb.parent_id) next.add(crumb.parent_id);
        else next.add(COMPANY_ID);
      }
      return next;
    });
  }, [selectedId, units]);

  const needle = search.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!needle) return null as Set<string> | null;
    const matches = new Set<string>();
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    for (const unit of units) {
      if (unit.name.toLowerCase().includes(needle) || unit.key.toLowerCase().includes(needle)) {
        matches.add(unit.id);
        let parentId = unit.parent_id;
        const seen = new Set<string>();
        while (parentId && !seen.has(parentId)) {
          matches.add(parentId);
          seen.add(parentId);
          parentId = byId.get(parentId)?.parent_id ?? null;
        }
      }
    }
    return matches;
  }, [needle, units]);

  if (organization.isLoading) return <LoadingState label="Loading organization" />;
  if (organization.isError) return <ErrorState title="Organization is unavailable" body={errorMessage(organization.error)} />;

  const visibleUnits = matchIds ? units.filter((unit) => matchIds.has(unit.id)) : units;
  const selected = units.find((unit) => unit.id === selectedId) ?? null;
  const typeName = (id: string | null) => types.find((type) => type.id === id)?.singular_label ?? "Unit";
  const unitName = (id: string | null) => (id ? units.find((unit) => unit.id === id)?.name ?? "Other unit" : "Unassigned");

  function childrenOf(parentId: string | null, source: Unit[] = visibleUnits) {
    return source
      .filter((unit) => (unit.parent_id ?? null) === parentId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function hasChildren(id: string) {
    return units.some((unit) => unit.parent_id === id);
  }

  function subtreeCount(id: string | null, seen = new Set<string>()): number {
    if (id && seen.has(id)) return 0;
    if (id) seen.add(id);
    const direct = people.filter((person) => (person.department_id ?? null) === id).length;
    const kids = units.filter((unit) => (unit.parent_id ?? null) === id);
    return direct + kids.reduce((sum, kid) => sum + subtreeCount(kid.id, seen), 0);
  }

  function directMemberCount(id: string | null) {
    return people.filter((person) => (person.department_id ?? null) === id).length;
  }

  function toggleExpanded(id: string, event?: MouseEvent) {
    event?.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAdd(parentId: string) {
    const team = types.find((type) => type.singular_label.toLowerCase() === "team") ?? types.find((type) => type.is_active) ?? types[0];
    setUnitForm({
      ...emptyUnit,
      parent_id: parentId,
      unit_type_id: team?.id ?? "",
      custom_data: emptyCustomValues(customFieldDefs),
    });
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
      custom_data: emptyCustomValues(customFieldDefs, unit.custom_data),
    });
    setFormError("");
    setAddOpen(true);
  }

  function openTypes() {
    const existing = [...types]
      .sort((left, right) => left.position - right.position)
      .map((type) => ({ id: type.id, key: type.key, singular_label: type.singular_label }));
    setDrafts(
      existing.length
        ? existing
        : [
            { id: "", key: "division", singular_label: "Division" },
            { id: "", key: "department", singular_label: "Department" },
            { id: "", key: "team", singular_label: "Team" },
          ],
    );
    setFormError("");
    setTypesOpen(true);
  }

  const departmentCount = units.filter((unit) => typeKind(typeById.get(unit.unit_type_id ?? "")) === "department").length;
  const teamCount = units.filter((unit) => typeKind(typeById.get(unit.unit_type_id ?? "")) === "team").length;
  const totalMembers = people.length;

  const detailPeople = selected
    ? people.filter((person) => person.department_id === selected.id)
    : people.filter((person) => !person.department_id);
  const savedMemberIds = selected
    ? people.filter((person) => person.department_id === selected.id).map((person) => person.id)
    : [];
  const membersDirty =
    selected != null &&
    (memberIds.length !== savedMemberIds.length || memberIds.some((id) => !savedMemberIds.includes(id)));
  const manager = selected?.manager_id
    ? people.find((person) => person.id === selected.manager_id)
    : null;
  const managerLabel = manager?.name || selected?.manager_name || "";
  const detailTitle = selected ? selected.name : workspace.company.display_name;
  const detailType = selected ? typeName(selected.unit_type_id) : "Company";
  const detailKind = selected ? typeKind(typeById.get(selected.unit_type_id ?? "")) : "company";
  const detailCode = selected ? selected.key || codeFromName(selected.name) : codeFromName(workspace.company.display_name);
  const parentName = selected?.parent_id
    ? units.find((unit) => unit.id === selected.parent_id)?.name ?? "—"
    : selected
      ? workspace.company.display_name
      : "—";
  const crumbs = selected ? unitPath(selected, units) : [];
  const childUnits = selected ? childrenOf(selected.id, units) : childrenOf(null, units);
  const canDeactivate = Boolean(selected && canManage && (selected.status ?? "active") === "active");
  const searching = Boolean(needle);
  const companyOpen = searching || expanded.has(COMPANY_ID);

  function UnitMenu({ unit }: { unit: Unit }) {
    if (!canManage) return null;
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label={`Actions for ${unit.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreIcon />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-30 min-w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            align="end"
            sideOffset={4}
          >
            <DropdownMenu.Item
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-50 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              onSelect={() => selectUnit(unit.id)}
            >
              View details
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-50 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              onSelect={() => openEdit(unit)}
            >
              Edit unit
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-50 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              onSelect={() => openAdd(unit.id)}
            >
              Add child unit
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  function renderTreeNode(unit: Unit, depth: number, isLast: boolean) {
    const kids = childrenOf(unit.id);
    const open = searching || expanded.has(unit.id);
    const kind = typeKind(typeById.get(unit.unit_type_id ?? ""));
    const label = typeName(unit.unit_type_id);
    const count = subtreeCount(unit.id);
    const responsible = unit.manager_id
      ? people.find((person) => person.id === unit.manager_id)?.name || unit.manager_name
      : unit.manager_name;
    const selectedRow = selectedId === unit.id;

    return (
      <div key={unit.id} className="relative">
        <div
          className={`group relative flex w-full items-center gap-1 rounded-lg py-1.5 pr-1 text-left text-sm transition ${
            selectedRow
              ? "bg-teal-50 text-teal-950 ring-1 ring-teal-200/80 dark:bg-teal-950 dark:text-teal-50 dark:ring-teal-800"
              : unit.status !== "active"
                ? "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/80"
                : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/80"
          }`}
          style={{ paddingLeft: 8 + depth * 18 }}
        >
          {depth > 0 ? (
            <span
              className="pointer-events-none absolute bottom-1/2 left-0 top-0 border-l border-slate-200 dark:border-slate-700"
              style={{ marginLeft: 8 + (depth - 1) * 18 + 7 }}
              aria-hidden
            />
          ) : null}
          {depth > 0 ? (
            <span
              className="pointer-events-none absolute left-0 top-1/2 border-t border-slate-200 dark:border-slate-700"
              style={{
                marginLeft: 8 + (depth - 1) * 18 + 7,
                width: 10,
              }}
              aria-hidden
            />
          ) : null}
          <button
            type="button"
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 ${
              kids.length || hasChildren(unit.id) ? "" : "invisible"
            }`}
            aria-label={open ? `Collapse ${unit.name}` : `Expand ${unit.name}`}
            onClick={(event) => toggleExpanded(unit.id, event)}
          >
            <ChevronIcon open={open} />
          </button>
          <button type="button" className="min-w-0 flex-1 py-0.5 text-left" onClick={() => selectUnit(unit.id)}>
            <span className="flex items-center gap-2">
              <span className="truncate font-medium">{unit.name}</span>
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${typeBadgeClass(kind)}`}>
                {label}
              </span>
              {unit.status !== "active" ? <span className="text-[10px] uppercase text-slate-400">Inactive</span> : null}
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
              <span>{count} {count === 1 ? "member" : "members"}</span>
              {unit.key ? <span className="truncate uppercase">· {unit.key}</span> : null}
            </span>
          </button>
          {responsible ? <Avatar name={responsible} /> : null}
          <UnitMenu unit={unit} />
        </div>
        {open && kids.length ? (
          <div className={isLast ? "" : ""}>
            {kids.map((child, index) => renderTreeNode(child, depth + 1, index === kids.length - 1))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderList() {
    const rows = [...visibleUnits].sort((left, right) => left.name.localeCompare(right.name));
    if (rows.length === 0) {
      return (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No units match</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Try another name or code.</p>
        </div>
      );
    }
    return (
      <ul className="mt-1 space-y-0.5">
        {rows.map((unit) => {
          const kind = typeKind(typeById.get(unit.unit_type_id ?? ""));
          const responsible = unit.manager_id
            ? people.find((person) => person.id === unit.manager_id)?.name || unit.manager_name
            : unit.manager_name;
          return (
            <li key={unit.id}>
              <div
                className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${
                  selectedId === unit.id
                    ? "bg-teal-50 ring-1 ring-teal-200/80 dark:bg-teal-950 dark:ring-teal-800"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/80"
                }`}
              >
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => selectUnit(unit.id)}>
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">{unit.name}</span>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${typeBadgeClass(kind)}`}>
                      {typeName(unit.unit_type_id)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                    {unit.key || "No code"} · {subtreeCount(unit.id)} members
                    {unit.parent_id ? ` · ${unitName(unit.parent_id)}` : " · Company"}
                  </span>
                </button>
                {responsible ? <Avatar name={responsible} /> : null}
                <UnitMenu unit={unit} />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  const detailsPanel = (
    <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="min-w-0">
          <nav className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400" aria-label="Unit path">
            <button type="button" className="rounded hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30" onClick={() => selectUnit(COMPANY_ID)}>
              {workspace.company.display_name}
            </button>
            {crumbs.map((crumb) => (
              <span key={crumb.id} className="inline-flex items-center gap-1">
                <span aria-hidden>›</span>
                <button type="button" className="rounded hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30" onClick={() => selectUnit(crumb.id)}>
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{detailTitle}</h2>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${typeBadgeClass(detailKind)}`}>
              {detailType}
            </span>
            {selected && selected.status !== "active" ? (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {selected.status}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selected ? (selected.parent_id ? "Reports within the hierarchy" : "Top-level unit under the company") : "Company root of the organization"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected && canManage ? (
            <>
              <Button type="button" variant="secondary" onClick={() => openAdd(selected.id)}>
                Add child unit
              </Button>
              <Button type="button" variant="secondary" onClick={() => openEdit(selected)}>
                Edit
              </Button>
              <Button type="button" variant="secondary" disabled={!canDeactivate} onClick={() => setConfirmDelete(true)}>
                Deactivate
              </Button>
            </>
          ) : null}
          {!selected ? (
            <Link className="self-center text-sm font-medium text-teal-800 hover:underline" to="/app/settings">
              Open company settings
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Unit code</p>
          <p className="mt-1 text-sm font-medium uppercase text-slate-900 dark:text-slate-100">{detailCode || "—"}</p>
        </div>
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Parent unit</p>
          <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{parentName}</p>
        </div>
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800 sm:col-span-2 lg:col-span-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Members</p>
          <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            {selected ? (
              <>
                {directMemberCount(selected.id)} direct
                <span className="font-normal text-slate-400"> · {subtreeCount(selected.id)} incl. descendants</span>
              </>
            ) : (
              <>
                {directMemberCount(null)} unassigned
                <span className="font-normal text-slate-400"> · {totalMembers} total</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Responsible person</p>
        {managerLabel ? (
          <div className="mt-2 flex items-center gap-2.5">
            <Avatar name={managerLabel} size="md" />
            <span>
              <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{managerLabel}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{manager?.title || detailType}</span>
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">No responsible person assigned</p>
        )}
      </div>

      {selected && customFieldDefs.length > 0 ? (
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Additional fields</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {customFieldDefs.map((def) => {
              const linkLabels: Record<string, string> = {
                ...Object.fromEntries((rolesForLabels.data?.results ?? []).map((role) => [role.id, role.name])),
                ...Object.fromEntries(
                  (directory.data?.results ?? [])
                    .filter((row) => row.person_id)
                    .map((row) => [row.person_id as string, personName(row.first_name, row.last_name, row.email)]),
                ),
                ...Object.fromEntries((organization.data?.units ?? []).map((unit) => [unit.id, unit.name])),
              };
              return (
                <div key={def.id}>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{def.name}</dt>
                  <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                    {formatCustomFieldDisplay(def, selected.custom_data?.[def.key], linkLabels)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : null}

      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Child units</h3>
          <span className="text-xs text-slate-400">{childUnits.length}</span>
        </div>
        {childUnits.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {selected ? "No child units yet." : "No top-level units yet."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {childUnits.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition hover:text-teal-800"
                  onClick={() => selectUnit(child.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{child.name}</span>
                    <span className="text-xs text-slate-400">
                      {typeName(child.unit_type_id)} · {subtreeCount(child.id)} members
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase ${typeBadgeClass(typeKind(typeById.get(child.unit_type_id ?? "")))}`}>
                    {typeName(child.unit_type_id)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Members</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {selected ? "People assigned directly to this unit." : "People not assigned to any unit yet."}
        </p>
        {detailPeople.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No direct members.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {detailPeople.map((person) => (
              <li key={person.id} className="flex items-center gap-2.5 text-sm text-slate-800 dark:text-slate-200">
                <Avatar name={person.name} />
                <span>
                  <span className="font-medium">{person.name}</span>
                  {person.title ? <span className="ml-2 text-xs text-slate-400">{person.title}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canManage && selected ? (
          <form
            className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800"
            onSubmit={(event) => {
              event.preventDefault();
              saveMembers.mutate();
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Assign people</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {memberIds.length} selected · Search and pick from the directory
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={people.length === 0}
                onClick={() => {
                  setAssignSearch("");
                  setAssignOpen(true);
                }}
              >
                Select people
              </Button>
            </div>
            {people.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No people are available to assign.</p>
            ) : memberIds.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No one selected yet. Use Select people to search and assign.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {memberIds.map((id) => {
                  const person = people.find((row) => row.id === id);
                  if (!person) return null;
                  return (
                    <li
                      key={id}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1.5 pr-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <Avatar name={person.name} />
                      <span className="truncate font-medium">{person.name}</span>
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                        aria-label={`Remove ${person.name}`}
                        onClick={() => setMemberIds(memberIds.filter((item) => item !== id))}
                      >
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M5 5l10 10M15 5 5 15" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button type="submit" variant="secondary" disabled={saveMembers.isPending || people.length === 0 || !membersDirty}>
              {saveMembers.isPending ? "Saving…" : "Save people"}
            </Button>
          </form>
        ) : null}
      </div>
    </section>
  );

  const assignNeedle = assignSearch.trim().toLowerCase();
  const assignCandidates = assignNeedle
    ? people.filter((person) => {
        const hay = `${person.name} ${person.title || ""}`.toLowerCase();
        return hay.includes(assignNeedle);
      })
    : people;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumbs items={["Workspace", "Organization"]} />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Organization</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Manage your company structure, reporting lines and organizational units.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button type="button" variant="secondary" onClick={openTypes}>
              Manage unit types
            </Button>
          ) : null}
          {canManage ? (
            <Button type="button" onClick={() => openAdd(selected ? selected.id : "")}>
              + Add unit
            </Button>
          ) : null}
        </div>
      </div>

      {formError && !addOpen && !typesOpen && !confirmDelete ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Organization units", value: units.length, hint: "All units in the hierarchy" },
          { label: "Total members", value: totalMembers, hint: "Unique people in the directory" },
          { label: "Departments", value: departmentCount, hint: "Units typed as Department" },
          { label: "Teams", value: teamCount, hint: "Units typed as Team" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{card.value}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(20rem,22.5rem)_1fr]">
        <section className="flex max-h-[min(70vh,52rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="space-y-3 border-b border-slate-100 p-3 dark:border-slate-800">
            <label className="relative block">
              <span className="sr-only">Search organization units</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon />
              </span>
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-teal-700 focus:bg-white focus:ring-2 focus:ring-teal-700/15 dark:border-slate-700 dark:bg-slate-950 dark:focus:bg-slate-900"
                placeholder="Search by name or code"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label="View mode">
              {(["tree", "list"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                    viewMode === mode
                      ? "bg-teal-800 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode} view
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {viewMode === "list" ? (
              renderList()
            ) : searching && visibleUnits.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No matching units</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Clear search or try a different name or code.</p>
                <Button type="button" variant="secondary" className="mt-4" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              </div>
            ) : units.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-100">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                    <path d="M4 20V6.5A1.5 1.5 0 0 1 5.5 5H11v15" />
                    <path d="M11 9h7.5A1.5 1.5 0 0 1 20 10.5V20" />
                    <path d="M7 9h2M7 13h2M7 17h2M14 13h3M14 17h3" />
                  </svg>
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Only your company exists so far</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Add divisions, departments and teams to model how your company is organized.
                </p>
                {canManage ? (
                  <Button type="button" className="mt-4" onClick={() => openAdd("")}>
                    + Add first unit
                  </Button>
                ) : null}
              </div>
            ) : (
              <div>
                <div
                  className={`group flex items-center gap-1 rounded-lg py-1.5 pr-1 text-sm transition ${
                    selectedId === COMPANY_ID
                      ? "bg-teal-50 text-teal-950 ring-1 ring-teal-200/80 dark:bg-teal-950 dark:text-teal-50 dark:ring-teal-800"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/80"
                  }`}
                >
                  <button
                    type="button"
                    className="ml-2 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                    aria-label={companyOpen ? "Collapse company" : "Expand company"}
                    onClick={(event) => toggleExpanded(COMPANY_ID, event)}
                  >
                    <ChevronIcon open={companyOpen} />
                  </button>
                  <button type="button" className="min-w-0 flex-1 py-0.5 pl-0.5 text-left" onClick={() => selectUnit(COMPANY_ID)}>
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{workspace.company.display_name}</span>
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${typeBadgeClass("company")}`}>
                        Company
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">
                      {totalMembers} {totalMembers === 1 ? "member" : "members"}
                    </span>
                  </button>
                </div>
                {companyOpen
                  ? childrenOf(null).map((unit, index, list) => renderTreeNode(unit, 1, index === list.length - 1))
                  : null}
              </div>
            )}
          </div>
        </section>

        <div className="hidden lg:block">{detailsPanel}</div>
      </div>

      <div className="lg:hidden">
        {mobileDetailsOpen || selectedId !== COMPANY_ID ? (
          <div className="fixed inset-0 z-40 flex flex-col bg-slate-900/40 lg:hidden" role="dialog" aria-modal="true" aria-label="Unit details">
            <button type="button" className="h-16 shrink-0" aria-label="Close details" onClick={() => setMobileDetailsOpen(false)} />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-[var(--pulse-canvas)] shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Unit details</p>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => setMobileDetailsOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">{detailsPanel}</div>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            Select a unit to view its details.
          </p>
        )}
      </div>

      <Modal
        open={addOpen}
        title={unitForm.id ? "Edit organization unit" : "Add organization unit"}
        description={unitForm.id ? "Update this unit’s place in the hierarchy." : "Create a unit and place it in your company structure."}
        onClose={() => setAddOpen(false)}
        wide
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)} disabled={saveUnit.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveUnit.isPending || !unitForm.name.trim() || !unitForm.unit_type_id}
              onClick={submitUnit}
            >
              {saveUnit.isPending ? "Saving…" : unitForm.id ? "Save unit" : "Add unit"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Unit name <span className="text-rose-600">*</span>
            <input
              className={fieldClass}
              value={unitForm.name}
              onChange={(event) => setUnitForm({ ...unitForm, name: event.target.value })}
              required
              autoFocus
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Unit type <span className="text-rose-600">*</span>
              <select
                className={fieldClass}
                value={unitForm.unit_type_id}
                onChange={(event) => setUnitForm({ ...unitForm, unit_type_id: event.target.value })}
                required
              >
                <option value="">Select a type</option>
                {types
                  .filter((type) => type.is_active || type.id === unitForm.unit_type_id)
                  .map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.singular_label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Unit code <span className="font-normal text-slate-400">Optional</span>
              <input
                className={fieldClass}
                placeholder="ENG-QA"
                value={unitForm.key}
                onChange={(event) => setUnitForm({ ...unitForm, key: event.target.value })}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Parent unit
              <select
                className={fieldClass}
                value={unitForm.parent_id}
                onChange={(event) => setUnitForm({ ...unitForm, parent_id: event.target.value })}
              >
                <option value="">{workspace.company.display_name}</option>
                {units
                  .filter((unit) => unit.id !== unitForm.id && !isDescendant(unit, unitForm.id, units))
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Responsible person <span className="font-normal text-slate-400">Optional</span>
              <select
                className={fieldClass}
                value={unitForm.manager_id}
                onChange={(event) => setUnitForm({ ...unitForm, manager_id: event.target.value })}
              >
                <option value="">None</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {unitForm.id ? (
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Status
              <select
                className={fieldClass}
                value={unitForm.status}
                onChange={(event) => setUnitForm({ ...unitForm, status: event.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          ) : null}
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <CustomFieldInputs
              companyId={companyId}
              defs={customFieldDefs}
              values={unitForm.custom_data}
              onChange={(custom_data) => setUnitForm({ ...unitForm, custom_data })}
            />
          </div>
          {!types.length ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              Add a unit type before creating a unit.{" "}
              <button
                type="button"
                className="font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-200"
                onClick={() => {
                  setAddOpen(false);
                  openTypes();
                }}
              >
                Open unit types
              </button>
            </p>
          ) : null}
          {formError ? <p className="text-sm text-rose-700 dark:text-rose-300">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={assignOpen}
        title="Select people"
        description={
          selected
            ? `Search and choose who belongs to ${selected.name}. Save on the unit panel when you are done.`
            : "Search and choose people for this unit."
        }
        onClose={() => setAssignOpen(false)}
        wide
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">Search people</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <SearchIcon />
            </span>
            <input
              className={`${fieldClass} pl-9`}
              placeholder="Search by name or title…"
              value={assignSearch}
              onChange={(event) => setAssignSearch(event.target.value)}
              autoFocus
            />
          </label>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing {assignCandidates.length} of {people.length}
              {assignNeedle ? " matches" : ""}
            </span>
            <span>{memberIds.length} selected</span>
          </div>
          {assignCandidates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No people match “{assignSearch.trim()}”.
            </p>
          ) : (
            <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 p-1.5 dark:border-slate-700">
              {assignCandidates.map((person) => {
                const elsewhere = Boolean(person.department_id && selected && person.department_id !== selected.id);
                const checked = memberIds.includes(person.id);
                return (
                  <label
                    key={person.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-teal-800"
                      checked={checked}
                      onChange={(event) =>
                        setMemberIds(
                          event.target.checked
                            ? [...memberIds, person.id]
                            : memberIds.filter((id) => id !== person.id),
                        )
                      }
                    />
                    <Avatar name={person.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{person.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {[person.title, elsewhere ? unitName(person.department_id) : person.department_id === selected?.id ? "In this unit" : "Unassigned"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </label>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        open={typesOpen}
        title="Manage unit types"
        description="Unit types describe organizational levels. They do not grant permissions or define roles."
        onClose={() => setTypesOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDrafts([...drafts, { id: "", key: "", singular_label: "" }])}>
              Add type
            </Button>
            <Button type="button" disabled={saveType.isPending} onClick={() => saveType.mutate(drafts)}>
              {saveType.isPending ? "Saving…" : "Done"}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
            Company <span className="text-xs">(fixed root)</span>
          </div>
          {drafts.map((row, index) => (
            <input
              key={row.id || `new-${index}`}
              className={fieldClass}
              placeholder="e.g. Division, Department, Team"
              value={row.singular_label}
              onChange={(event) =>
                setDrafts(
                  drafts.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, singular_label: event.target.value } : item,
                  ),
                )
              }
            />
          ))}
          {formError ? <p className="text-sm text-rose-700 dark:text-rose-300">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        title="Deactivate organization unit"
        description={selected ? `Deactivate “${selected.name}”? It stays in history and linked records, but is hidden from active pickers.` : undefined}
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" disabled={deleteUnit.isPending} onClick={() => deleteUnit.mutate()}>
              {deleteUnit.isPending ? "Deactivating…" : "Deactivate"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">The unit is deactivated, not removed. Stored links and history remain available.</p>
      </Modal>
    </div>
  );
}
