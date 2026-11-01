import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { api, ApiError } from "../../shared/api/client";
import type { CurrentUser } from "../../shared/api/types";
import { AuthCard, AuthFrame } from "../../shared/ui/AuthFrame";
import { Button } from "../../shared/ui/Button";
import { PasswordField, TextField } from "../../shared/ui/Fields";
import { LoadingState } from "../../shared/ui/States";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter a password."),
});

type CredentialValues = z.infer<typeof credentialsSchema>;

export function LoginPage() {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const current = useQuery({
    queryKey: ["me"],
    queryFn: () => api<CurrentUser>("/api/v1/auth/me/"),
    retry: false,
  });
  const credentials = useForm<CredentialValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (values: CredentialValues) =>
      api<CurrentUser>("/api/v1/auth/login/", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: (user) => {
      queryClient.setQueryData(["me"], user);
    },
  });

  if (current.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="Checking your session" />
      </main>
    );
  }
  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  if (current.data?.platform_permissions.includes("platform.companies.view")) {
    return <Navigate to={safeNext ?? "/platform"} replace />;
  }
  if (current.data && current.data.platform_permissions.length === 0) {
    return <Navigate to={safeNext ?? "/"} replace />;
  }

  const error = login.error instanceof ApiError
    ? login.error.message
    : login.error
      ? "Sign-in failed."
      : null;
  const verified = params.get("verified") === "1";

  return (
    <AuthFrame>
      <AuthCard title="Sign in to Pulse" description="Use the email you registered with.">
        {verified ? (
          <p className="mb-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Email verified. Sign in to continue.</p>
        ) : null}
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
          <p className="text-center text-sm text-slate-600 dark:text-slate-300">
            New to Pulse?{" "}
            <Link className="font-medium text-teal-800" to="/register">
              Create an account
            </Link>
          </p>
        </form>
      </AuthCard>
    </AuthFrame>
  );
}
