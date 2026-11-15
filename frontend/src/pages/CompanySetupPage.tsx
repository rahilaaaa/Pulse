
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import { createCompany } from "../api/companies";
import { useAuth } from "../contexts/AuthContext";

type CompanyForm = {
  name: string;
  industry: string;
  business_email: string;
  phone: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  website: string;
};

type CompanyErrors = Partial<Record<keyof CompanyForm, string>>;

const initialForm: CompanyForm = {
  name: "",
  industry: "",
  business_email: "",
  phone: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "India",
  website: "",
};

const fieldNames: (keyof CompanyForm)[] = [
  "name",
  "industry",
  "business_email",
  "phone",
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "postal_code",
  "country",
  "website",
];

function normalizeIndianPhone(value: string): string | null {
  const trimmed = value.trim();

  // Permit digits, an optional +, spaces, hyphens and parentheses.
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) {
    return null;
  }

  let digits = trimmed.replace(/\D/g, "");

  // Remove India's country calling code when supplied.
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return null;
  }

  return `+91${digits}`;
}

function validateForm(form: CompanyForm): CompanyErrors {
  const errors: CompanyErrors = {};

  if (!form.name.trim()) {
    errors.name = "Company name is required.";
  }

  if (!form.industry.trim()) {
    errors.industry = "Please enter your industry.";
  }

  const email = form.business_email.trim();

  if (!email) {
    errors.business_email = "Business email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.business_email = "Enter a valid business email address.";
  }

  if (!form.phone.trim()) {
    errors.phone = "Phone number is required.";
  } else if (!normalizeIndianPhone(form.phone)) {
    errors.phone =
      "Enter a valid 10-digit Indian mobile number.";
  }

  if (!form.address_line_1.trim()) {
    errors.address_line_1 = "Address line 1 is required.";
  }

  if (!form.city.trim()) {
    errors.city = "City is required.";
  }

  if (!form.state.trim()) {
    errors.state = "State is required.";
  }

  if (!form.postal_code.trim()) {
    errors.postal_code = "PIN code is required.";
  } else if (!/^[1-9]\d{5}$/.test(form.postal_code.trim())) {
    errors.postal_code = "Enter a valid 6-digit Indian PIN code.";
  }

  if (form.country !== "India") {
    errors.country = "Country must be India.";
  }

  const website = form.website.trim();

  if (website) {
    try {
      const parsedUrl = new URL(website);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        errors.website = "Website must use HTTP or HTTPS.";
      }
    } catch {
      errors.website =
        "Enter a valid website URL, including https://.";
    }
  }

  return errors;
}

function getBackendErrors(data: unknown): {
  fieldErrors: CompanyErrors;
  generalError: string;
} {
  const fieldErrors: CompanyErrors = {};

  if (!data || typeof data !== "object") {
    return {
      fieldErrors,
      generalError: "Unable to create your company. Please try again.",
    };
  }

  const response = data as Record<string, unknown>;

  for (const field of fieldNames) {
    const value = response[field];

    if (Array.isArray(value) && value.length > 0) {
      fieldErrors[field] = String(value[0]);
    } else if (typeof value === "string") {
      fieldErrors[field] = value;
    }
  }

  const detail = response.detail;

  if (typeof detail === "string") {
    return {
      fieldErrors,
      generalError: detail,
    };
  }

  const nonFieldErrors = response.non_field_errors;

  if (Array.isArray(nonFieldErrors) && nonFieldErrors.length > 0) {
    return {
      fieldErrors,
      generalError: String(nonFieldErrors[0]),
    };
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return {
    fieldErrors,
    generalError: hasFieldErrors
      ? ""
      : "Unable to create your company. Please try again.",
  };
}

export default function CompanySetupPage() {
  const navigate = useNavigate();
  const { loadCompanies, chooseCompany } = useAuth();

  const [form, setForm] = useState<CompanyForm>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<CompanyErrors>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateField = (
    field: keyof CompanyForm,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setFieldErrors((current) => ({
      ...current,
      [field]: undefined,
    }));

    setError("");
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (submitting) return;

    setError("");

    const validationErrors = validateForm(form);
    setFieldErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const normalizedPhone = normalizeIndianPhone(form.phone);

    if (!normalizedPhone) return;

    setSubmitting(true);

    try {
      const response = await createCompany({
        ...form,
        name: form.name.trim(),
        industry: form.industry.trim(),
        business_email: form.business_email.trim().toLowerCase(),
        phone: normalizedPhone,
        address_line_1: form.address_line_1.trim(),
        address_line_2: form.address_line_2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postal_code: form.postal_code.trim(),
        country: "India",
        website: form.website.trim(),
      });

      await loadCompanies();

      // Obtain the company-scoped access token.
      await chooseCompany(response.company.id);

      navigate("/onboarding/modules", { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const result = getBackendErrors(err.response?.data);

        setFieldErrors(result.fieldErrors);
        setError(result.generalError);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderFieldError = (field: keyof CompanyForm) => {
    const message = fieldErrors[field];

    if (!message) return null;

    return (
      <p
        id={`${field}-error`}
        className="field-error"
        role="alert"
      >
        {message}
      </p>
    );
  };

  return (
    <main className="auth-page">
      <section className="auth-card company-setup-card">
        <div className="brand">
          <div className="brand-mark">P</div>
          <span>Pulse</span>
        </div>

        <div className="auth-heading">
          <h1>Set up your company</h1>
          <p>
            Tell us about the organization you want to manage.
          </p>
        </div>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <label htmlFor="name">Company name</label>
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            disabled={submitting}
          />
          {renderFieldError("name")}

          <label htmlFor="industry">Industry</label>
          <select
            id="industry"
            name="industry"
            value={form.industry}
            onChange={(e) => updateField("industry", e.target.value)}
            aria-invalid={Boolean(fieldErrors.industry)}
            aria-describedby={
              fieldErrors.industry ? "industry-error" : undefined
            }
            disabled={submitting}
          >
            <option value="">Select your industry</option>
            <option value="Manufacturing">Manufacturing</option>
            <option value="Retail & Wholesale">Retail & Wholesale</option>
            <option value="Trading & Distribution">Trading & Distribution</option>
            <option value="Services & Professional Services">
              Services & Professional Services
            </option>
            <option value="Other">Other</option>
          </select>
{renderFieldError("industry")}

          <label htmlFor="business_email">Business email</label>
          <input
            id="business_email"
            name="business_email"
            type="email"
            value={form.business_email}
            onChange={(e) =>
              updateField("business_email", e.target.value)
            }
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.business_email)}
            aria-describedby={
              fieldErrors.business_email
                ? "business_email-error"
                : undefined
            }
            disabled={submitting}
          />
          {renderFieldError("business_email")}

          <label htmlFor="phone">Indian mobile number</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="9876543210"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
            disabled={submitting}
          />
          {renderFieldError("phone")}

          <label htmlFor="address_line_1">Address line 1</label>
          <input
            id="address_line_1"
            name="address_line_1"
            autoComplete="address-line1"
            value={form.address_line_1}
            onChange={(e) =>
              updateField("address_line_1", e.target.value)
            }
            aria-invalid={Boolean(fieldErrors.address_line_1)}
            aria-describedby={
              fieldErrors.address_line_1
                ? "address_line_1-error"
                : undefined
            }
            disabled={submitting}
          />
          {renderFieldError("address_line_1")}

          <label htmlFor="address_line_2">
            Address line 2 (optional)
          </label>
          <input
            id="address_line_2"
            name="address_line_2"
            autoComplete="address-line2"
            value={form.address_line_2}
            onChange={(e) =>
              updateField("address_line_2", e.target.value)
            }
            disabled={submitting}
          />

          <label htmlFor="city">City</label>
          <input
            id="city"
            name="city"
            autoComplete="address-level2"
            value={form.city}
            onChange={(e) => updateField("city", e.target.value)}
            aria-invalid={Boolean(fieldErrors.city)}
            aria-describedby={fieldErrors.city ? "city-error" : undefined}
            disabled={submitting}
          />
          {renderFieldError("city")}

          <label htmlFor="state">State</label>
          <input
            id="state"
            name="state"
            autoComplete="address-level1"
            value={form.state}
            onChange={(e) => updateField("state", e.target.value)}
            aria-invalid={Boolean(fieldErrors.state)}
            aria-describedby={fieldErrors.state ? "state-error" : undefined}
            disabled={submitting}
          />
          {renderFieldError("state")}

          <label htmlFor="postal_code">PIN code</label>
          <input
            id="postal_code"
            name="postal_code"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={form.postal_code}
            onChange={(e) =>
              updateField(
                "postal_code",
                e.target.value.replace(/\D/g, "").slice(0, 6),
              )
            }
            aria-invalid={Boolean(fieldErrors.postal_code)}
            aria-describedby={
              fieldErrors.postal_code
                ? "postal_code-error"
                : undefined
            }
            disabled={submitting}
          />
          {renderFieldError("postal_code")}

          <label htmlFor="country">Country</label>
          <input
            id="country"
            name="country"
            value="India"
            readOnly
            aria-readonly="true"
            disabled={submitting}
          />

          <label htmlFor="website">Website (optional)</label>
          <input
            id="website"
            name="website"
            type="url"
            placeholder="https://example.com"
            value={form.website}
            onChange={(e) => updateField("website", e.target.value)}
            aria-invalid={Boolean(fieldErrors.website)}
            aria-describedby={
              fieldErrors.website ? "website-error" : undefined
            }
            disabled={submitting}
          />
          {renderFieldError("website")}

          <button type="submit" disabled={submitting}>
            {submitting ? "Creating company..." : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
