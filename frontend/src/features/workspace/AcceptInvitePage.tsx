import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, clearCsrfToken } from "../../shared/api/client";
import type { CurrentUser } from "../../shared/api/types";
import { AuthCard, AuthFrame } from "../../shared/ui/AuthFrame";
import { Button } from "../../shared/ui/Button";
import { PasswordField, TextField } from "../../shared/ui/Fields";
import { LoadingState } from "../../shared/ui/States";

type Preview = {
  email: string;
  company_display_name: string;
  account_exists: boolean;
};

type JoinResult = CurrentUser & { company_id: string };

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");

  const preview = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => api<Preview>(`/api/v1/invitations/preview/?token=${encodeURIComponent(token)}`),
    enabled: Boolean(token),
    retry: false,
  });
  const current = useQuery({
    queryKey: ["me"],
    queryFn: () => api<CurrentUser>("/api/v1/auth/me/"),
    retry: false,
  });

  const logout = useMutation({
    mutationFn: () => api<void>("/api/v1/auth/logout/", { method: "POST" }),
    onSuccess: () => {
      clearCsrfToken();
      queryClient.setQueryData(["me"], null);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const join = useMutation({
    mutationFn: () =>
      api<JoinResult>("/api/v1/invitations/join/", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData(["me"], result);
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      navigate("/app", { replace: true });
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : "Could not join the company.");
    },
  });

  const accept = useMutation({
    mutationFn: () => api<{ company_id: string }>("/api/v1/invitations/accept/", { method: "POST", body: JSON.stringify({ token }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      navigate("/app", { replace: true });
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : "Could not accept the invitation.");
    },
  });

  if (!token) {
    return (
      <AuthFrame>
        <AuthCard title="Invitation link missing" description="Open the link from your invitation email.">
          <Link className="text-sm font-medium text-teal-800" to="/login">Sign in</Link>
        </AuthCard>
      </AuthFrame>
    );
  }

  if (preview.isLoading || current.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="Checking invitation" />
      </main>
    );
  }

  if (preview.error) {
    return (
      <AuthFrame>
        <AuthCard title="Invitation unavailable" description={preview.error instanceof ApiError ? preview.error.message : "This invitation link is not valid."}>
          <Link className="text-sm font-medium text-teal-800" to="/login">Sign in</Link>
        </AuthCard>
      </AuthFrame>
    );
  }

  const invitedEmail = preview.data!.email;
  const companyName = preview.data!.company_display_name;
  const signedIn = current.data;
  const matchingSession = signedIn?.email === invitedEmail;
  const accountExists = preview.data!.account_exists;

  if (signedIn && !matchingSession) {
    return (
      <AuthFrame>
        <AuthCard title={`Join ${companyName}`} description={`This invitation is for ${invitedEmail}. You are signed in as ${signedIn.email}.`}>
          <div className="space-y-3">
            <Button type="button" className="w-full" disabled={logout.isPending} onClick={() => logout.mutate()}>
              {logout.isPending ? "Signing out…" : "Sign out and continue"}
            </Button>
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              Or <Link className="font-medium text-teal-800" to="/app">go to your workspace</Link>
            </p>
          </div>
        </AuthCard>
      </AuthFrame>
    );
  }

  if (matchingSession) {
    return (
      <AuthFrame>
        <AuthCard title={`Join ${companyName}`} description={`Continue as ${invitedEmail} to enter the company dashboard.`}>
          <div className="space-y-3">
            {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
            <Button type="button" className="w-full" disabled={accept.isPending} onClick={() => { setFormError(""); accept.mutate(); }}>
              {accept.isPending ? "Joining…" : "Enter company dashboard"}
            </Button>
          </div>
        </AuthCard>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <AuthCard
        title={`Join ${companyName}`}
        description={
          accountExists
            ? `${invitedEmail} already has a Pulse account. Enter that password to join ${companyName}.`
            : `Create your Pulse account for ${invitedEmail} to join this company.`
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFormError("");
            if (password.length < 6) {
              setFormError("Use at least 6 characters.");
              return;
            }
            join.mutate();
          }}
          noValidate
        >
          <TextField label="Email" value={invitedEmail} readOnly />
          <PasswordField
            label={accountExists ? "Password" : "Create password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={accountExists ? "current-password" : "new-password"}
            required
          />
          {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
          <Button type="submit" className="w-full rounded-lg py-2.5" disabled={join.isPending}>
            {join.isPending ? "Joining…" : "Join company"}
          </Button>
          {accountExists ? (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              Forgot your password?{" "}
              <Link className="font-medium text-teal-800" to="/forgot-password">
                Reset it
              </Link>
            </p>
          ) : null}
        </form>
      </AuthCard>
    </AuthFrame>
  );
}
