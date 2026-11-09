import { useState } from "react";
import { PulseMark } from "../../shared/ui/PulseMark";
import { Button } from "../../shared/ui/Button";

export type AccountStatusScreenProps = {
  type: "suspended" | "closed" | "error";
  company?: {
    id: string;
    display_name: string;
    legal_name?: string;
    slug?: string;
    status?: string;
    suspended_at?: string | null;
    closed_at?: string | null;
    status_reason?: string | null;
  };
  reason?: string | null;
  date?: string | null;
  message?: string;
  user?: { email?: string; first_name?: string; last_name?: string };
  companies?: Array<{
    company_id: string;
    company_display_name: string;
    company_slug?: string;
    company_status?: string;
    status?: string;
  }>;
  onSwitchCompany?: (companyId: string) => void;
  onSignOut?: () => void;
};

export function AccountStatusScreen({
  type,
  company,
  reason,
  date,
  message,
  user,
  companies = [],
  onSwitchCompany,
  onSignOut,
}: AccountStatusScreenProps) {
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const displayReason = reason || company?.status_reason;
  const displayDate = date || (type === "suspended" ? company?.suspended_at : company?.closed_at);
  const otherCompanies = companies.filter((c) => c.company_id !== company?.id);

  const formattedDate = displayDate
    ? new Date(displayDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const isSuspended = type === "suspended";
  const isClosed = type === "closed";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* Top Bar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <PulseMark size="sm" />
            <span className="text-base font-semibold tracking-tight">Pulse ERP</span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            {user?.email && (
              <span className="hidden sm:inline-block text-xs text-slate-500 dark:text-slate-400">
                Signed in as <span className="font-medium text-slate-700 dark:text-slate-300">{user.email}</span>
              </span>
            )}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-xl">
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
            {/* Header / Banner */}
            <div
              className={`p-6 sm:p-8 text-center border-b ${
                isSuspended
                  ? "border-amber-100 bg-amber-50/60 dark:border-amber-950/40 dark:bg-amber-950/20"
                  : isClosed
                  ? "border-rose-100 bg-rose-50/60 dark:border-rose-950/40 dark:bg-rose-950/20"
                  : "border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40"
              }`}
            >
              {/* Status Icon */}
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ${
                  isSuspended
                    ? "bg-amber-500 text-white"
                    : isClosed
                    ? "bg-rose-600 text-white"
                    : "bg-slate-700 text-white"
                }`}
              >
                {isSuspended ? (
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                ) : isClosed ? (
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>

              {/* Status Pill Badge */}
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-2">
                {isSuspended ? (
                  <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-3 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                    Account Suspended
                  </span>
                ) : isClosed ? (
                  <span className="bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 px-3 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                    Account Closed
                  </span>
                ) : (
                  <span className="bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 px-3 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                    Access Restricted
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {isSuspended
                  ? "Company Account Suspended"
                  : isClosed
                  ? "Company Account Closed"
                  : "Workspace Access Restricted"}
              </h1>

              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                {company?.display_name ? (
                  <>
                    Access to <strong className="font-semibold text-slate-900 dark:text-slate-100">{company.display_name}</strong>{" "}
                    {isSuspended
                      ? "has been suspended by the platform administrator."
                      : isClosed
                      ? "has been closed by the platform administrator."
                      : "is currently unavailable."}
                  </>
                ) : (
                  message || "This company workspace cannot be accessed at this time."
                )}
              </p>
            </div>

            {/* Details Section */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Reason Highlight Box */}
              {displayReason && (
                <div
                  className={`rounded-xl border p-4 text-left ${
                    isSuspended
                      ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20"
                      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {isSuspended ? "Reason for Suspension" : isClosed ? "Reason for Closure" : "Notice"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {displayReason}
                  </p>
                  {formattedDate && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Action taken on: {formattedDate}
                    </p>
                  )}
                </div>
              )}

              {/* Data Safety Notice */}
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  What does this mean?
                </p>
                {isSuspended ? (
                  <p>
                    All workspace operations, user sessions, and integrations for this company are temporarily paused.
                    Your business records, projects, and tenant data remain <strong>completely safe and preserved</strong>.
                  </p>
                ) : isClosed ? (
                  <p>
                    This company has been permanently closed. Workspace features and tenant access are disabled.
                    Company data remains retained in accordance with enterprise policies.
                  </p>
                ) : (
                  <p>
                    {message || "Access to this company is restricted by administrative policies."}
                  </p>
                )}
                <p className="pt-1 text-[11px] text-slate-500">
                  To restore access or for assistance, contact your platform administrator or email support.
                </p>
              </div>

              {/* Switch Company Section if multiple memberships */}
              {otherCompanies.length > 0 && onSwitchCompany && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Your Other Companies
                  </p>
                  <div className="space-y-2">
                    {otherCompanies.map((c) => (
                      <div
                        key={c.company_id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3 text-sm hover:border-teal-500 transition"
                      >
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {c.company_display_name}
                          </p>
                          {c.company_slug && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              pulse.app/{c.company_slug}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={switchingId === c.company_id}
                          onClick={() => {
                            setSwitchingId(c.company_id);
                            onSwitchCompany(c.company_id);
                          }}
                        >
                          {switchingId === c.company_id ? "Opening..." : "Switch to company"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <a
                  href="mailto:support@pulse.local?subject=Account%20Inquiry%20-%20Suspended%20Company"
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400 hover:underline"
                >
                  Contact support
                </a>

                {onSignOut && (
                  <Button type="button" variant="secondary" onClick={onSignOut}>
                    Sign out
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
