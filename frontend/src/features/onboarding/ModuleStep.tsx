import { useCallback, useState } from "react";
import { Button } from "../../shared/ui/Button";
import { LoadingState } from "../../shared/ui/States";
import { ModuleConfirm, ModuleDetails, ModuleIcon, ModuleProgress, ModuleSummary } from "./ModuleInstall";
import { modulesBySlug, type CatalogModule } from "./modules";

type Stage = "catalog" | "summary" | "details" | "confirm" | "installing";

export function ModuleStep({
  modules = [],
  isLoading = false,
  selected,
  onChange,
  onBack,
  onContinue,
  onFocusChange,
  continuing = false,
  continueDisabled = false,
  error = null,
}: {
  modules?: CatalogModule[];
  isLoading?: boolean;
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
  const module = modules.find((item) => item.slug === slug) ?? null;
  const chosen = modulesBySlug(modules, selected);

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
    const target = modules.find((item) => item.slug === slug);
    if (!target?.installable) {
      return;
    }
    onChange(selected.includes(slug) ? selected : [...selected, slug]);
    setStage("catalog");
    setSlug(null);
    onFocusChange?.(false);
  }, [modules, onChange, onFocusChange, selected, slug]);

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <LoadingState label="Loading available modules" />
      </div>
    );
  }

  if (module && stage === "summary") {
    return (
      <div>
        <button
          type="button"
          className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300"
          onClick={close}
        >
          ← Back to modules
        </button>
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
    return (
      <ModuleConfirm
        module={module}
        onCancel={() => setStage("details")}
        onInstall={() => setStage("installing")}
      />
    );
  }

  if (module && stage === "installing") {
    return <ModuleProgress module={module} onDone={finishInstall} />;
  }

  if (modules.length === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            No optional modules available
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            No optional modules are currently available for installation. You can proceed with the core platform setup.
          </p>
          {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
          <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="secondary" className="rounded-lg px-4 py-2" onClick={onBack}>
              Back
            </Button>
            <Button
              type="button"
              className="rounded-lg px-5 py-2.5"
              disabled={continueDisabled || continuing}
              onClick={onContinue}
            >
              {continuing ? "Starting trial..." : "Continue with core setup"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-teal-100 bg-teal-50 dark:bg-teal-950 px-4 py-3 text-sm text-teal-900 dark:text-teal-100">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white dark:bg-slate-900 text-teal-800">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 19c.6-2.4 2.8-4 6-4s5.4 1.6 6 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <p>
            Install the modules this company needs. Each install shows what the module includes before it is added. You can add more after the workspace is open.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {modules.map((item) => {
            const active = selected.includes(item.slug);
            return (
              <article
                key={item.slug}
                className={`flex flex-col rounded-2xl border bg-white dark:bg-slate-900 p-5 ${
                  active ? "border-teal-700 shadow-sm" : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <div className="flex items-start gap-3">
                  <ModuleIcon slug={item.slug} />
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{item.name}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.category}</p>
                    {active ? (
                      <p className="mt-1 text-xs font-semibold text-teal-800 dark:text-teal-400">Selected</p>
                    ) : !item.installable ? (
                      <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Unavailable</p>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.summary}</p>

                <ul className="mt-3 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  {item.includes.slice(0, 5).map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="text-teal-800 dark:text-teal-400">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Included in your plan</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-lg"
                      onClick={() => open(item.slug, "details")}
                    >
                      View details
                    </Button>
                    <Button
                      type="button"
                      className="rounded-lg"
                      variant={active || !item.installable ? "secondary" : "primary"}
                      disabled={!item.installable}
                      onClick={() => open(item.slug, "summary")}
                    >
                      {active ? "Selected" : "Install module"}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Selected for this trial</h2>
            <span className="rounded-full bg-teal-50 dark:bg-teal-950 px-2 py-0.5 text-xs font-semibold text-teal-800 dark:text-teal-300">
              {chosen.length} {chosen.length === 1 ? "module" : "modules"}
            </span>
          </div>

          {chosen.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              None selected. The trial still opens the core workspace.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {chosen.map((item) => (
                <li
                  key={item.slug}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"
                >
                  <ModuleIcon slug={item.slug} compact />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {item.name}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                    onClick={() => remove(item.slug)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex justify-between">
              <span>Included in plan</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">Yes</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Trial period</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">14 days</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              className="w-full rounded-lg py-2.5"
              disabled={continueDisabled || continuing}
              onClick={onContinue}
            >
              {continuing ? "Starting trial..." : "Start 14-day trial"}
            </Button>
            <Button type="button" variant="secondary" className="w-full rounded-lg" onClick={onBack}>
              Back
            </Button>
          </div>
        </section>
      </aside>
    </div>
  );
}
