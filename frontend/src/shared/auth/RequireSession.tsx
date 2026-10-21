import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import { api } from "../api/client";
import type { CurrentUser } from "../api/types";
import { LoadingState } from "../ui/States";

export function RequireSession() {
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
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
