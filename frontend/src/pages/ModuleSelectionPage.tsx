
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { completeOnboarding } from "../api/companies";
import { useAuth } from "../contexts/AuthContext";
import type { ModuleKey } from "../types/companyModules";

const MIN_INSTALLATION_DISPLAY_MS = 5000;

const modules: {
  key: ModuleKey;
  name: string;
  description: string;
}[] = [
  {
    key: "hrms",
    name: "Human Resource Management",
    description: "Manage employees, attendance, leave, and HR operations.",
  },
  {
    key: "project_management",
    name: "Project Management",
    description: "Organize projects, tasks, team activities, and progress.",
  },
];

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function ModuleSelectionPage() {
  const navigate = useNavigate();
  const { activeCompany, refreshOnboardingStatus } = useAuth();

  const [selected, setSelected] = useState<ModuleKey[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleModule = (key: ModuleKey) => {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const submitOnboarding = async (moduleKeys: ModuleKey[]) => {
    if (submitting) return;

    setError("");
    setSubmitting(true);

    const startedAt = Date.now();

    const waitForMinimumDisplay = async () => {
      const elapsed = Date.now() - startedAt;
      const remaining = MIN_INSTALLATION_DISPLAY_MS - elapsed;

      if (remaining > 0) {
        await wait(remaining);
      }
    };

    let onboardingCompleted = false;

    try {
      await completeOnboarding({
        module_keys: moduleKeys,
      });

      onboardingCompleted = true;

      // Keep the installation status visible for at least 5 seconds.
      await waitForMinimumDisplay();

      await refreshOnboardingStatus();

      navigate("/dashboard", { replace: true });
    } catch {
      await waitForMinimumDisplay();

      setError(
        onboardingCompleted
          ? "Setup completed, but we couldn't refresh your workspace. Please try again."
          : "Unable to complete company setup. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedModules = modules.filter((module) =>
    selected.includes(module.key),
  );

  return (
    <main className="auth-page">
      <section className="auth-card module-onboarding-card">
        <div className="brand">
          <div className="brand-mark">P</div>
          <span>Pulse</span>
        </div>

        {!submitting ? (
          <>
            <div className="auth-heading">
              <h1>Choose your modules</h1>
              <p>
                Select the tools your company wants to use.
                You can manage modules later.
              </p>
            </div>

            {activeCompany && (
              <p className="onboarding-company">
                Setting up <strong>{activeCompany.name}</strong>
              </p>
            )}

            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}

            <div className="module-choice-list">
              {modules.map((module) => {
                const isSelected = selected.includes(module.key);

                return (
                  <button
                    key={module.key}
                    type="button"
                    className={`module-choice ${
                      isSelected ? "selected" : ""
                    }`}
                    onClick={() => toggleModule(module.key)}
                    aria-pressed={isSelected}
                  >
                    <span className="module-choice-check">
                      {isSelected ? "✓" : ""}
                    </span>

                    <span className="module-choice-content">
                      <strong>{module.name}</strong>
                      <small>{module.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void submitOnboarding(selected)}
            >
              Continue
            </button>

            <button
              type="button"
              className="module-skip-button"
              onClick={() => void submitOnboarding([])}
            >
              Skip for now
            </button>
          </>
        ) : (
          <div className="onboarding-installation">
            <div className="onboarding-installation-heading">
              <span className="onboarding-installation-icon">
                <span>▣</span>
              </span>

              <div>
                <h2>Setting up your workspace</h2>
                <p>Preparing your company modules</p>
              </div>

              <span className="module-installing-spinner" />
            </div>

            <div className="module-installing-divider" />

            {selectedModules.length > 0 ? (
              <div className="onboarding-installation-list">
                <p>Setting up the following modules:</p>

                {selectedModules.map((module) => (
                  <div
                    className="onboarding-installation-item"
                    key={module.key}
                  >
                    <span>{module.name}</span>
                    <span className="module-installing-spinner" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="onboarding-installation-message">
                Finishing your company setup...
              </p>
            )}

            <p className="onboarding-wait-message">
              Please wait while we prepare your workspace. This may take a
              few moments.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
