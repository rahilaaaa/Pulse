import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";

export default function CompanySelectPage() {
  const navigate = useNavigate();

  const {
    companies,
    loadCompanies,
    chooseCompany,
    refreshOnboardingStatus,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const memberships = await loadCompanies();

        if (!mounted) return;

        if (memberships.length === 0) {
          navigate("/company-setup", { replace: true });
          return;
        }

        if (memberships.length === 1) {
          await openCompany(memberships[0].company);
        }
      } catch {
        if (mounted) {
          setError("Unable to load your companies.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const openCompany = async (companyId: number) => {
      await chooseCompany(companyId);

      const onboarding = await refreshOnboardingStatus();

      if (!mounted) return;

      navigate(
        onboarding.step === "module_selection" ||
          onboarding.step === "company_onboarding_incomplete"
          ? "/onboarding/modules"
          : onboarding.step === "dashboard"
            ? "/dashboard"
            : "/companies",
        { replace: true },
      );
    };

    void initialize();

    return () => {
      mounted = false;
    };
  }, [loadCompanies, chooseCompany, refreshOnboardingStatus, navigate]);

  const handleSelect = async (companyId: number) => {
    setError("");
    setSelectingId(companyId);

    try {
      await chooseCompany(companyId);

      const onboarding = await refreshOnboardingStatus();

      navigate(
        onboarding.step === "module_selection" ||
          onboarding.step === "company_onboarding_incomplete"
          ? "/onboarding/modules"
          : onboarding.step === "dashboard"
            ? "/dashboard"
            : "/companies",
        { replace: true },
      );
    } catch {
      setError("Unable to open this company. Please try again.");
    } finally {
      setSelectingId(null);
    }
  };

  if (loading) {
    return <div className="page-loading">Loading companies...</div>;
  }

  return (
    <section className="company-selection">
      <h1>Select your workspace</h1>
      <p>Choose the company you want to work with.</p>

      {error && <div className="error-message">{error}</div>}

      <div className="company-list">
        {companies.map((company) => (
          <button
            key={company.id}
            className="company-option"
            onClick={() => handleSelect(company.company)}
            disabled={selectingId !== null}
          >
            <span>
              <strong>{company.company_name}</strong>
              <small>
                {company.company_industry} · {company.role}
              </small>
            </span>

            <span>
              {selectingId === company.company ? "Opening..." : "Continue →"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}