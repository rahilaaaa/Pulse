
import { useAuth } from "../contexts/AuthContext";

export default function DashboardPage() {
  const { user, activeCompany } = useAuth();

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back, {user?.first_name || user?.email}.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <article className="dashboard-card">
          <span>Workspace</span>
          <h2>{activeCompany?.name || "No company selected"}</h2>
          <p>
            {activeCompany
              ? `Your role: ${activeCompany.role}`
              : "Select a company to continue."}
          </p>
        </article>

        <article className="dashboard-card">
          <span>Account</span>
          <h2>{user?.email}</h2>
          <p>Email verified</p>
        </article>
      </div>
    </section>
  );
}