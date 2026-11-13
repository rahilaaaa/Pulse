
import { Link, useLocation, useSearchParams } from "react-router-dom";

export default function RegistrationSuccessPage() {
  const [params] = useSearchParams();
  const location = useLocation();

  const email =
    params.get("email") ||
    (location.state as { email?: string } | null)?.email ||
    "your email address";

  return (
    <main className="auth-page">
      <section className="verification-card">
        <Link to="/login" className="brand">
          <div className="brand-mark">P</div>
          <span>Pulse</span>
        </Link>

        <div className="verification-symbol success-symbol">
          @
        </div>

        <h1>Check your email</h1>

        <p>
          We sent a verification link to <strong>{email}</strong>.
          Open the email and follow the link to activate your account.
        </p>

        <p>
          The verification link expires after 24 hours.
        </p>

        <Link to="/login" className="verification-button">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
