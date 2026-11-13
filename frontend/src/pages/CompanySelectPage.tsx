
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function CompanySelectPage() {
  const navigate = useNavigate();
  const { companies, loadCompanies, chooseCompany } = useAuth();

  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCompanies()
      .catch(() => setError("Unable to load your companies."))
      .finally(() => setLoading(false));
  }, [loadCompanies]);

  const handleSelect = async (companyId: number) => {
    setError("");
    setSelectingId(companyId);

    try {
      await chooseCompany(companyId);
      navigate("/dashboard", { replace: true });
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

      {companies.length === 0 ? (
        <p>You don't have any active companies yet.</p>
      ) : (
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
                {selectingId === company.company
                  ? "Opening..."
                  : "Continue →"}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}