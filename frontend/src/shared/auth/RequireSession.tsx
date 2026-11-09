import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import type { CurrentUser } from "../api/types";
import { LoadingState } from "../ui/States";

export function RequireSession() {
  const location = useLocation();
  const current = useQuery({
    queryKey: ["me"],
    queryFn: () => api<CurrentUser>("/api/v1/auth/me/"),
    retry: false,
  });

  if (current.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="Checking your session" />
      </main>
    );
  }
  if (!current.data) {
    const next = `${location.pathname}${location.search}`;
    const target = next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
