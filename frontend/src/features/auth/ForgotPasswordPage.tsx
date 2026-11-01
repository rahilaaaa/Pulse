import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { api, ApiError } from "../../shared/api/client";
import { AuthCard, AuthFrame } from "../../shared/ui/AuthFrame";
import { Button } from "../../shared/ui/Button";
import { TextField } from "../../shared/ui/Fields";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
});

type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const requestReset = useMutation({
    mutationFn: (values: FormValues) =>
      api("/api/v1/auth/password-resets/", { method: "POST", body: JSON.stringify(values) }),
  });
  const error = requestReset.error instanceof ApiError
    ? requestReset.error.details.find((detail) => detail.field === "email")?.message || requestReset.error.message
    : requestReset.error
      ? "The reset request did not reach the server. Try again."
      : null;

  return (
    <AuthFrame>
      <AuthCard
        title={requestReset.isSuccess ? "Check your email" : "Reset your password"}
        description={requestReset.isSuccess ? "If that email has a Pulse account, a reset link is on its way." : "Enter the email you used to register."}
      >
        {requestReset.isSuccess ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-teal-50 dark:bg-teal-950 px-4 py-3 text-sm text-teal-900 dark:text-teal-100">
              The link expires in one hour and works once. If nothing arrives, check the spelling and request it again.
            </p>
            <Link to="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-teal-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-900">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => requestReset.mutate(values))} noValidate>
            <TextField label="Email" required type="email" autoComplete="username" {...form.register("email")} error={form.formState.errors.email?.message} />
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            <Button type="submit" className="w-full rounded-lg py-2.5" disabled={requestReset.isPending}>
              {requestReset.isPending ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-sm text-slate-600 dark:text-slate-300">
              <Link className="font-medium text-teal-800" to="/login">Back to Sign In</Link>
            </p>
          </form>
        )}
      </AuthCard>
    </AuthFrame>
  );
}
