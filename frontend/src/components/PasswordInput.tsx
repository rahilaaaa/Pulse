
import { useState } from "react";

interface PasswordInputProps {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}

export default function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder = "Enter your password",
  autoComplete,
  required = true,
  minLength,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-wrapper">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="password-input-field"
      />

      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 002.8 2.8" />
            <path d="M9.9 5.2A11 11 0 0112 5c5 0 9 5 10 7a13 13 0 01-3.1 3.8" />
            <path d="M6.2 6.2C3.8 7.7 2 10 2 12c1 2 5 7 10 7 1.2 0 2.3-.3 3.3-.8" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
