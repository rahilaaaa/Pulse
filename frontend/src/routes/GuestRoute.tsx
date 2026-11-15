
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function GuestRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <p>Restoring your session...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/companies" replace />;
  }

  return <Outlet />;
}