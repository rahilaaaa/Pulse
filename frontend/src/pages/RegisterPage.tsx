
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";

import { registerCompany } from "../api/auth";
import PasswordInput from "../components/PasswordInput";

interface RegistrationForm {
  company_name: string;
  industry: string;
  business_email: string;
  phone: string;
  country: string;
  website: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
}

const initialForm: RegistrationForm = {
  company_name: "",
  industry: "",
  business_email: "",
  phone: "",
  country: "",
  website: "",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
};

export default function RegisterPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RegistrationForm>(initialForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field: keyof RegistrationForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleNext = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStep(2);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (form.password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }

    setSubmitting(true);

    try {
      await registerCompany({
        ...form,
        company_name: form.company_name.trim(),
        industry: form.industry.trim(),
        business_email: form.business_email.trim(),
        phone: form.phone.trim(),
        country: form.country.trim(),
        website: form.website.trim() || undefined,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
      });

      navigate(
        `/registration-success?email=${encodeURIComponent(
          form.email.trim().toLowerCase(),
        )}`,
        { replace: true },
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data;

        if (data && typeof data === "object") {
          const messages = Object.entries(data)
            .map(([field, value]) => {
              const detail = Array.isArray(value)
                ? value.join(", ")
                : typeof value === "string"
                  ? value
                  : JSON.stringify(value);

              return `${field.replaceAll("_", " ")}: ${detail}`;
            })
            .join(" ");

          setError(
            messages ||
              "Registration failed. Please check your information.",
          );
        } else {
          setError("Unable to complete registration. Please try again.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="registration-page">
      <section className="registration-container">
        <header className="registration-header">
          <Link to="/login" className="brand">
            <div className="brand-mark">P</div>
            <span>Pulse</span>
          </Link>

          <div className="registration-progress">
            <span className={step === 1 ? "current" : "completed"} />
            <span className={step === 2 ? "current" : ""} />
          </div>
        </header>

        <div className="registration-heading">
          <span className="step-label">STEP {step} OF 2</span>

          <h1>
            {step === 1
              ? "Set up your company"
              : "Create your administrator account"}
          </h1>

          <p>
            {step === 1
              ? "Tell us a little about your organization."
              : "Enter the details of the person who will manage this workspace."}
          </p>
        </div>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form className="registration-form" onSubmit={handleNext}>
            <label htmlFor="company_name">Company name *</label>
            <input
              id="company_name"
              value={form.company_name}
              onChange={(e) =>
                updateField("company_name", e.target.value)
              }
              placeholder="Enter company name"
              required
            />

            <label htmlFor="industry">Industry *</label>
            <input
              id="industry"
              value={form.industry}
              onChange={(e) => updateField("industry", e.target.value)}
              placeholder="e.g. Technology"
              required
            />

            <label htmlFor="business_email">Business email *</label>
            <input
              id="business_email"
              type="email"
              value={form.business_email}
              onChange={(e) =>
                updateField("business_email", e.target.value)
              }
              placeholder="company@example.com"
              required
            />

            <div className="registration-two-columns">
              <div>
                <label htmlFor="phone">Phone *</label>
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="Phone number"
                  required
                />
              </div>

              <div>
                <label htmlFor="country">Country *</label>
                <input
                  id="country"
                  value={form.country}
                  onChange={(e) => updateField("country", e.target.value)}
                  placeholder="Country"
                  required
                />
              </div>
            </div>

            <label htmlFor="website">Website</label>
            <input
              id="website"
              type="url"
              value={form.website}
              onChange={(e) => updateField("website", e.target.value)}
              placeholder="https://example.com (optional)"
            />

            <button className="registration-primary" type="submit">
              Continue
              <span>→</span>
            </button>
          </form>
        ) : (
          <form className="registration-form" onSubmit={handleSubmit}>
            <div className="registration-two-columns">
              <div>
                <label htmlFor="first_name">First name *</label>
                <input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) =>
                    updateField("first_name", e.target.value)
                  }
                  placeholder="First name"
                  required
                />
              </div>

              <div>
                <label htmlFor="last_name">Last name *</label>
                <input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) =>
                    updateField("last_name", e.target.value)
                  }
                  placeholder="Last name"
                  required
                />
              </div>
            </div>

            <label htmlFor="email">Administrator email *</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />

            <label htmlFor="password">Password *</label>
            <PasswordInput
              id="password"
              name="password"
              value={form.password}
              onChange={(value) => updateField("password", value)}
              placeholder="Create a password"
              autoComplete="new-password"
            />

            <p className="registration-hint">
              Use at least 12 characters for your password.
            </p>

            <div className="registration-actions">
              <button
                type="button"
                className="registration-secondary"
                onClick={() => {
                  setError("");
                  setStep(1);
                }}
                disabled={submitting}
              >
                Back
              </button>

              <button
                type="submit"
                className="registration-primary"
                disabled={submitting}
              >
                {submitting ? "Creating account..." : "Create account"}
                {!submitting && <span>→</span>}
              </button>
            </div>
          </form>
        )}

        <p className="registration-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );  
}
