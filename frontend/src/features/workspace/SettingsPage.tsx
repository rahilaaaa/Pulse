import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type Settings = {
  display_name: string;
  timezone: string;
  slug: string;
  legal_name: string;
  subscription: { plan_name: string; status: string; billing_interval: string; trial_ends_at: string | null } | null;
  billing_name: string;
  billing_email: string;
};

type Entity = "person" | "organization_unit" | "task" | "company";

type CustomField = {
  id: string;
  entity: Entity;
  name: string;
  key: string;
  field_type: string;
  required: boolean;
  sensitive: boolean;
  self_editable: boolean;
  filterable: boolean;
  options: string[];
};

const ENTITIES: Array<{ id: Entity; label: string; empty: string; hint: string }> = [
  { id: "person", label: "Person", empty: "No person fields yet", hint: "Add fields to capture information your company needs, like cost centers or emergency contacts." },
  { id: "organization_unit", label: "Organization Unit", empty: "No organization unit fields yet", hint: "Add fields that describe departments and teams." },
  { id: "task", label: "Task", empty: "No task fields yet", hint: "Add fields that tasks can carry when work is tracked." },
  { id: "company", label: "Company", empty: "No company fields yet", hint: "Add fields that describe the company record." },
];

const TYPES: Array<{ id: string; label: string }> = [
  { id: "text", label: "Text" },
  { id: "long_text", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "boolean", label: "Boolean" },
  { id: "select", label: "Select" },
  { id: "multi_select", label: "Multi-select" },
  { id: "email", label: "Email" },
  { id: "url", label: "URL" },
  { id: "phone", label: "Phone" },
];

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700";

function typeLabel(value: string) {
  return TYPES.find((item) => item.id === value)?.label ?? value;
}

export function SettingsPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const canUpdate = workspace.permissions.includes("company.update");
  const queryClient = useQueryClient();
  const [entity, setEntity] = useState<Entity>("person");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [selfEditable, setSelfEditable] = useState(true);
  const [filterable, setFilterable] = useState(false);
  const [formError, setFormError] = useState("");

  const settings = useQuery({ queryKey: ["company-settings", companyId], queryFn: () => api<Settings>(`/api/v1/companies/${companyId}/settings/`) });
  const fields = useQuery({
    queryKey: ["custom-fields", companyId, entity],
    queryFn: () => api<{ results: CustomField[] }>(`/api/v1/companies/${companyId}/custom-fields/?entity=${entity}`),
  });
  const counts = useQuery({
    queryKey: ["custom-fields", companyId, "counts"],
    queryFn: async () => {
      const entries = await Promise.all(ENTITIES.map(async (item) => {
        const data = await api<{ results: CustomField[] }>(`/api/v1/companies/${companyId}/custom-fields/?entity=${item.id}`);
        return [item.id, data.results.length] as const;
      }));
      return Object.fromEntries(entries) as Record<Entity, number>;
    },
  });
  const saveSettings = useMutation({
    mutationFn: (values: { display_name: string; timezone: string }) =>
      api(`/api/v1/companies/${companyId}/settings/`, { method: "PATCH", body: JSON.stringify(values) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-settings", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
  const createField = useMutation({
    mutationFn: () => api(`/api/v1/companies/${companyId}/custom-fields/`, {
      method: "POST",
      body: JSON.stringify({
        entity,
        name,
        field_type: fieldType,
        required,
        sensitive,
        self_editable: selfEditable,
        filterable,
        options: fieldType === "select" || fieldType === "multi_select" ? options.split("\n").map((item) => item.trim()).filter(Boolean) : [],
      }),
    }),
    onSuccess: async () => {
      setOpen(false);
      setFormError("");
      await queryClient.invalidateQueries({ queryKey: ["custom-fields", companyId] });
    },
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "The field could not be added."),
  });
  const removeField = useMutation({
    mutationFn: (id: string) => api(`/api/v1/companies/${companyId}/custom-fields/${id}/`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["custom-fields", companyId] });
    },
  });

  function openModal() {
    setName("");
    setFieldType("text");
    setOptions("");
    setRequired(false);
    setSensitive(false);
    setSelfEditable(true);
    setFilterable(false);
    setFormError("");
    setOpen(true);
  }

  if (settings.isLoading || !settings.data || fields.isLoading || !fields.data) {
    return <LoadingState label="Loading configuration" />;
  }
  const current = ENTITIES.find((item) => item.id === entity) ?? ENTITIES[0];
  const rows = fields.data.results;
  const entityLabel = current.label;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Configuration</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Custom fields for core records. Fields add data to existing entities — sensitive fields are visible only to roles with the matching permission.</p>
        </div>
        {canUpdate ? <Button type="button" onClick={openModal}>+ Add field</Button> : null}
      </div>
      <div className="flex gap-5 overflow-x-auto border-b border-slate-200 text-sm">
        {ENTITIES.map((item) => (
          <button key={item.id} type="button" className={`shrink-0 border-b-2 px-0.5 pb-2 ${entity === item.id ? "border-teal-800 font-medium text-slate-900" : "border-transparent text-slate-500"}`} onClick={() => setEntity(item.id)}>
            {item.label} <span className="ml-1 text-slate-400">{counts.data?.[item.id] ?? (item.id === entity ? rows.length : 0)}</span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 7h8M8 12h8M8 17h5" /><rect x="4" y="3.5" width="16" height="17" rx="2" /></svg>
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-900">{current.empty}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{current.hint}</p>
          {canUpdate ? <Button type="button" className="mt-4" onClick={openModal}>+ Add field</Button> : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Field</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Flags</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-slate-600">{typeLabel(row.field_type)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{[row.required ? "Required" : "", row.sensitive ? "Sensitive" : "", row.self_editable ? "Self-editable" : "", row.filterable ? "Filterable" : ""].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {canUpdate ? <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => removeField.mutate(row.id)}>Delete</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="max-w-xl space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Workspace details</h2>
        <p className="text-sm text-slate-500">{settings.data.legal_name} · {settings.data.slug}</p>
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          saveSettings.mutate({ display_name: String(form.get("display_name") || ""), timezone: String(form.get("timezone") || "") });
        }}>
          <label className="block text-sm">Display name<input className={fieldClass} name="display_name" defaultValue={settings.data.display_name} /></label>
          <label className="block text-sm">Timezone<input className={fieldClass} name="timezone" defaultValue={settings.data.timezone} /></label>
          <Button type="submit" disabled={saveSettings.isPending || !canUpdate}>Save</Button>
        </form>
      </section>
      <Modal
        open={open}
        title={`Add ${entityLabel} field`}
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={createField.isPending || !name.trim()} onClick={() => createField.mutate()}>Add field</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Field name *
              <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-slate-700">Type *
              <select className={fieldClass} value={fieldType} onChange={(event) => setFieldType(event.target.value)}>
                {TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>
          {fieldType === "select" || fieldType === "multi_select" ? (
            <label className="block text-sm font-medium text-slate-700">Options
              <textarea className={fieldClass} rows={3} placeholder="One option per line" value={options} onChange={(event) => setOptions(event.target.value)} />
            </label>
          ) : null}
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            <Toggle label="Required" detail="Must be filled when the record is saved." checked={required} onChange={setRequired} />
            <Toggle label="Sensitive" detail="Only roles with “view sensitive” permission can see the value." checked={sensitive} onChange={setSensitive} />
            <Toggle label="Self-editable" detail="People can edit this on their own record." checked={selfEditable} onChange={setSelfEditable} />
            <Toggle label="Filterable" detail="Available as a filter in lists." checked={filterable} onChange={setFilterable} />
          </div>
          {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-teal-800" : "bg-slate-300"}`} onClick={() => onChange(!checked)}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-5" : "left-0.5"}`} />
      </button>
    </div>
  );
}
