import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api, ApiError, clearCsrfToken } from "../../shared/api/client";
import type { CurrentUser } from "../../shared/api/types";
import { AuthCard, AuthFrame } from "../../shared/ui/AuthFrame";
import { Button } from "../../shared/ui/Button";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { LoadingState } from "../../shared/ui/States";
import { maskEmail } from "../auth/email";
import { ModuleStep } from "./ModuleStep";
import { OnboardingShell, type OnboardingPhase } from "./OnboardingShell";

const STATES = [
  ["01", "Jammu and Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["25", "Daman and Diu"],
  ["26", "Dadra and Nagar Haveli"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
] as const;

const TIMEZONES = [
  ["Asia/Kolkata", "(UTC+05:30) India"],
  ["Asia/Dubai", "(UTC+04:00) Dubai"],
  ["Asia/Singapore", "(UTC+08:00) Singapore"],
  ["Europe/London", "(UTC+00:00) London"],
  ["Europe/Berlin", "(UTC+01:00) Berlin"],
  ["America/New_York", "(UTC−05:00) Eastern Time"],
  ["America/Los_Angeles", "(UTC−08:00) Pacific Time"],
] as const;

const CREATE_STEPS = ["Company profile saved", "Billing profile saved", "Trial started", "Workspace ready"];

type Onboarding = {
  company_id: string | null;
  current_step: "email" | "company" | "profile" | "billing_profile" | "plan" | "checkout" | "workspace" | "done";
  steps: {
    email_verified: boolean;
    company_created: boolean;
    profile_completed: boolean;
    billing_profile_completed: boolean;
    plan_selected: boolean;
    subscription_activated: boolean;
    workspace_entered: boolean;
  };
  company: {
    legal_name: string;
    display_name: string;
    timezone: string;
    slug: string;
    status: string;
  } | null;
  billing_profile: {
    billing_name: string;
    billing_email: string;
    phone: string | null;
    address_line1: string;
    address_line2: string;
    city: string;
    state_code: string;
    postal_code: string;
    gstin: string | null;
  } | null;
  access_mode: string;
  installed_modules?: string[];
  subscription: {
    status: string;
    plan_name: string;
    billing_interval: string;
    amount_minor: number;
    trial_ends_at: string | null;
  } | null;
};

type PlanCatalog = {
  results: Array<{
    code: string;
    name: string;
    description: string;
    trial_days: number;
    prices: Array<{ billing_interval: "month" | "year"; currency: string; amount_minor: number }>;
    entitlements: Record<string, unknown>;
  }>;
};

type LocalPhase = "review" | "modules" | "creating" | null;

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

function initialsFor(user: CurrentUser | undefined) {
  const letters = `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`.toUpperCase();
  return letters || (user?.email.slice(0, 2).toUpperCase() ?? "P");
}

function stateName(code: string) {
  return STATES.find(([value]) => value === code)?.[1] ?? code;
}

function timezoneLabel(value: string) {
  return TIMEZONES.find(([zone]) => zone === value)?.[1] ?? value;
}

const companySchema = z.object({
  legal_name: z.string().trim().min(1, "Enter your company name."),
  display_name: z.string().trim().min(1, "Enter a workspace name."),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.").min(3, "Use at least 3 characters."),
});

const namesSchema = z.object({
  legal_name: z.string().trim().min(1, "Enter your company name."),
  display_name: z.string().trim().min(1, "Enter a workspace name."),
});

const informationSchema = z.object({
  legal_name: z.string().trim().min(1, "Enter your company name."),
  display_name: z.string().trim().min(1, "Enter a workspace name."),
  timezone: z.string().trim().min(1, "Choose a time zone."),
  billing_name: z.string().trim().min(1, "Enter the billing name."),
  billing_email: z.string().trim().email("Enter a valid email address."),
  phone: z.string(),
  address_line1: z.string().trim().min(1, "Enter the address."),
  address_line2: z.string(),
  city: z.string().trim().min(1, "Enter the city."),
  state_code: z.string().min(2, "Choose a state."),
  postal_code: z.string().regex(/^\d{6}$/, "Enter a 6-digit postal code."),
  gstin: z.string(),
});

type CompanyValues = z.infer<typeof companySchema>;
type NamesValues = z.infer<typeof namesSchema>;
type InformationValues = z.infer<typeof informationSchema>;

function applyFieldErrors(error: unknown, setError: (field: string, message: { message: string }) => void) {
  if (!(error instanceof ApiError)) {
    return;
  }
  for (const detail of error.details) {
    if (detail.field) {
      setError(detail.field, { message: detail.message });
    }
  }
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">{value || "Not provided"}</p>
      </div>
      <button type="button" className="text-sm font-semibold text-teal-800" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

function CreatingWorkspace({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (count >= CREATE_STEPS.length) {
      const timer = window.setTimeout(onDone, 500);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setCount((current) => current + 1), 650);
    return () => window.clearTimeout(timer);
  }, [count, onDone]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 sm:p-8">
      <ol className="space-y-3">
        {CREATE_STEPS.map((label, index) => {
          const done = index < count;
          const active = index === count;
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${done ? "bg-teal-800 text-white" : "border border-slate-300 dark:border-slate-600 text-slate-400"}`}>
                {done ? "✓" : active ? "•" : ""}
              </span>
              <span className={done || active ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}>{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function OnboardingPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<"company" | "information" | null>(null);
  const [local, setLocal] = useState<LocalPhase>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [moduleFocus, setModuleFocus] = useState(false);
  const [slugLocked, setSlugLocked] = useState(false);
  const current = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/v1/auth/me/") });
  const onboarding = useQuery({ queryKey: ["onboarding"], queryFn: () => api<Onboarding>("/api/v1/onboarding/") });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api<PlanCatalog>("/api/v1/plans/") });
  const companyForm = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { legal_name: "", display_name: "", slug: "" },
  });
  const namesForm = useForm<NamesValues>({
    resolver: zodResolver(namesSchema),
    values: {
      legal_name: onboarding.data?.company?.legal_name ?? "",
      display_name: onboarding.data?.company?.display_name ?? "",
    },
  });
  const informationForm = useForm<InformationValues>({
    resolver: zodResolver(informationSchema),
    values: {
      legal_name: onboarding.data?.company?.legal_name ?? "",
      display_name: onboarding.data?.company?.display_name ?? "",
      timezone: onboarding.data?.company?.timezone ?? "Asia/Kolkata",
      billing_name: onboarding.data?.billing_profile?.billing_name ?? onboarding.data?.company?.legal_name ?? "",
      billing_email: onboarding.data?.billing_profile?.billing_email ?? current.data?.email ?? "",
      phone: onboarding.data?.billing_profile?.phone ?? "",
      address_line1: onboarding.data?.billing_profile?.address_line1 ?? "",
      address_line2: onboarding.data?.billing_profile?.address_line2 ?? "",
      city: onboarding.data?.billing_profile?.city ?? "",
      state_code: onboarding.data?.billing_profile?.state_code ?? "27",
      postal_code: onboarding.data?.billing_profile?.postal_code ?? "",
      gstin: onboarding.data?.billing_profile?.gstin ?? "",
    },
  });
  const displayName = companyForm.watch("display_name");

  useEffect(() => {
    if (slugLocked) {
      return;
    }
    const next = slugify(displayName);
    if (companyForm.getValues("slug") !== next) {
      companyForm.setValue("slug", next);
    }
  }, [companyForm, displayName, slugLocked]);
  const finishCreating = useCallback(() => setLocal(null), []);
  useEffect(() => {
    const companyId = onboarding.data?.company_id;
    if (!companyId) {
      return;
    }
    const raw = sessionStorage.getItem(`pulse-modules:${companyId}`);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setSelectedModules(parsed.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      sessionStorage.removeItem(`pulse-modules:${companyId}`);
    }
  }, [onboarding.data?.company_id]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  };
  const createCompany = useMutation({
    mutationFn: (values: CompanyValues) =>
      api("/api/v1/onboarding/company/", { method: "POST", body: JSON.stringify({ ...values, timezone: "Asia/Kolkata" }) }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
    onError: (error) => applyFieldErrors(error, (field, message) => companyForm.setError(field as keyof CompanyValues, message)),
  });
  const saveNames = useMutation({
    mutationFn: (values: NamesValues) =>
      api("/api/v1/onboarding/company-profile/", {
        method: "PATCH",
        body: JSON.stringify({ ...values, timezone: onboarding.data?.company?.timezone ?? "Asia/Kolkata" }),
      }),
    onSuccess: async () => {
      setEditing(null);
      setLocal("review");
      await refresh();
    },
    onError: (error) => applyFieldErrors(error, (field, message) => namesForm.setError(field as keyof NamesValues, message)),
  });
  const saveInformation = useMutation({
    mutationFn: async (values: InformationValues) => {
      await api("/api/v1/onboarding/company-profile/", {
        method: "PATCH",
        body: JSON.stringify({ legal_name: values.legal_name, display_name: values.display_name, timezone: values.timezone }),
      });
      await api("/api/v1/onboarding/billing-profile/", {
        method: "PUT",
        body: JSON.stringify({
          billing_name: values.billing_name,
          billing_email: values.billing_email,
          phone: values.phone,
          address_line1: values.address_line1,
          address_line2: values.address_line2,
          city: values.city,
          state_code: values.state_code,
          postal_code: values.postal_code,
          country_code: "IN",
          gstin: values.gstin.trim().toUpperCase(),
        }),
      });
    },
    onSuccess: async () => {
      setEditing(null);
      setLocal("review");
      await refresh();
    },
    onError: (error) => applyFieldErrors(error, (field, message) => informationForm.setError(field as keyof InformationValues, message)),
  });
  const selectPlan = useMutation({
    mutationFn: (planCode: string) =>
      api("/api/v1/onboarding/plan/", {
        method: "POST",
        body: JSON.stringify({ plan_code: planCode, billing_interval: "year", module_slugs: selectedModules }),
      }),
    onSuccess: async () => {
      await refresh();
      setLocal("creating");
    },
  });
  const resend = useMutation({
    mutationFn: () => api<{ delivery: "smtp" | "console" }>("/api/v1/auth/email-verifications/", { method: "POST" }),
  });
  const logout = useMutation({
    mutationFn: () => api<void>("/api/v1/auth/logout/", { method: "POST" }),
    onSuccess: () => {
      clearCsrfToken();
      queryClient.clear();
      window.location.assign("/welcome");
    },
  });

  if (current.isLoading || onboarding.isLoading || !onboarding.data || !current.data) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="Loading onboarding" />
      </main>
    );
  }

  const progress = onboarding.data;
  const user = current.data;
  const serverPhase: OnboardingPhase | "email" =
    progress.current_step === "email" ? "email"
      : progress.current_step === "company" ? "company"
        : progress.current_step === "profile" || progress.current_step === "billing_profile" ? "information"
          : progress.current_step === "plan" || progress.current_step === "checkout" ? "modules"
            : "ready";
  const rawPhase: OnboardingPhase | "email" = editing ?? local ?? serverPhase;
  const phase: OnboardingPhase | "email" = (rawPhase as string) === "plan" ? "modules" : rawPhase;
  const actionError = firstApiError(createCompany.error, saveNames.error, saveInformation.error, selectPlan.error, plans.error);
  const catalogPlan = plans.data?.results[0] ?? null;

  if (phase === "email") {
    return (
      <AuthFrame>
        <AuthCard title="Verify your email" description={<>We sent a verification link to <span className="font-medium text-slate-700 dark:text-slate-300">{maskEmail(user.email)}</span>.</>}>
          <div className="rounded-xl bg-teal-50 dark:bg-teal-950 px-4 py-3 text-sm text-teal-900 dark:text-teal-100">
            <p className="font-semibold">Waiting for verification</p>
            <p className="mt-1 text-teal-800">Open the link in the email to verify your address. Company setup continues after that.</p>
          </div>
          <Button type="button" className="mt-5 w-full rounded-lg py-2.5" variant="secondary" disabled={resend.isPending} onClick={() => resend.mutate()}>
            {resend.isPending ? "Sending" : "Resend verification email"}
          </Button>
          {resend.data?.delivery === "smtp" ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">The link was sent. Check the inbox and the spam folder.</p> : null}
          {resend.data?.delivery === "console" ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Gmail was not used. The link is in the API server window.</p> : null}
          {resend.error instanceof ApiError ? <p className="mt-3 text-sm text-rose-700">{resend.error.message}</p> : null}
          <button type="button" className="mt-4 w-full text-sm font-medium text-slate-600 dark:text-slate-300" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Sign out
          </button>
        </AuthCard>
      </AuthFrame>
    );
  }

  const shell = {
    email: user.email,
    initials: initialsFor(user),
    phase,
    onSignOut: () => logout.mutate(),
    signingOut: logout.isPending,
  };

  if (phase === "company" && !progress.steps.company_created) {
    return (
      <OnboardingShell {...shell} title="Create a new company" description="Your company gets its own isolated workspace. You can change these later.">
        <form className="space-y-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 sm:p-8" onSubmit={companyForm.handleSubmit((values) => createCompany.mutate(values))} noValidate>
          <TextField label="Company name" required hint="Your legal or commonly used company name." {...companyForm.register("legal_name")} error={companyForm.formState.errors.legal_name?.message} />
          <TextField label="Workspace name" required hint="Shown to your team inside Pulse." {...companyForm.register("display_name")} error={companyForm.formState.errors.display_name?.message} />
          <TextField
            label="Workspace URL"
            required
            prefix="pulse.app/"
            hint="Use lowercase letters, numbers, and hyphens."
            {...companyForm.register("slug", { onChange: () => setSlugLocked(true) })}
            error={companyForm.formState.errors.slug?.message}
          />
          {actionError ? <p className="text-sm text-rose-700">{actionError}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" className="rounded-lg px-5 py-2.5" disabled={createCompany.isPending}>
              {createCompany.isPending ? "Creating" : "Continue"}
            </Button>
          </div>
        </form>
      </OnboardingShell>
    );
  }

  if (phase === "company") {
    return (
      <OnboardingShell {...shell} title="Company name" description="The workspace URL stays as it was created.">
        <form className="space-y-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 sm:p-8" onSubmit={namesForm.handleSubmit((values) => saveNames.mutate(values))} noValidate>
          <TextField label="Company name" required {...namesForm.register("legal_name")} error={namesForm.formState.errors.legal_name?.message} />
          <TextField label="Workspace name" required {...namesForm.register("display_name")} error={namesForm.formState.errors.display_name?.message} />
          <p className="text-sm text-slate-500 dark:text-slate-400">pulse.app/{progress.company?.slug}</p>
          {actionError ? <p className="text-sm text-rose-700">{actionError}</p> : null}
          <div className="flex items-center justify-between">
            <button type="button" className="text-sm font-semibold text-slate-700 dark:text-slate-300" onClick={() => setEditing(null)}>Back</button>
            <Button type="submit" className="rounded-lg px-5 py-2.5" disabled={saveNames.isPending}>{saveNames.isPending ? "Saving" : "Save"}</Button>
          </div>
        </form>
      </OnboardingShell>
    );
  }

  if (phase === "information") {
    return (
      <OnboardingShell {...shell} title="Company information" description="Used for localization, billing, and your company profile.">
        <form className="space-y-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 sm:p-8" onSubmit={informationForm.handleSubmit((values) => saveInformation.mutate(values))} noValidate>
          <p className="text-sm text-slate-500 dark:text-slate-400">* Required · fields marked Optional can be added later</p>
          <TextField label="Company name" required {...informationForm.register("legal_name")} error={informationForm.formState.errors.legal_name?.message} />
          <TextField label="Workspace name" required {...informationForm.register("display_name")} error={informationForm.formState.errors.display_name?.message} />
          <SelectField label="Timezone" required {...informationForm.register("timezone")} error={informationForm.formState.errors.timezone?.message}>
            {TIMEZONES.map(([zone, label]) => (
              <option key={zone} value={zone}>{label}</option>
            ))}
            {informationForm.watch("timezone") && !TIMEZONES.some(([zone]) => zone === informationForm.watch("timezone")) ? (
              <option value={informationForm.watch("timezone")}>{informationForm.watch("timezone")}</option>
            ) : null}
          </SelectField>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Billing profile</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">GSTIN is optional. A matching value is a format check, not proof of registration.</p>
          </div>
          <TextField label="Billing name" required {...informationForm.register("billing_name")} error={informationForm.formState.errors.billing_name?.message} />
          <TextField label="Billing email" required type="email" {...informationForm.register("billing_email")} error={informationForm.formState.errors.billing_email?.message} />
          <TextField label="Phone" optional {...informationForm.register("phone")} error={informationForm.formState.errors.phone?.message} />
          <TextField label="Address" required {...informationForm.register("address_line1")} error={informationForm.formState.errors.address_line1?.message} />
          <TextField label="Address line 2" optional {...informationForm.register("address_line2")} error={informationForm.formState.errors.address_line2?.message} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="City" required {...informationForm.register("city")} error={informationForm.formState.errors.city?.message} />
            <TextField label="Postal code" required {...informationForm.register("postal_code")} error={informationForm.formState.errors.postal_code?.message} />
          </div>
          <SelectField label="State" required {...informationForm.register("state_code")} error={informationForm.formState.errors.state_code?.message}>
            {STATES.map(([code, name]) => (
              <option key={code} value={code}>{code} · {name}</option>
            ))}
          </SelectField>
          <TextField label="GSTIN" optional {...informationForm.register("gstin")} error={informationForm.formState.errors.gstin?.message} />
          {actionError ? <p className="text-sm text-rose-700">{actionError}</p> : null}
          <div className="flex items-center justify-between">
            <button type="button" className="text-sm font-semibold text-slate-700 dark:text-slate-300" onClick={() => { setEditing(null); setLocal(progress.steps.billing_profile_completed ? "review" : null); }}>Back</button>
            <Button type="submit" className="rounded-lg px-5 py-2.5" disabled={saveInformation.isPending}>{saveInformation.isPending ? "Saving" : "Continue"}</Button>
          </div>
        </form>
      </OnboardingShell>
    );
  }

  if (phase === "review" && progress.company) {
    const billing = progress.billing_profile;
    const address = billing ? [billing.address_line1, billing.address_line2, billing.city, stateName(billing.state_code), billing.postal_code].filter(Boolean).join(", ") : "Not provided";
    return (
      <OnboardingShell {...shell} title="Review your company" description="Confirm the details below. Next, you'll choose modules and we'll open your workspace.">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 sm:p-8">
          <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-800 text-sm font-semibold text-white">
              {progress.company.display_name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">{progress.company.legal_name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">pulse.app/{progress.company.slug}</p>
            </div>
          </div>
          <div className="divide-y divide-slate-200">
            <ReviewRow label="Company name" value={progress.company.legal_name} onEdit={() => setEditing("company")} />
            <ReviewRow label="Workspace" value={`${progress.company.display_name} · pulse.app/${progress.company.slug}`} onEdit={() => setEditing("company")} />
            <ReviewRow label="Timezone" value={timezoneLabel(progress.company.timezone)} onEdit={() => setEditing("information")} />
            <ReviewRow label="Billing name" value={billing?.billing_name ?? ""} onEdit={() => setEditing("information")} />
            <ReviewRow label="Billing email" value={billing?.billing_email ?? ""} onEdit={() => setEditing("information")} />
            <ReviewRow label="Address" value={address} onEdit={() => setEditing("information")} />
            <ReviewRow label="GSTIN" value={billing?.gstin || "Not provided"} onEdit={() => setEditing("information")} />
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button type="button" className="text-sm font-semibold text-slate-700 dark:text-slate-300" onClick={() => setEditing("information")}>Back</button>
            <Button type="button" className="rounded-lg px-5 py-2.5" onClick={() => { setEditing(null); setLocal("modules"); }}>Continue</Button>
          </div>
        </section>
      </OnboardingShell>
    );
  }

  if (phase === "modules") {
    const planUnavailable = !plans.isLoading && !catalogPlan;
    return (
      <OnboardingShell {...shell} wide heading={!moduleFocus} title="Choose your modules" description="Modules are optional. Start the trial anytime — you can add modules later.">
        <ModuleStep
          onFocusChange={setModuleFocus}
          selected={selectedModules}
          onChange={(slugs) => {
            setSelectedModules(slugs);
            if (progress.company_id) {
              sessionStorage.setItem(`pulse-modules:${progress.company_id}`, JSON.stringify(slugs));
            }
          }}
          onBack={() => setLocal("review")}
          onContinue={() => {
            if (catalogPlan) {
              selectPlan.mutate(catalogPlan.code);
            }
          }}
          continuing={selectPlan.isPending}
          continueDisabled={!catalogPlan || plans.isLoading}
          error={
            actionError
            ?? (planUnavailable ? "The trial plan is not available yet. Refresh the page or contact support." : null)
          }
        />
      </OnboardingShell>
    );
  }

  if (phase === "creating") {
    return (
      <OnboardingShell {...shell} title="Creating your workspace" description={`Setting up ${progress.company?.display_name ?? "your company"}. This takes a few seconds.`}>
        <CreatingWorkspace onDone={finishCreating} />
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell {...shell} title="Your company workspace is ready." description="The trial is active.">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-10 text-center sm:px-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-teal-800 text-white">
          <svg viewBox="0 0 20 20" className="h-7 w-7" fill="none" aria-hidden="true">
            <path d="M5 10.5l3.2 3.2L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="mx-auto mt-8 max-w-md divide-y divide-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 text-left text-sm">
          <div className="flex justify-between px-4 py-3"><span className="text-slate-500 dark:text-slate-400">Company</span><span className="font-medium text-slate-900 dark:text-slate-100">{progress.company?.legal_name}</span></div>
          <div className="flex justify-between px-4 py-3"><span className="text-slate-500 dark:text-slate-400">Workspace URL</span><span className="font-medium text-slate-900 dark:text-slate-100">pulse.app/{progress.company?.slug}</span></div>
          <div className="flex justify-between px-4 py-3"><span className="text-slate-500 dark:text-slate-400">Plan</span><span className="font-medium text-slate-900 dark:text-slate-100">{progress.subscription?.plan_name ?? "Plan"}{progress.subscription?.trial_ends_at ? ` · Trial until ${new Date(progress.subscription.trial_ends_at).toLocaleDateString()}` : ""}</span></div>
          <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500 dark:text-slate-400">Modules</span><span className="text-right font-medium text-slate-900 dark:text-slate-100">{progress.installed_modules?.length ? progress.installed_modules.join(", ") : "Core workspace"}</span></div>
          <div className="flex justify-between px-4 py-3"><span className="text-slate-500 dark:text-slate-400">Access</span><span className="font-medium text-slate-900 dark:text-slate-100">{accessLabel(progress.access_mode)}</span></div>
        </div>
        <Button type="button" className="mt-8 rounded-lg px-5 py-2.5" onClick={() => { window.location.assign("/app"); }}>Open company dashboard</Button>
      </section>
    </OnboardingShell>
  );
}

function firstApiError(...errors: unknown[]) {
  const error = errors.find((item) => item instanceof ApiError);
  return error instanceof ApiError ? error.message : null;
}

function accessLabel(mode: string) {
  if (mode === "full") {
    return "Full access";
  }
  if (mode === "onboarding_only") {
    return "Onboarding";
  }
  if (mode === "billing_only") {
    return "Billing";
  }
  if (mode === "grace") {
    return "Grace period";
  }
  if (mode === "blocked") {
    return "Blocked";
  }
  return mode;
}
