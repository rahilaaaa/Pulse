
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";

import { registerUser } from "../api/auth";
import PasswordInput from "../components/PasswordInput";

type RegistrationForm = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
};

type RegistrationErrors = Partial<
  Record<keyof RegistrationForm, string>
>;

const initialForm: RegistrationForm = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
};

function validateForm(form: RegistrationForm): RegistrationErrors {
  const errors: RegistrationErrors = {};

  if (!form.first_name.trim()) {
    errors.first_name = "First name is required.";
  }

  if (!form.last_name.trim()) {
    errors.last_name = "Last name is required.";
  }

  const email = form.email.trim();

  if (!email) {
    errors.email = "Email address is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!form.password) {
    errors.password = "Password is required.";
  } else if (form.password.length < 6) {
    errors.password = "Password must contain at least 6 characters.";
  }

  return errors;
}

function getBackendErrors(
  data: unknown,
): {
  fieldErrors: RegistrationErrors;
  generalError: string;
} {
  const fieldErrors: RegistrationErrors = {};

  if (!data || typeof data !== "object") {
    return {
      fieldErrors,
      generalError: "Registration failed. Please try again.",
    };
  }

  const response = data as Record<string, unknown>;

  const fields: (keyof RegistrationForm)[] = [
    "first_name",
    "last_name",
    "email",
    "password",
  ];

  for (const field of fields) {
    const value = response[field];

    if (Array.isArray(value) && value.length > 0) {
      fieldErrors[field] = String(value[0]);
    } else if (typeof value === "string") {
      fieldErrors[field] = value;
    }
  }

  const nonFieldErrors = response.non_field_errors;

  if (Array.isArray(nonFieldErrors) && nonFieldErrors.length > 0) {
    return {
      fieldErrors,
      generalError: String(nonFieldErrors[0]),
    };
  }

  if (typeof response.detail === "string") {
    return {
      fieldErrors,
      generalError: response.detail,
    };
  }

  if (typeof response.message === "string") {
    return {
      fieldErrors,
      generalError: response.message,
    };
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return {
    fieldErrors,
    generalError: hasFieldErrors
      ? ""
      : "Registration failed. Please try again.",
  };
}

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState<RegistrationForm>(initialForm);
  const [fieldErrors, setFieldErrors] =
    useState<RegistrationErrors>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateField = (
    field: keyof RegistrationForm,
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

    setSubmitting(true);

    const normalizedEmail = form.email.trim().toLowerCase();

    try {
      await registerUser({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: normalizedEmail,
        password: form.password,
      });

      navigate(
        `/registration-success?email=${encodeURIComponent(
          normalizedEmail,
        )}`,
        { replace: true },
      );
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

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand">
          <div className="brand-mark">P</div>
          <span>Pulse</span>
        </div>

        <div className="auth-heading">
          <h1>Create your account</h1>
          <p>Start by creating your personal Pulse account.</p>
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

          <label htmlFor="first_name">First name</label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            value={form.first_name}
            onChange={(e) =>
              updateField("first_name", e.target.value)
            }
            autoComplete="given-name"
            aria-invalid={Boolean(fieldErrors.first_name)}
            aria-describedby={
              fieldErrors.first_name
                ? "first_name-error"
                : undefined
            }
            disabled={submitting}
          />
          {fieldErrors.first_name && (
            <p id="first_name-error" className="field-error" role="alert">
              {fieldErrors.first_name}
            </p>
          )}

          <label htmlFor="last_name">Last name</label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            value={form.last_name}
            onChange={(e) =>
              updateField("last_name", e.target.value)
            }
            autoComplete="family-name"
            aria-invalid={Boolean(fieldErrors.last_name)}
            aria-describedby={
              fieldErrors.last_name
                ? "last_name-error"
                : undefined
            }
            disabled={submitting}
          />
          {fieldErrors.last_name && (
            <p id="last_name-error" className="field-error" role="alert">
              {fieldErrors.last_name}
            </p>
          )}

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={(e) =>
              updateField("email", e.target.value)
            }
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={
              fieldErrors.email ? "email-error" : undefined
            }
            disabled={submitting}
          />
          {fieldErrors.email && (
            <p id="email-error" className="field-error" role="alert">
              {fieldErrors.email}
            </p>
          )}

          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            name="password"
            value={form.password}
            onChange={(value) => updateField("password", value)}
            placeholder="Create a password"
            autoComplete="new-password"
          />

          {fieldErrors.password && (
            <p id="password-error" className="field-error" role="alert">
              {fieldErrors.password}
            </p>
          )}

          <p className="registration-hint">
            Use at least 6 characters for your password.
          </p>

          <button type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
