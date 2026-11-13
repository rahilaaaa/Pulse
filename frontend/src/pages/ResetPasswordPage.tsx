import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";

import PasswordInput from "../components/PasswordInput";
import { confirmPasswordReset } from "../api/auth";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("This password reset link is invalid or incomplete.");
      return;
    }

    if (password.length < 12) {
      setError("Your password must contain at least 12 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      await confirmPasswordReset(token, password);
      navigate("/login", {
        replace: true,
        state: {
          message: "Your password has been reset. Please sign in.",
        },
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as
          | Record<string, unknown>
          | undefined;

        setError(
          typeof data?.message === "string"
            ? data.message
            : typeof data?.detail === "string"
              ? data.detail
              : "The reset link is invalid or expired. Request a new one.",
        );
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
        <Link to="/login" className="brand">
          <div className="brand-mark">P</div>
          <span>Pulse</span>
        </Link>

        <div className="auth-heading">
          <h1>Reset your password</h1>
          <p>Choose a new password for your Pulse account.</p>
        </div>

        {!token ? (
          <div className="error-message" role="alert">
            This password reset link is invalid or incomplete.
            <p>
              <Link to="/forgot-password">Request a new reset link</Link>
            </p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}

            <label htmlFor="new-password">New password</label>
            <PasswordInput
              id="new-password"
              name="new-password"
              value={password}
              onChange={setPassword}
              placeholder="Enter your new password"
              autoComplete="new-password"
            />

            <label htmlFor="confirm-password">Confirm new password</label>
            <PasswordInput
              id="confirm-password"
              name="confirm-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirm your new password"
              autoComplete="new-password"
            />

            <p className="registration-hint">
              Use at least 12 characters. Avoid reusing an old password.
            </p>

            <button type="submit" disabled={submitting}>
              {submitting ? "Resetting password..." : "Reset password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}