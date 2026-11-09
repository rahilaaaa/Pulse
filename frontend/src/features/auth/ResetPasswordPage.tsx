import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { api, ApiError } from "../../shared/api/client";
import { AuthCard, AuthFrame } from "../../shared/ui/AuthFrame";
import { Button } from "../../shared/ui/Button";
import { PasswordField } from "../../shared/ui/Fields";

const schema = z
  .object({
    password: z.string().min(6, "Use at least 6 characters."),
    confirm_password: z.string().min(1, "Confirm the password."),
  })
  .refine((values) => values.password === values.confirm_password, {
    path: ["confirm_password"],
    message: "Enter the same password.",
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm_password: "" } });
  const password = form.watch("password");
  const rules = [
    ["At least 6 characters", password.length >= 6],
    ["Not made only of numbers", password.length > 0 && !/^\d+$/.test(password)],
  ] as const;
  const confirm = useMutation({
    mutationFn: (values: FormValues) =>
      api("/api/v1/auth/password-resets/confirm/", {
        method: "POST",
        body: JSON.stringify({ token, password: values.password }),
      }),
    onError: (error) => {
      if (error instanceof ApiError) {
        const detail = error.details.find((item) => item.field === "password");
        if (detail) {
          form.setError("password", { message: detail.message });
        }
      }
    },
  });
  const tokenError = confirm.error instanceof ApiError
    ? confirm.error.details.find((detail) => detail.field === "token")?.message
    : null;

  return (
    <AuthFrame>
      <AuthCard
        title={confirm.isSuccess ? "Password updated" : "Choose a new password"}
        description={confirm.isSuccess ? "Sign in with the new password." : "This link works once."}
      >
        {confirm.isSuccess ? (
          <Link to="/login?reset=1" className="inline-flex w-full items-center justify-center rounded-lg bg-teal-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-900">
            Continue to Sign In
          </Link>
        ) : (
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => confirm.mutate(values))} noValidate>
            {!token ? <p className="text-sm text-rose-700">This page needs the token from the reset email.</p> : null}
            <PasswordField label="New password" required autoComplete="new-password" placeholder="Enter a new password" {...form.register("password")} error={form.formState.errors.password?.message} />
            <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
              {rules.map(([label, met]) => (
                <li key={label} className={met ? "text-teal-800" : undefined}>{met ? "✓" : "•"} {label}</li>
              ))}
            </ul>
            <PasswordField label="Confirm password" required autoComplete="new-password" placeholder="Enter the same password" {...form.register("confirm_password")} error={form.formState.errors.confirm_password?.message} />
            {tokenError ? <p className="text-sm text-rose-700">{tokenError}</p> : null}
            <Button type="submit" className="w-full rounded-lg py-2.5" disabled={!token || confirm.isPending}>
              {confirm.isPending ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}
      </AuthCard>
    </AuthFrame>
  );
}
