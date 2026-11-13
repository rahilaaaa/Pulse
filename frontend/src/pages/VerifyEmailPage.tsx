
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { verifyEmail } from "../api/auth";

type Status = "loading" | "success" | "error";

// Share an in-flight verification request between Strict Mode effect runs.
const verificationRequests = new Map<
  string,
  ReturnType<typeof verifyEmail>
>();

function getVerificationRequest(token: string) {
  const existing = verificationRequests.get(token);

  if (existing) {
    return existing;
  }

  const request = verifyEmail(token);
  verificationRequests.set(token, request);

  return request;
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState(
    "Verifying your email address...",
  );

  useEffect(() => {
    let active = true;

    if (!token) {
      setStatus("error");
      setMessage("The verification link is invalid or incomplete.");
      return;
    }

    setStatus("loading");
    setMessage("Verifying your email address...");

    getVerificationRequest(token)
      .then((response) => {
        if (!active) return;

        setStatus("success");
        setMessage(
          response.message || "Your email has been verified successfully.",
        );
      })
      .catch((error: unknown) => {
        if (!active) return;

        setStatus("error");

        if (axios.isAxiosError(error)) {
          const data = error.response?.data as
            | Record<string, unknown>
            | undefined;

          setMessage(
            typeof data?.detail === "string"
              ? data.detail
              : typeof data?.message === "string"
                ? data.message
                : "The verification link may have expired or already been used.",
          );
        } else {
          setMessage("Unable to verify your email. Please try again.");
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="auth-page">
      <section className="verification-card">
        <Link to="/login" className="brand">
          <div className="brand-mark">P</div>
          <span>Pulse</span>
        </Link>

        {status === "loading" && <div className="spinner" />}

        {status === "success" && (
          <div className="verification-symbol success-symbol">
            ✓
          </div>
        )}

        {status === "error" && (
          <div className="verification-symbol error-symbol">
            !
          </div>
        )}

        <h1>
          {status === "loading"
            ? "Verifying your email"
            : status === "success"
              ? "Email verified"
              : "Verification unsuccessful"}
        </h1>

        <p>{message}</p>

        {status !== "loading" && (
          <Link to="/login" className="verification-button">
            {status === "success"
              ? "Continue to sign in"
              : "Back to sign in"}
          </Link>
        )}
      </section>
    </main>
  );
}
