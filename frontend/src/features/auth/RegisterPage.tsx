import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { api, ApiError } from "../../shared/api/client";
import { AuthCard, AuthFrame } from "../../shared/ui/AuthFrame";
import { Button } from "../../shared/ui/Button";
import { PasswordField, TextField } from "../../shared/ui/Fields";
import { maskEmail } from "./email";

const schema = z
  .object({
    full_name: z.string().trim().min(1, "Enter your full name."),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(6, "Use at least 6 characters."),
    confirm_password: z.string().min(1, "Confirm the password."),
    accept_terms: z.boolean().refine((value) => value, { message: "Accept the terms to continue." }),
  })
  .refine((values) => values.password === values.confirm_password, {
    path: ["confirm_password"],
    message: "Enter the same password.",
  })
  .refine((values) => values.full_name.trim().split(/\s+/).length >= 2, {
    path: ["full_name"],
    message: "Enter a first and last name.",
  });

type FormValues = z.infer<typeof schema>;

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { first_name: parts[0] ?? "", last_name: parts.slice(1).join(" ") };
}

export function RegisterPage() {
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", password: "", confirm_password: "", accept_terms: false },
  });
  const password = form.watch("password");
  const rules = [
    ["At least 6 characters", password.length >= 6],
    ["Not made only of numbers", password.length > 0 && !/^\d+$/.test(password)],
  ] as const;
  const register = useMutation({
    mutationFn: (values: FormValues) => {
      const name = splitName(values.full_name);
      return api("/api/v1/auth/register/", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          first_name: name.first_name,
          last_name: name.last_name,
        }),
      });
    },
    onSuccess: (_result, values) => setCreatedEmail(values.email),
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        return;
      }
      for (const detail of error.details) {
        if (detail.field === "password" || detail.field === "email") {
          form.setError(detail.field, { message: detail.message });
        }
        if (detail.field === "first_name" || detail.field === "last_name") {
          form.setError("full_name", { message: detail.message });
        }
      }
    },
  });
  const apiDetails = register.error instanceof ApiError ? register.error.details : [];
  const messageFor = (field: "email" | "password") => apiDetails.find((detail) => detail.field === field)?.message;
  const error = register.error instanceof ApiError
    ? apiDetails.filter((detail) => !detail.field || detail.field === "first_name" || detail.field === "last_name").map((detail) => detail.field ? "" : detail.message).filter(Boolean).join(" ") || (apiDetails.length === 0 ? register.error.message : "")
    : register.error
      ? "Registration failed."
      : null;
  const accepted = form.watch("accept_terms") === true;

  return (
    <AuthFrame>
      {createdEmail ? (
        <AuthCard title="Verify your email" description={<>We sent a verification link to <span className="font-medium text-slate-700 dark:text-slate-300">{maskEmail(createdEmail)}</span>.</>}>
          <div className="rounded-xl bg-teal-50 dark:bg-teal-950 px-4 py-3 text-sm text-teal-900 dark:text-teal-100">
            <p className="font-semibold">Waiting for verification</p>
            <p className="mt-1 text-teal-800">Open the link in the email to verify your address. If Gmail is not configured, the same link is printed in the API server window.</p>
          </div>
          <Link to="/login" className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-teal-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-900">
            Go to sign in
          </Link>
          <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-300">
            Wrong address? <Link className="font-medium text-teal-800" to="/register" onClick={() => setCreatedEmail(null)}>Change email</Link>
          </p>
        </AuthCard>
      ) : (
        <AuthCard title="Create your account" description="You'll create your company workspace next.">
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => register.mutate(values))} noValidate>
            <TextField label="Full name" required autoComplete="name" {...form.register("full_name")} error={form.formState.errors.full_name?.message} />
            <TextField label="Work email" required type="email" autoComplete="username" {...form.register("email")} error={form.formState.errors.email?.message ?? messageFor("email")} />
            <PasswordField label="Password" required autoComplete="new-password" placeholder="Create a password" {...form.register("password")} error={form.formState.errors.password?.message ?? messageFor("password")} />
            <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
              {rules.map(([label, met]) => (
                <li key={label} className={met ? "text-teal-800" : ""}>
                  {label} <span className="text-slate-500 dark:text-slate-400">({met ? "met" : "not met"})</span>
                </li>
              ))}
            </ul>
            <PasswordField label="Confirm password" required autoComplete="new-password" {...form.register("confirm_password")} error={form.formState.errors.confirm_password?.message} />
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="mt-1 accent-teal-800" {...form.register("accept_terms")} />
              <span>
                I agree to the <Link className="font-medium text-teal-800" to="/terms">Terms</Link> and acknowledge the <Link className="font-medium text-teal-800" to="/privacy">Privacy</Link> notice.
              </span>
            </label>
            {form.formState.errors.accept_terms?.message ? <p className="text-sm text-rose-700">{form.formState.errors.accept_terms.message}</p> : null}
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            <Button type="submit" className="w-full rounded-lg py-2.5" disabled={register.isPending || !accepted}>
              {register.isPending ? "Creating account…" : "Create Account"}
            </Button>
            {!accepted ? <p className="text-center text-sm text-slate-500 dark:text-slate-400">Accept the terms to continue.</p> : null}
            <p className="text-center text-sm text-slate-600 dark:text-slate-300">
              Already have an account?{" "}
              <Link className="font-medium text-teal-800" to="/login">Sign in</Link>
            </p>
          </form>
        </AuthCard>
      )}
    </AuthFrame>
  );
}
