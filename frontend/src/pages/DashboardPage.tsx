import { useEffect, useState } from "react";

import { getCompanyModules } from "../api/companyModules";
import { useAuth } from "../contexts/AuthContext";
import type { CompanyModule } from "../types/companyModules";

const moduleNames: Record<string, string> = {
  hrms: "Human Resource Management",
  project_management: "Project Management",
};

export default function DashboardPage() {
  const { user, activeCompany } = useAuth();

  const [modules, setModules] = useState<CompanyModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    getCompanyModules()
      .then((data) => {
        if (mounted) setModules(data);
      })
      .catch(() => {
        if (mounted) setError("Unable to load installed modules.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeCompany?.id]);

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

      <div className="page-heading">
        <div>
          <h2>Your modules</h2>
          <p>Modules enabled for this company.</p>
        </div>
      </div>

      {loading && <p>Loading modules...</p>}
      {error && <p className="error-message">{error}</p>}

      {!loading && !error && modules.length === 0 && (
        <article className="dashboard-card">
          <h3>No modules installed</h3>
          <p>
            Your company has not enabled any modules yet.
          </p>
        </article>
      )}

      {!loading && !error && modules.length > 0 && (
        <div className="dashboard-grid">
          {modules.map((module) => (
            <article className="dashboard-card" key={module.module_key}>
              <span>Installed module</span>
              <h2>
                {moduleNames[module.module_key] ?? module.module_key}
              </h2>
              <p>Status: {module.status}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}