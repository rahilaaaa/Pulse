
import { useCallback, useEffect, useState } from "react";

import {
  getAvailableModules,
  getCompanyModules,
  installCompanyModule,
  uninstallCompanyModule,
} from "../api/companyModules";

import type {
  AvailableModule,
  CompanyModule,
  ModuleKey,
} from "../types/companyModules";

export default function ModulesPage() {
  const [availableModules, setAvailableModules] = useState<AvailableModule[]>([]);
  const [installedModules, setInstalledModules] = useState<CompanyModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingModule, setProcessingModule] = useState<ModuleKey | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadModules = useCallback(async () => {
    try {
      setError("");

      const [available, installed] = await Promise.all([
        getAvailableModules(),
        getCompanyModules(),
      ]);

      setAvailableModules(available);
      setInstalledModules(installed);
    } catch {
      setError("Unable to load modules. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  const isInstalled = (moduleKey: ModuleKey) =>
    installedModules.some(
      (module) =>
        module.module_key === moduleKey &&
        module.status === "installed",
    );

  const handleInstall = async (moduleKey: ModuleKey) => {
    try {
      setProcessingModule(moduleKey);
      setError("");
      setSuccess("");

      await installCompanyModule(moduleKey);

      setSuccess("Module installed successfully.");
      await loadModules();
    } catch {
      setError("Unable to install this module.");
    } finally {
      setProcessingModule(null);
    }
  };

  const handleUninstall = async (moduleKey: ModuleKey) => {
    const confirmed = window.confirm(
      "Are you sure you want to uninstall this module? Your existing module data will be preserved.",
    );

    if (!confirmed) return;

    try {
      setProcessingModule(moduleKey);
      setError("");
      setSuccess("");

      await uninstallCompanyModule(moduleKey);

      setSuccess("Module uninstalled successfully.");
      await loadModules();
    } catch {
      setError("Unable to uninstall this module.");
    } finally {
      setProcessingModule(null);
    }
  };

  if (loading) {
    return <p>Loading modules...</p>;
  }

  return (
    <section className="modules-page">
      <div className="page-heading">
        <div>
          <h1>Modules</h1>
          <p>Manage the modules available in your company workspace.</p>
        </div>
      </div>

      {error && <div className="message error-message">{error}</div>}
      {success && <div className="message success-message">{success}</div>}

      <div className="modules-grid">
        {availableModules.map((module) => {
          const installed = isInstalled(module.key);
          const processing = processingModule === module.key;

          return (
            <article className="module-card" key={module.key}>
              <div className="module-card-header">
                <div>
                  <h2>{module.name}</h2>
                  <span className="module-version">
                    Version {module.version}
                  </span>
                </div>

                <span
                  className={`module-status ${
                    installed ? "installed" : "not-installed"
                  }`}
                >
                  {installed ? "Installed" : "Not installed"}
                </span>
              </div>

              <p>{module.description}</p>

              <div className="module-card-footer">
                {installed ? (
                  <button
                    type="button"
                    className="module-button secondary"
                    disabled={processing}
                    onClick={() => void handleUninstall(module.key)}
                  >
                    {processing ? "Processing..." : "Uninstall"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="module-button primary"
                    disabled={processing}
                    onClick={() => void handleInstall(module.key)}
                  >
                    {processing ? "Installing..." : "Install module"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {availableModules.length === 0 && (
        <p>No modules are currently available.</p>
      )}
    </section>
  );
}
