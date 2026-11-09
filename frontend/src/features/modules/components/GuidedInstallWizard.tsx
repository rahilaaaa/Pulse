import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../shared/api/client";
import { ModuleIcon } from "./ModuleIcon";
import type { ModuleDetailData } from "../types";

interface GuidedInstallWizardProps {
  module: ModuleDetailData;
  companyId: string;
  companyName: string;
  onClose: () => void;
  onInstallSuccess: (installedModule: ModuleDetailData) => void;
}

type WizardStep = 1 | 2 | 3 | 4 | "installing" | "failed";

const STAGES = [
  "Validating tenant entitlements & acquisition lock",
  "Initializing database schemas & standard tables",
  "Applying initial tenant configuration defaults",
  "Registering sidebar navigation & role templates",
  "Finalizing installation & audit logging",
];

export function GuidedInstallWizard({
  module,
  companyId,
  companyName,
  onClose,
  onInstallSuccess,
}: GuidedInstallWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>(1);
  const [confirmed, setConfirmed] = useState(false);
  const [configState, setConfigState] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    Object.entries(module.config_schema || {}).forEach(([key, val]) => {
      initial[key] = val.default;
    });
    return initial;
  });

  // Installation stage animation
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const installMutation = useMutation({
    mutationFn: (configPayload: Record<string, any>) =>
      api<{ installed: boolean; slug: string }>(
        `/api/v1/companies/${companyId}/modules/${module.slug}/install/`,
        {
          method: "POST",
          body: JSON.stringify({ config: configPayload }),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-modules", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["module-detail", companyId, module.slug] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      // Transition to success screen
      onInstallSuccess({ ...module, installed: true, status: "installed" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Installation could not be completed.";
      setErrorMessage(msg);
      setStep("failed");
    },
  });

  // Multi-stage progress animation while mutation is running
  useEffect(() => {
    let interval: any;
    if (step === "installing") {
      interval = setInterval(() => {
        setActiveStageIndex((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
      }, 700);
    }
    return () => clearInterval(interval);
  }, [step]);

  const handleStartInstallation = () => {
    setStep("installing");
    setActiveStageIndex(0);
    setErrorMessage(null);
    installMutation.mutate(configState);
  };

  const req = module.requirements_status;
  const canProceedFromRequirements =
    req.subscription_eligible &&
    req.has_install_permission &&
    req.is_available &&
    req.dependencies_met;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-pulse-border bg-pulse-surface shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-pulse-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pulse-accent text-white shadow-sm">
              <ModuleIcon name={module.icon} size="md" />
            </div>
            <div>
              <h2 className="text-base font-bold text-pulse-ink">
                Install {module.name}
              </h2>
              <p className="text-xs text-pulse-muted">
                Guided Enterprise Installation Wizard · Step {typeof step === "number" ? `${step} of 4` : "Executing"}
              </p>
            </div>
          </div>
          {step !== "installing" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink transition"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Stepper Pill Indicator */}
        {typeof step === "number" && (
          <div className="grid grid-cols-4 gap-2 border-b border-pulse-border bg-pulse-bg px-6 py-2.5 text-[11px] font-semibold">
            <div className={`flex items-center gap-1.5 ${step === 1 ? "text-pulse-accent" : "text-pulse-muted"}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${step === 1 ? "bg-pulse-accent text-white" : "bg-pulse-border text-pulse-ink"}`}>1</span>
              Review
            </div>
            <div className={`flex items-center gap-1.5 ${step === 2 ? "text-pulse-accent" : "text-pulse-muted"}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${step === 2 ? "bg-pulse-accent text-white" : "bg-pulse-border text-pulse-ink"}`}>2</span>
              Requirements
            </div>
            <div className={`flex items-center gap-1.5 ${step === 3 ? "text-pulse-accent" : "text-pulse-muted"}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${step === 3 ? "bg-pulse-accent text-white" : "bg-pulse-border text-pulse-ink"}`}>3</span>
              Configuration
            </div>
            <div className={`flex items-center gap-1.5 ${step === 4 ? "text-pulse-accent" : "text-pulse-muted"}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${step === 4 ? "bg-pulse-accent text-white" : "bg-pulse-border text-pulse-ink"}`}>4</span>
              Confirmation
            </div>
          </div>
        )}

        {/* Wizard Content Body */}
        <div className="flex-1 overflow-y-auto p-6 text-sm">
          {/* STEP 1: REVIEW */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-pulse-ink">Review Module Overview</h3>
                <p className="mt-1 text-xs text-pulse-muted">
                  You are preparing to install <span className="font-semibold text-pulse-ink">{module.name} v{module.version}</span> into <span className="font-semibold text-pulse-ink">{companyName}</span>.
                </p>
              </div>

              <div className="rounded-xl border border-pulse-border bg-pulse-bg p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-pulse-muted">Business Impact</p>
                <p className="mt-1 text-xs leading-relaxed text-pulse-ink">{module.problem_solved || module.description}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-pulse-muted">
                  <span className="font-medium">Target Users:</span>
                  <span className="text-pulse-ink font-semibold">{module.target_users || "All team members"}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-pulse-muted">Included Capabilities</p>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {module.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 rounded-lg border border-pulse-border bg-pulse-surface p-2.5">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pulse-hover text-pulse-accent">
                        <ModuleIcon name={feat.icon} size="sm" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-pulse-ink">{feat.title}</p>
                        <p className="text-[11px] text-pulse-muted line-clamp-2">{feat.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: REQUIREMENTS */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-pulse-ink">Pre-Installation System Checks</h3>
                <p className="mt-1 text-xs text-pulse-muted">
                  We automatically verify entitlements, administrative permissions, and module dependencies.
                </p>
              </div>

              <div className="space-y-2.5">
                {/* 1. Subscription Check */}
                <div className={`flex items-start justify-between rounded-xl border p-3.5 ${req.subscription_eligible ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-rose-200 bg-rose-50/50 dark:bg-rose-950/20"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${req.subscription_eligible ? "bg-emerald-500" : "bg-rose-500"}`}>
                      {req.subscription_eligible ? "✓" : "✕"}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-pulse-ink">Subscription Plan Entitlement</p>
                      <p className="text-[11px] text-pulse-muted">
                        {req.subscription_eligible
                          ? `Included in your active workspace subscription.`
                          : `This module requires an upgrade. Please review plan options in Billing & Plan.`}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${req.subscription_eligible ? "text-emerald-700" : "text-rose-700"}`}>
                    {req.subscription_eligible ? "PASS" : "FAILED"}
                  </span>
                </div>

                {/* 2. Permission Check */}
                <div className={`flex items-start justify-between rounded-xl border p-3.5 ${req.has_install_permission ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-rose-200 bg-rose-50/50 dark:bg-rose-950/20"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${req.has_install_permission ? "bg-emerald-500" : "bg-rose-500"}`}>
                      {req.has_install_permission ? "✓" : "✕"}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-pulse-ink">Company Admin Authorization</p>
                      <p className="text-[11px] text-pulse-muted">
                        {req.has_install_permission
                          ? "Authorized with 'modules.install' administrative capability."
                          : "Missing required 'modules.install' authorization. Contact workspace owner."}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${req.has_install_permission ? "text-emerald-700" : "text-rose-700"}`}>
                    {req.has_install_permission ? "PASS" : "FAILED"}
                  </span>
                </div>

                {/* 3. Module Availability */}
                <div className={`flex items-start justify-between rounded-xl border p-3.5 ${req.is_available ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${req.is_available ? "bg-emerald-500" : "bg-amber-500"}`}>
                      {req.is_available ? "✓" : "!"}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-pulse-ink">Module Availability & Registry State</p>
                      <p className="text-[11px] text-pulse-muted">
                        {req.is_available
                          ? "Module package verified in trusted catalog and ready for automated deployment."
                          : "Module is scheduled for future release."}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${req.is_available ? "text-emerald-700" : "text-amber-700"}`}>
                    {req.is_available ? "PASS" : "WAITING"}
                  </span>
                </div>

                {/* 4. Dependencies */}
                <div className={`flex items-start justify-between rounded-xl border p-3.5 ${req.dependencies_met ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-rose-200 bg-rose-50/50 dark:bg-rose-950/20"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${req.dependencies_met ? "bg-emerald-500" : "bg-rose-500"}`}>
                      {req.dependencies_met ? "✓" : "✕"}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-pulse-ink">Required Module Dependencies</p>
                      <p className="text-[11px] text-pulse-muted">
                        {module.dependencies && module.dependencies.length > 0
                          ? `Requires: ${module.dependencies.map((d) => d.name).join(", ")}`
                          : "No external module dependencies required."}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${req.dependencies_met ? "text-emerald-700" : "text-rose-700"}`}>
                    {req.dependencies_met ? "PASS" : "BLOCKED"}
                  </span>
                </div>
              </div>

              {!canProceedFromRequirements && (
                <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
                  ⚠️ Some pre-installation checks failed. Resolve the highlighted items before proceeding.
                </div>
              )}
            </div>
          )}

          {/* STEP 3: CONFIGURATION */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-pulse-ink">Initial Module Configuration</h3>
                <p className="mt-1 text-xs text-pulse-muted">
                  Customize operational defaults or apply recommended best practices. You can also adjust these later in Settings.
                </p>
              </div>

              {Object.keys(module.config_schema || {}).length === 0 ? (
                <div className="rounded-xl border border-pulse-border bg-pulse-bg p-6 text-center text-xs text-pulse-muted">
                  No mandatory initial configuration is required for this module. Standard enterprise defaults will be applied automatically.
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-pulse-border bg-pulse-bg p-4">
                  {Object.entries(module.config_schema).map(([key, schema]) => (
                    <div key={key} className="flex items-center justify-between gap-4 border-b border-pulse-border pb-3 last:border-0 last:pb-0">
                      <div>
                        <label className="text-xs font-bold text-pulse-ink block">{schema.label}</label>
                        <p className="text-[11px] text-pulse-muted">Parameter: <code className="font-mono text-pulse-ink">{key}</code></p>
                      </div>

                      {schema.type === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(configState[key])}
                          onChange={(e) => setConfigState({ ...configState, [key]: e.target.checked })}
                          className="h-4 w-4 rounded border-pulse-border text-pulse-accent focus:ring-pulse-accent"
                        />
                      ) : schema.type === "integer" ? (
                        <input
                          type="number"
                          value={configState[key] ?? ""}
                          onChange={(e) => setConfigState({ ...configState, [key]: Number(e.target.value) })}
                          className="w-24 rounded-md border border-pulse-border bg-pulse-surface px-2.5 py-1 text-xs text-pulse-ink"
                        />
                      ) : (
                        <input
                          type="text"
                          value={configState[key] ?? ""}
                          onChange={(e) => setConfigState({ ...configState, [key]: e.target.value })}
                          className="w-48 rounded-md border border-pulse-border bg-pulse-surface px-2.5 py-1 text-xs text-pulse-ink"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg bg-teal-50 p-3 text-xs text-teal-800 dark:bg-teal-950/30 dark:text-teal-300 border border-teal-200">
                💡 Configuration parameters can be adjusted at any time under the workspace Settings tab.
              </div>
            </div>
          )}

          {/* STEP 4: SUMMARY & CONFIRMATION */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-pulse-ink">Confirm Installation</h3>
                <p className="mt-1 text-xs text-pulse-muted">
                  Please review the deployment summary before finalizing installation.
                </p>
              </div>

              <div className="rounded-xl border border-pulse-border bg-pulse-bg p-4 space-y-2 text-xs">
                <div className="flex justify-between border-b border-pulse-border pb-2">
                  <span className="text-pulse-muted">Module:</span>
                  <span className="font-bold text-pulse-ink">{module.name} (v{module.version})</span>
                </div>
                <div className="flex justify-between border-b border-pulse-border pb-2">
                  <span className="text-pulse-muted">Target Company:</span>
                  <span className="font-bold text-pulse-ink">{companyName}</span>
                </div>
                <div className="flex justify-between border-b border-pulse-border pb-2">
                  <span className="text-pulse-muted">Isolation & Security:</span>
                  <span className="font-semibold text-emerald-700">Strict Tenant Isolation Enforced</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-pulse-muted">Audit Record:</span>
                  <span className="font-mono text-[11px] text-pulse-ink">module.installed</span>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-pulse-border bg-pulse-surface p-3.5 cursor-pointer hover:bg-pulse-hover transition">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-pulse-border text-pulse-accent focus:ring-pulse-accent"
                />
                <span className="text-xs text-pulse-ink leading-relaxed">
                  I understand that installing <span className="font-bold">{module.name}</span> will enable this workspace for authorized users. Existing identity, company, and organizational records remain preserved.
                </span>
              </label>
            </div>
          )}

          {/* INSTALLING STATE */}
          {step === "installing" && (
            <div className="py-8 space-y-6 text-center">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-pulse-accent/10 text-pulse-accent">
                <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>

              <div>
                <h3 className="text-lg font-bold text-pulse-ink">Installing {module.name}...</h3>
                <p className="mt-1 text-xs text-pulse-muted">
                  Applying database schemas, permissions, and initial configuration.
                </p>
              </div>

              {/* Progress Steps List */}
              <div className="mx-auto max-w-md space-y-2 text-left">
                {STAGES.map((label, idx) => {
                  const isDone = idx < activeStageIndex;
                  const isCurrent = idx === activeStageIndex;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition ${
                        isCurrent
                          ? "bg-pulse-accent/10 font-bold text-pulse-accent border border-pulse-accent/30"
                          : isDone
                          ? "text-emerald-700 dark:text-emerald-400 font-medium"
                          : "text-pulse-muted opacity-50"
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]">
                        {isDone ? "✓" : isCurrent ? "●" : "○"}
                      </span>
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FAILED STATE */}
          {step === "failed" && (
            <div className="py-6 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-pulse-ink">Installation Failed</h3>
              <p className="mx-auto max-w-md text-xs text-rose-600 font-medium">
                {errorMessage || "An unexpected error occurred during installation."}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="rounded-lg bg-pulse-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition"
                >
                  Retry Installation
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-pulse-border bg-pulse-surface px-4 py-2 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        {typeof step === "number" && (
          <div className="flex items-center justify-between border-t border-pulse-border bg-pulse-bg px-6 py-3.5">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((prev) => (typeof prev === "number" && prev > 1 ? ((prev - 1) as WizardStep) : prev))}
              className="rounded-lg border border-pulse-border bg-pulse-surface px-3 py-1.5 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover disabled:opacity-40 transition"
            >
              Back
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-pulse-border bg-pulse-surface px-3 py-1.5 text-xs font-semibold text-pulse-muted hover:text-pulse-ink transition"
              >
                Cancel
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  disabled={step === 2 && !canProceedFromRequirements}
                  onClick={() => setStep((prev) => (typeof prev === "number" ? ((prev + 1) as WizardStep) : prev))}
                  className="rounded-lg bg-pulse-accent px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-40 transition"
                >
                  Continue &rarr;
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!confirmed || installMutation.isPending}
                  onClick={handleStartInstallation}
                  className="rounded-lg bg-teal-600 px-5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-40 transition"
                >
                  Confirm & Install
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

