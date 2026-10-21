import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type Role = { id: string; name: string };
type Studio = { widgets: Array<{ code: string; title: string; description: string }>; selected: string[] };
type NavItem = { code: string; label: string; enabled: boolean; position: number };

export function StudioPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ["roles", companyId], queryFn: () => api<{ results: Role[] }>(`/api/v1/companies/${companyId}/roles/`) });
  const [roleId, setRoleId] = useState<string>("");
  const selectedRole = roleId || roles.data?.results[0]?.id || "";
  const studio = useQuery({
    queryKey: ["studio", companyId, selectedRole],
    queryFn: () => api<Studio>(`/api/v1/companies/${companyId}/roles/${selectedRole}/dashboard/`),
    enabled: Boolean(selectedRole),
  });
  const navigation = useQuery({
    queryKey: ["navigation", companyId, selectedRole],
    queryFn: () => api<{ results: NavItem[] }>(`/api/v1/companies/${companyId}/roles/${selectedRole}/navigation/`),
    enabled: Boolean(selectedRole),
  });
  const [widgets, setWidgets] = useState<string[] | null>(null);
  const chosen = widgets ?? studio.data?.selected ?? [];
  const save = useMutation({
    mutationFn: () => api(`/api/v1/companies/${companyId}/roles/${selectedRole}/dashboard/`, { method: "PUT", body: JSON.stringify({ widgets: chosen }) }),
    onSuccess: async () => {
      setWidgets(null);
      await queryClient.invalidateQueries({ queryKey: ["studio", companyId, selectedRole] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
  const saveNav = useMutation({
    mutationFn: (items: NavItem[]) => api(`/api/v1/companies/${companyId}/roles/${selectedRole}/navigation/`, { method: "PUT", body: JSON.stringify({ items }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  if (roles.isLoading || studio.isLoading) {
    return <LoadingState label="Loading dashboard studio" />;
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard studio</h1>
      <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={selectedRole} onChange={(event) => { setRoleId(event.target.value); setWidgets(null); }}>
        {roles.data?.results.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
      </select>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Available widgets</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(studio.data?.widgets ?? []).map((widget) => (
              <li key={widget.code} className="flex items-center justify-between gap-3">
                <span><span className="font-medium">{widget.title}</span><span className="block text-slate-500">{widget.description}</span></span>
                <Button variant="secondary" type="button" onClick={() => setWidgets(chosen.includes(widget.code) ? chosen.filter((code) => code !== widget.code) : [...chosen, widget.code])}>
                  {chosen.includes(widget.code) ? "Remove" : "Add"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Preview</h2>
          {chosen.length === 0 ? <p className="mt-3 text-sm text-slate-500">No widgets selected. The role still sees only data its permissions allow.</p> : (
            <ol className="mt-3 space-y-2 text-sm">
              {chosen.map((code, index) => (
                <li key={code} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <span>{studio.data?.widgets.find((widget) => widget.code === code)?.title ?? code}</span>
                  <span className="flex gap-2">
                    <button type="button" className="text-slate-500" onClick={() => index > 0 && setWidgets([...chosen.slice(0, index - 1), chosen[index], chosen[index - 1], ...chosen.slice(index + 1)])}>Up</button>
                    <button type="button" className="text-slate-500" onClick={() => index < chosen.length - 1 && setWidgets([...chosen.slice(0, index), chosen[index + 1], chosen[index], ...chosen.slice(index + 2)])}>Down</button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <Button className="mt-4" type="button" disabled={save.isPending} onClick={() => save.mutate()}>Publish</Button>
        </section>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Navigation</h2>
        <p className="mt-1 text-sm text-slate-500">Hiding an item does not grant access. The server still checks the permission and the installed module.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {(navigation.data?.results ?? []).map((item) => (
            <li key={item.code} className="flex items-center justify-between">
              <span>{item.label}</span>
              <label className="flex items-center gap-2"><input type="checkbox" checked={item.enabled} onChange={(event) => {
                const next = (navigation.data?.results ?? []).map((row) => row.code === item.code ? { ...row, enabled: event.target.checked } : row);
                saveNav.mutate(next);
              }} />Visible</label>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Your published dashboard</h2>
        {workspace.dashboard.widgets.length === 0 ? <p className="mt-2 text-sm text-slate-500">No published widgets for your roles yet.</p> : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {workspace.dashboard.widgets.map((widget) => (
              <article key={widget.code} className="rounded-lg border border-slate-200 p-3 text-sm">
                <h3 className="font-medium">{widget.title}</h3>
                <pre className="mt-2 whitespace-pre-wrap text-slate-600">{JSON.stringify(widget.data, null, 2)}</pre>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
