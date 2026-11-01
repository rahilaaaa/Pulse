import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import type { CurrentUser } from "../api/types";
import { LoadingState } from "../ui/States";

type OnboardingStep = { current_step: string };

export function HomeRedirect() {
  const current = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/v1/auth/me/"), retry: false });
  if (current.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="Checking your session" />
      </main>
    );
  }
  if (!current.data) {
    return <Navigate to="/welcome" replace />;
  }
  if (current.data.platform_permissions.includes("platform.companies.view")) {
    return <Navigate to="/platform" replace />;
  }
  if (current.data.memberships.length > 0) {
    return <Navigate to="/app" replace />;
  }
  return <CompanyHome />;
}

function CompanyHome() {
  const onboarding = useQuery({ queryKey: ["onboarding"], queryFn: () => api<OnboardingStep>("/api/v1/onboarding/"), retry: false });
  if (onboarding.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="Checking your session" />
      </main>
    );
  }
  if (onboarding.data?.current_step === "workspace" || onboarding.data?.current_step === "done") {
    return <Navigate to="/app" replace />;
  }
  return <Navigate to="/onboarding" replace />;
}
