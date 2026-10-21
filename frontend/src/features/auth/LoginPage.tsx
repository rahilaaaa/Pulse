import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { api, ApiError } from "../../shared/api/client";
import type { CurrentUser, MfaChallenge } from "../../shared/api/types";
import { AuthCard, AuthFrame } from "../../shared/ui/AuthFrame";
import { Button } from "../../shared/ui/Button";
import { PasswordField, TextField } from "../../shared/ui/Fields";
import { LoadingState } from "../../shared/ui/States";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter a password."),
});

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
});

type CredentialValues = z.infer<typeof credentialsSchema>;
type CodeValues = z.infer<typeof codeSchema>;
type SignInResult = CurrentUser | MfaChallenge;

function isOperator(value: SignInResult): value is CurrentUser {
  return "platform_permissions" in value;
}

function qrMarkup(svg: string | undefined): string | null {
  if (!svg) {
    return null;
  }
  const trimmed = svg.trim();
  if (!trimmed.startsWith("<svg") || trimmed.toLowerCase().includes("<script")) {
    return null;
  }
  return trimmed;
}

export function LoginPage() {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const current = useQuery({
    queryKey: ["me"],
    queryFn: () => api<CurrentUser>("/api/v1/auth/me/"),
    retry: false,
  });
  const credentials = useForm<CredentialValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });
  const codeForm = useForm<CodeValues>({ resolver: zodResolver(codeSchema), defaultValues: { code: "" } });

  function accept(result: SignInResult) {
    if (!isOperator(result)) {
      setChallenge(result);
      codeForm.reset({ code: "" });
      return;
    }
    setChallenge(null);
    queryClient.setQueryData(["me"], result);
  }

  const login = useMutation({
    mutationFn: (values: CredentialValues) =>
      api<SignInResult>("/api/v1/auth/login/", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: accept,
  });
  const confirm = useMutation({
    mutationFn: (values: CodeValues) =>
      api<CurrentUser>("/api/v1/auth/mfa/", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: (user) => accept(user),
  });

  if (current.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="Checking your session" />
      </main>
    );
  }
  if (current.data?.platform_permissions.includes("platform.companies.view")) {
    return <Navigate to="/platform" replace />;
  }
  if (current.data && current.data.platform_permissions.length === 0) {
    return <Navigate to="/" replace />;
  }

  const error = (login.error ?? confirm.error) instanceof ApiError
    ? (login.error ?? confirm.error)?.message
    : login.error || confirm.error
      ? "Sign-in failed."
      : null;
  const markup = qrMarkup(challenge?.qr_svg);
  const verified = params.get("verified") === "1";

  return (
    <AuthFrame>
      <AuthCard title="Sign in to Pulse" description="Use the email you registered with.">
        {verified ? (
          <p className="mb-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Email verified. Sign in to continue.</p>
        ) : null}
        {challenge ? (
          <form className="space-y-4" onSubmit={codeForm.handleSubmit((values) => confirm.mutate(values))} noValidate>
            <h2 className="text-lg font-semibold text-slate-900">
              {challenge.step === "enroll" ? "Set up your authenticator" : "Enter your authenticator code"}
            </h2>
            {challenge.step === "enroll" ? (
              <>
                <p className="text-sm text-slate-600">
                  Add Pulse to an authenticator app, then enter the current 6-digit code. This secret is shown only while you enroll.
                </p>
                {markup ? <div className="mx-auto w-48" dangerouslySetInnerHTML={{ __html: markup }} /> : null}
                {challenge.secret ? (
                  <p className="break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm text-slate-800">{challenge.secret}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-600">Open the authenticator app you enrolled and enter the current code.</p>
            )}
            <TextField
              label="Authentication code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              {...codeForm.register("code")}
              error={codeForm.formState.errors.code?.message}
            />
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            <Button type="submit" className="w-full rounded-lg py-2.5" disabled={confirm.isPending}>
              {confirm.isPending ? "Checking code" : "Continue"}
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={credentials.handleSubmit((values) => login.mutate(values))} noValidate>
            <TextField label="Email" required type="email" autoComplete="username" {...credentials.register("email")} error={credentials.formState.errors.email?.message} />
            <PasswordField label="Password" required autoComplete="current-password" placeholder="Enter your password" {...credentials.register("password")} error={credentials.formState.errors.password?.message} />
            <p className="text-right text-sm">
              <Link className="font-medium text-teal-800" to="/forgot-password">Forgot password?</Link>
            </p>
            {params.get("reset") === "1" ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Password updated. Sign in with the new password.</p>
            ) : null}
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            <Button type="submit" className="w-full rounded-lg py-2.5" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign In"}
            </Button>
            <p className="text-center text-sm text-slate-600">
              New to Pulse?{" "}
              <Link className="font-medium text-teal-800" to="/register">
                Create an account
              </Link>
            </p>
          </form>
        )}
      </AuthCard>
    </AuthFrame>
  );
}
