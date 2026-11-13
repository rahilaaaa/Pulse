
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import axios from "axios";

import { useAuth } from "../contexts/AuthContext";
import PasswordInput from "../components/PasswordInput";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/companies" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login({ email: email.trim(), password });
      navigate("/companies", { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as
          | Record<string, unknown>
          | undefined;

        const message =
          typeof data?.detail === "string"
            ? data.detail
            : typeof data?.message === "string"
              ? data.message
              : typeof data?.email === "string"
                ? data.email
                : "Unable to sign in. Check your credentials.";

        setError(message);
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
          <h1>Welcome back</h1>
          <p>Sign in to continue to your workspace.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

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

          <div className="password-label-row">
            <label htmlFor="password">Password</label>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          <PasswordInput
            id="password"
            name="password"
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
            autoComplete="current-password"
            />

          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account?{" "}
          <Link to="/register">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
