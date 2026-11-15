
import { useCallback, useEffect, useState } from "react";

import {
  getAvailableModules,
  getCompanyModules,
  installCompanyModule,
  uninstallCompanyModule,
} from "../api/companyModules";

import ConfirmDialog from "../components/ConfirmDialog";

import type {
  AvailableModule,
  CompanyModule,
  ModuleKey,
} from "../types/companyModules";

export default function ModulesPage() {
  const [availableModules, setAvailableModules] = useState<AvailableModule[]>([]);
  const [installedModules, setInstalledModules] = useState<CompanyModule[]>([]);

  const [loading, setLoading] = useState(true);

  const [processingModule, setProcessingModule] = useState<ModuleKey | null>(
    null,
  );

  const [processingAction, setProcessingAction] = useState<
    "install" | "uninstall" | null
  >(null);

  const [selectedModule, setSelectedModule] = useState<ModuleKey | null>(
    null,
  );

  const [showUninstallDialog, setShowUninstallDialog] = useState(false);

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
    if (processingModule !== null) return;

    try {
      setProcessingModule(moduleKey);
      setProcessingAction("install");
      setError("");
      setSuccess("");

      await installCompanyModule(moduleKey);

      await loadModules();

      setSuccess("Module installed successfully.");
    } catch {
      setError("Unable to install this module. Please try again.");
    } finally {
      setProcessingModule(null);
      setProcessingAction(null);
    }
  };

  // Open the custom confirmation modal.
  const handleUninstallClick = (moduleKey: ModuleKey) => {
    if (processingModule !== null) return;

    setSelectedModule(moduleKey);
    setShowUninstallDialog(true);
    setError("");
    setSuccess("");
  };

  // Execute uninstall only after explicit confirmation.
  const handleConfirmUninstall = async () => {
    if (!selectedModule || processingModule !== null) return;

    const moduleKey = selectedModule;

    try {
      setProcessingModule(moduleKey);
      setProcessingAction("uninstall");
      setError("");
      setSuccess("");

      await uninstallCompanyModule(moduleKey);

      await loadModules();

      setSuccess("Module uninstalled successfully.");

      setShowUninstallDialog(false);
      setSelectedModule(null);
    } catch {
      setError("Unable to uninstall this module. Please try again.");

      setShowUninstallDialog(false);
      setSelectedModule(null);
    } finally {
      setProcessingModule(null);
      setProcessingAction(null);
    }
  };

  const handleCancelUninstall = () => {
    if (processingModule !== null) return;

    setShowUninstallDialog(false);
    setSelectedModule(null);
  };

  const selectedModuleName =
    availableModules.find((module) => module.key === selectedModule)?.name ??
    selectedModule;

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" />
        <p>Loading modules...</p>
      </div>
    );
  }

  return (
    <section className="modules-page">
      <div className="page-heading">
        <div>
          <h1>Modules</h1>
          <p>Manage the modules available in your company workspace.</p>
        </div>
      </div>

      {error && (
        <div className="message error-message" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="message success-message" role="status">
          {success}
        </div>
      )}

      <div className="modules-grid">
        {availableModules.map((module) => {
          const installed = isInstalled(module.key);
          const processing = processingModule === module.key;

          const installing =
            processing && processingAction === "install";

          const uninstalling =
            processing && processingAction === "uninstall";

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
                    installed
                      ? "installed"
                      : installing
                        ? "installing"
                        : "not-installed"
                  }`}
                >
                  {installed
                    ? "Installed"
                    : installing
                      ? "Installing"
                      : "Not installed"}
                </span>
              </div>

              <p>{module.description}</p>

              {installing ? (
                <div
                  className="module-installing-panel"
                  role="status"
                  aria-live="polite"
                >
                  <div className="module-installing-header">
                    <span className="module-installing-icon">
                      <span className="module-installing-symbol">▣</span>
                    </span>

                    <div className="module-installing-content">
                      <strong>{module.name}</strong>
                      <span>Module installation in progress</span>
                    </div>

                    <span className="module-installing-spinner" />
                  </div>

                  <div className="module-installing-divider" />

                  <div className="module-installing-message">
                    <span className="module-clock-icon">◷</span>
                    <span>
                      Please wait while we set up your module.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="module-card-footer">
                  {installed ? (
                    <button
                      type="button"
                      className="module-button secondary"
                      disabled={processingModule !== null}
                      onClick={() => handleUninstallClick(module.key)}
                    >
                      {uninstalling ? "Uninstalling..." : "Uninstall"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="module-button primary"
                      disabled={processingModule !== null}
                      onClick={() => void handleInstall(module.key)}
                    >
                      Install module
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {availableModules.length === 0 && (
        <p>No modules are currently available.</p>
      )}

      <ConfirmDialog
        open={showUninstallDialog}
        title={`Uninstall ${selectedModuleName ?? "module"}?`}
        message="Are you sure you want to uninstall this module? Your existing module data will be preserved."
        confirmText="Uninstall module"
        cancelText="Cancel"
        loading={processingAction === "uninstall"}
        onConfirm={() => void handleConfirmUninstall()}
        onCancel={handleCancelUninstall}
      />
    </section>
  );
}
