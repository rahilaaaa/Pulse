import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { AuthCard, AuthFrame } from "../../shared/ui/AuthFrame";
import { Button } from "../../shared/ui/Button";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [done, setDone] = useState(false);
  const confirm = useMutation({
    mutationFn: () => api("/api/v1/auth/email-verifications/confirm/", { method: "POST", body: JSON.stringify({ token }) }),
    onSuccess: () => setDone(true),
  });
  const error = confirm.error instanceof ApiError
    ? confirm.error.details[0]?.message || confirm.error.message
    : confirm.error
      ? "The verification request did not reach the server. Try the button again."
      : null;

  return (
    <AuthFrame>
      <AuthCard
        title={done ? "Email verified" : "Verify your email"}
        description={done ? "Your email is verified. Sign in to create your company." : "Confirm this link to allow company creation."}
      >
        {done ? (
          <Link to="/login?verified=1" className="inline-flex w-full items-center justify-center rounded-lg bg-teal-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-900">
            Continue to Sign In
          </Link>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900">
              <p className="font-semibold">Waiting for verification</p>
              <p className="mt-1 text-teal-800">This page confirms the link from your email.</p>
            </div>
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            <Button type="button" className="w-full rounded-lg py-2.5" disabled={!token || confirm.isPending} onClick={() => confirm.mutate()}>
              {confirm.isPending ? "Verifying" : "Verify email"}
            </Button>
            {!token ? <p className="text-sm text-slate-600">This page needs the token from the verification link.</p> : null}
          </div>
        )}
      </AuthCard>
    </AuthFrame>
  );
}
