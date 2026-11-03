import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformSettingsData } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { SelectField } from "../../shared/ui/Fields";
import { ErrorState, LoadingState } from "../../shared/ui/States";

export function PlatformSettingsPage() {
  const queryClient = useQueryClient();

  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [defaultPlanCode, setDefaultPlanCode] = useState("growth");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => api<PlatformSettingsData>("/api/v1/platform/settings/"),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setGracePeriodDays(settingsQuery.data.grace_period_days);
      setRegistrationEnabled(settingsQuery.data.company_registration_enabled);
      setDefaultPlanCode(settingsQuery.data.default_plan_code);
      setMaintenanceMode(settingsQuery.data.maintenance_mode);
      setBannerMessage(settingsQuery.data.platform_banner_message || "");
    }
  }, [settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api<PlatformSettingsData>("/api/v1/platform/settings/", {
        method: "PATCH",
        body: JSON.stringify({
          grace_period_days: gracePeriodDays,
          company_registration_enabled: registrationEnabled,
          default_plan_code: defaultPlanCode,
          maintenance_mode: maintenanceMode,
          platform_banner_message: bannerMessage,
        }),
      }),
    onSuccess: (data) => {
      setError("");
      setNotice("Platform settings saved successfully.");
      queryClient.setQueryData(["platform-settings"], data);
    },
    onError: (err) => {
      setNotice("");
      setError(err instanceof ApiError ? err.message : "Failed to update platform settings.");
    },
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs items={["Platform", "Platform Settings"]} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">Platform Settings</h1>
          <p className="mt-0.5 text-xs text-pulse-muted">
            Global system operational flags, billing grace parameters, and registration policy.
          </p>
        </div>
      </div>

      {settingsQuery.isLoading ? <LoadingState label="Loading platform settings" /> : null}

      {settingsQuery.error ? (
        <ErrorState
          title="Settings could not be loaded"
          body={settingsQuery.error instanceof ApiError ? settingsQuery.error.message : "API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => settingsQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {notice ? (
        <div className="rounded-md bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 p-3 text-xs text-teal-800 dark:text-teal-200">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {settingsQuery.data ? (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
        >
          {/* Commercial & Billing Parameters */}
          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-2xs space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-pulse-ink">Commercial & Billing Parameters</h2>
              <p className="text-xs text-pulse-muted">Defines automated handling when tenant renewals become past-due.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-pulse-ink mb-1">
                  Subscription Grace Period (Days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                  className="w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-xs text-pulse-ink focus:border-teal-500 focus:outline-hidden"
                />
                <p className="mt-1 text-[11px] text-pulse-muted">
                  Recommended: 7 days. During grace, tenants retain read-only access while payment retries execute.
                </p>
              </div>

              <SelectField
                label="Default Onboarding Plan"
                name="defPlan"
                value={defaultPlanCode}
                onChange={(e) => setDefaultPlanCode(e.target.value)}
              >
                <option value="growth">Growth Plan (14-day trial)</option>
                <option value="starter">Starter Plan</option>
                <option value="enterprise">Enterprise Plan</option>
              </SelectField>
            </div>
          </div>

          {/* Registration & System Availability */}
          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-2xs space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-pulse-ink">Tenant Registration & Platform Availability</h2>
              <p className="text-xs text-pulse-muted">Controls tenant signup availability and system announcement banners.</p>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={registrationEnabled}
                  onChange={(e) => setRegistrationEnabled(e.target.checked)}
                  className="mt-0.5 rounded border-pulse-border text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <span className="text-xs font-medium text-pulse-ink">Allow Public Company Registration</span>
                  <p className="text-[11px] text-pulse-muted">
                    When disabled, new self-service tenant signups are closed. Only platform operators can provision companies.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={(e) => setMaintenanceMode(e.target.checked)}
                  className="mt-0.5 rounded border-pulse-border text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-medium text-pulse-ink">Platform Maintenance Mode</span>
                  <p className="text-[11px] text-pulse-muted">
                    Displays a system-wide maintenance advisory notice across tenant workspaces.
                  </p>
                </div>
              </label>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-medium text-pulse-ink mb-1">
                Platform Announcement Banner Message (Optional)
              </label>
              <textarea
                value={bannerMessage}
                onChange={(e) => setBannerMessage(e.target.value)}
                rows={2}
                placeholder="Optional broadcast banner text visible to all signed-in users..."
                className="w-full rounded-md border border-pulse-border bg-pulse-surface p-2 text-xs text-pulse-ink focus:border-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save platform settings"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
