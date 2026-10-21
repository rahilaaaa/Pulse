import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const accept = useMutation({
    mutationFn: () => api("/api/v1/invitations/accept/", { method: "POST", body: JSON.stringify({ token }) }),
    onSuccess: () => navigate("/app", { replace: true }),
  });
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">Accept invitation</h1>
      <p className="mt-2 text-sm text-slate-600">Use the account that received this invitation. The email must match.</p>
      <Button className="mt-6" type="button" disabled={!token || accept.isPending} onClick={() => accept.mutate()}>Accept</Button>
      {accept.error instanceof ApiError ? <p className="mt-3 text-sm text-rose-700">{accept.error.message}</p> : null}
    </main>
  );
}
