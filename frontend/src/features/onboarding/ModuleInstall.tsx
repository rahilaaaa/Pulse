import { useEffect, useRef, useState } from "react";
import { Button } from "../../shared/ui/Button";
import type { CatalogModule } from "./modules";

export function ModuleIcon({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const paths: Record<string, string> = {
    hrms: "M12 21s-6-4.4-6-9a4 4 0 0 1 6-3 4 4 0 0 1 6 3c0 4.6-6 9-6 9z",
    crm: "M8 12h8M12 8v8M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
    projects: "M5 7h14M5 12h14M5 17h9",
    helpdesk: "M6 15v-1a6 6 0 0 1 12 0v1M6 15h2v3H6zm10 0h2v3h-2z",
    inventory: "M4 8l8-4 8 4-8 4-8-4zm0 4l8 4 8-4M4 16l8 4 8-4",
    finance: "M5 7h14v10H5zM8 11h8M8 14h5",
  };
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800 ${compact ? "h-8 w-8" : "h-11 w-11"}`}>
      <svg viewBox="0 0 24 24" className={compact ? "h-4 w-4" : "h-6 w-6"} fill="none" aria-hidden="true">
        <path d={paths[slug] ?? paths.hrms} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Check() {
  return <span className="text-teal-800">✓</span>;
}

export function ModuleSummary({
  module,
  installed,
  onInstall,
  onDetails,
}: {
  module: CatalogModule;
  installed: boolean;
  onInstall: () => void;
  onDetails: () => void;
}) {
  const midpoint = Math.ceil(module.includes.length / 2);
  const columns = [module.includes.slice(0, midpoint), module.includes.slice(midpoint)];
  return (
    <article className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <div className="flex items-start gap-3">
          <ModuleIcon slug={module.slug} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-900">{module.name}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{installed ? "Selected" : "Not installed"}</span>
              <span className="text-xs text-slate-500">v{module.version} · by Pulse</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{module.category}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">{module.detail}</p>
        <p className="mt-5 text-sm font-medium text-slate-500">Includes</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {columns.map((column) => (
            <ul key={column[0]} className="space-y-2 text-sm text-slate-800">
              {column.map((item) => (
                <li key={item} className="flex gap-2"><Check />{item}</li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <aside className="space-y-4 rounded-xl bg-slate-50 p-4">
        <div>
          <p className="text-sm text-slate-500">Pricing on your plan</p>
          <p className="mt-1 font-semibold text-slate-900">Included — no additional charge</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Permissions impact</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{module.permissionSummary}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Configuration required</p>
          <p className="mt-1 text-sm text-slate-600">{module.configuration.length} steps after install</p>
        </div>
        <Button type="button" className="w-full rounded-lg py-2.5" disabled={installed} onClick={onInstall}>
          {installed ? "Selected" : `Install ${module.name}`}
        </Button>
        <button type="button" className="w-full text-sm font-semibold text-slate-700" onClick={onDetails}>View details</button>
      </aside>
    </article>
  );
}

export function ModuleDetails({
  module,
  installed,
  onCancel,
  onInstall,
}: {
  module: CatalogModule;
  installed: boolean;
  onCancel: () => void;
  onInstall: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ModuleIcon slug={module.slug} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-900">{module.name}</h2>
              <span className="text-sm text-slate-400">·</span>
              <span className="text-sm font-medium text-teal-800">{installed ? "Selected" : "Available"}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{module.category} · v{module.version} · by Pulse</p>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">{module.pitch}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="rounded-lg" onClick={onCancel}>Cancel</Button>
          <Button type="button" className="rounded-lg" disabled={installed} onClick={onInstall}>
            {installed ? "Selected" : `Install ${module.name}`}
          </Button>
        </div>
      </div>
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          <h3 className="text-base font-semibold text-slate-900">What you get</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {module.groups.map((group) => (
              <article key={group.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">{group.title}</h4>
                <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-2"><Check />{item}</li>
                  ))}
                </ul>
                {group.note ? <p className="mt-2 text-sm text-slate-500">{group.note}</p> : null}
              </article>
            ))}
          </div>
        </section>
        <div className="space-y-3">
          <InfoCard title="Pricing" body="Included in your plan. No additional charge." />
          <InfoCard title="Required permissions" body={module.permissionNote} />
          <InfoCard title="Data areas affected" body={module.dataAreas.map((line) => `• ${line}`).join("\n")} />
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Configuration required</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-slate-600">
              {module.configuration.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{body}</p>
    </article>
  );
}

export function ModuleConfirm({
  module,
  onCancel,
  onInstall,
}: {
  module: CatalogModule;
  onCancel: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start gap-3">
        <ModuleIcon slug={module.slug} />
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Install {module.name}?</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Installing {module.name} will add these capabilities to this company workspace. You can configure access through roles and permissions.
          </p>
        </div>
      </div>
      <section className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Capabilities that will be enabled</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {module.includes.map((item) => (
              <span key={item} className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">{item}</span>
            ))}
          </div>
        </div>
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Permissions you can configure</h3>
          <p className="mt-1 text-sm text-slate-500">Added to roles and permissions. Not granted to any role except full-access roles.</p>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            {module.permissions.map((permission) => (
              <li key={permission.name}>• {permission.name} ({permission.actions})</li>
            ))}
          </ul>
        </div>
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Configuration steps after install</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-slate-600">
            {module.configuration.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Pricing</h3>
          <p className="mt-2 text-sm text-teal-800">Included in your plan — no additional charge, no checkout needed.</p>
        </div>
      </section>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" className="rounded-lg" onClick={onCancel}>Cancel</Button>
        <Button type="button" className="rounded-lg" onClick={onInstall}>Install module</Button>
      </div>
    </div>
  );
}

export function ModuleProgress({ module, onDone }: { module: CatalogModule; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const total = module.installSteps.length;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (index < total) {
      const timer = window.setTimeout(() => setIndex((current) => current + 1), 700);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => onDoneRef.current(), 600);
    return () => window.clearTimeout(timer);
  }, [index, total]);

  const width = total === 0 ? 100 : Math.round((index / total) * 100);

  return (
    <div className="mx-auto max-w-xl pt-6">
      <h2 className="text-xl font-semibold text-slate-900">Installing {module.name}</h2>
      <p className="mt-1 text-sm text-slate-500">Adding {module.category.toLowerCase()} capabilities to your workspace. Your team can keep working.</p>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-teal-800 transition-all" style={{ width: `${width}%` }} />
        </div>
        <ol className="mt-5 space-y-3">
          {module.installSteps.map((step, stepIndex) => {
            const done = stepIndex < index;
            const current = stepIndex === index;
            return (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                    done ? "bg-teal-800 text-white" : current ? "border-2 border-teal-800 text-teal-800" : "border border-slate-300 text-transparent"
                  }`}
                >
                  {done ? (
                    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" aria-hidden="true">
                      <path d="M5 10.5l3.2 3.2L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    "•"
                  )}
                </span>
                <span className={done || current ? "font-medium text-slate-900" : "text-slate-400"}>{step}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
