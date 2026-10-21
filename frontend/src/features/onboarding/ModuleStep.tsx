import { useCallback, useState } from "react";
import { Button } from "../../shared/ui/Button";
import { ModuleConfirm, ModuleDetails, ModuleIcon, ModuleProgress, ModuleSummary } from "./ModuleInstall";
import { MODULE_CATALOG, modulesBySlug } from "./modules";

type Stage = "catalog" | "summary" | "details" | "confirm" | "installing";

export function ModuleStep({
  selected,
  onChange,
  onBack,
  onContinue,
  onFocusChange,
  continuing = false,
  continueDisabled = false,
  error = null,
}: {
  selected: string[];
  onChange: (slugs: string[]) => void;
  onBack: () => void;
  onContinue: () => void;
  onFocusChange?: (focused: boolean) => void;
  continuing?: boolean;
  continueDisabled?: boolean;
  error?: string | null;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("catalog");
  const [returnTo, setReturnTo] = useState<"catalog" | "summary">("catalog");
  const module = MODULE_CATALOG.find((item) => item.slug === slug) ?? null;
  const chosen = modulesBySlug(selected);

  function open(nextSlug: string, nextStage: Stage, back: "catalog" | "summary" = "catalog") {
    setSlug(nextSlug);
    setReturnTo(back);
    setStage(nextStage);
    onFocusChange?.(true);
  }

  function close() {
    setStage("catalog");
    setSlug(null);
    onFocusChange?.(false);
  }

  function remove(target: string) {
    onChange(selected.filter((item) => item !== target));
  }

  const finishInstall = useCallback(() => {
    if (!slug) {
      return;
    }
    const target = MODULE_CATALOG.find((item) => item.slug === slug);
    if (!target?.installable) {
      return;
    }
    onChange(selected.includes(slug) ? selected : [...selected, slug]);
    setStage("catalog");
    setSlug(null);
    onFocusChange?.(false);
  }, [onChange, onFocusChange, selected, slug]);

  if (module && stage === "summary") {
    return (
      <div>
        <button type="button" className="mb-4 text-sm font-semibold text-slate-700" onClick={close}>Back to modules</button>
        <ModuleSummary
          module={module}
          installed={selected.includes(module.slug)}
          onInstall={() => open(module.slug, "details", "summary")}
          onDetails={() => open(module.slug, "details", "summary")}
        />
      </div>
    );
  }

  if (module && stage === "details") {
    return (
      <ModuleDetails
        module={module}
        installed={selected.includes(module.slug)}
        onCancel={() => (returnTo === "summary" ? setStage("summary") : close())}
        onInstall={() => setStage("confirm")}
      />
    );
  }

  if (module && stage === "confirm") {
    return <ModuleConfirm module={module} onCancel={() => setStage("details")} onInstall={() => setStage("installing")} />;
  }

  if (module && stage === "installing") {
    return <ModuleProgress module={module} onDone={finishInstall} />;
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-teal-800">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 19c.6-2.4 2.8-4 6-4s5.4 1.6 6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <p>Install the modules this company needs. Each install shows what the module includes before it is added. You can add more after the workspace is open.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {MODULE_CATALOG.map((item) => {
            const active = selected.includes(item.slug);
            return (
              <article key={item.slug} className={`flex flex-col rounded-2xl border bg-white p-5 ${active ? "border-teal-700 shadow-sm" : "border-slate-200"}`}>
                <div className="flex items-start gap-3">
                  <ModuleIcon slug={item.slug} />
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{item.name}</h2>
                    <p className="text-xs text-slate-500">{item.category}</p>
                    {active ? <p className="mt-1 text-xs font-semibold text-teal-800">Selected</p> : !item.installable ? <p className="mt-1 text-xs font-semibold text-slate-500">Coming soon</p> : null}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.summary}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
                  {item.includes.slice(0, 5).map((feature) => (
                    <li key={feature} className="flex gap-2"><span className="text-teal-800">✓</span><span>{feature}</span></li>
                  ))}
                </ul>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <p className="text-sm text-slate-500">Included in your plan</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="rounded-lg" disabled={!item.installable} onClick={() => open(item.slug, "details")}>View details</Button>
                    <Button type="button" className="rounded-lg" variant={active || !item.installable ? "secondary" : "primary"} disabled={!item.installable} onClick={() => open(item.slug, "summary")}>
                      {item.installable ? (active ? "Selected" : "Install module") : "Coming soon"}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Selected for this trial</h2>
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">{chosen.length} {chosen.length === 1 ? "module" : "modules"}</span>
          </div>
          {chosen.length === 0 ? <p className="mt-3 text-sm text-slate-500">None selected. The trial still opens the core workspace.</p> : (
            <ul className="mt-3 space-y-2">
              {chosen.map((item) => (
                <li key={item.slug} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <ModuleIcon slug={item.slug} compact />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{item.name}</span>
                    <span className="text-xs text-slate-500">Included in your plan</span>
                  </span>
                  <button type="button" className="text-slate-400 hover:text-slate-700" aria-label={`Remove ${item.name}`} onClick={() => remove(item.slug)}>×</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Pricing</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Selected modules are included in your plan. No additional charge and no checkout.</p>
          {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
          <Button type="button" className="mt-4 w-full rounded-lg py-2.5" disabled={continuing || continueDisabled} onClick={onContinue}>
            {continuing ? "Starting trial" : "Start trial"}
          </Button>
        </section>
        <button type="button" className="text-sm font-semibold text-slate-700" onClick={onBack}>Back to review</button>
      </aside>
    </div>
  );
}
