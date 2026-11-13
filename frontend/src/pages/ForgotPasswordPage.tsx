import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { requestPasswordReset } from "../api/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSuccess(true);
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
              : "Unable to process your request. Please try again.",
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
          <h1>Forgot your password?</h1>
          <p>
            Enter your account email address. If an account exists, we'll send
            you a password reset link.
          </p>
        </div>

        {success ? (
          <div className="success-message" role="status">
            <h3>Check your email</h3>
            <p>
              If an account exists for <strong>{email}</strong>, a password
              reset link will be sent to that address.
            </p>
            <p>Please check your inbox and spam folder.</p>
            <Link to="/login">Back to sign in</Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}

            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <button type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send reset link"}
            </button>

            <p className="auth-footer">
              Remember your password? <Link to="/login">Sign in</Link>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}