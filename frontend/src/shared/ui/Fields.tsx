import { useState, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
};

function FieldLabel({ label, required, optional }: { label: string; required?: boolean; optional?: boolean }) {
  return (
    <span className="font-medium text-slate-800 dark:text-slate-200">
      {label}
      {required ? <span className="text-rose-700"> *</span> : null}
      {optional ? <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">Optional</span> : null}
    </span>
  );
}

export function TextField({ label, error, hint, required, optional, id, prefix, ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement> & { prefix?: string }) {
  const fieldId = id ?? props.name;
  return (
    <label className="block text-sm" htmlFor={fieldId}>
      <FieldLabel label={label} required={required} optional={optional} />
      {prefix ? (
        <div className={`mt-1.5 flex overflow-hidden rounded-lg border bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-teal-700 ${error ? "border-rose-400" : "border-slate-300 dark:border-slate-600"}`}>
          <span className="flex items-center border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 text-slate-500 dark:text-slate-400">{prefix}</span>
          <input id={fieldId} className="w-full bg-transparent px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none" {...props} />
        </div>
      ) : (
        <input
          id={fieldId}
          className={`mt-1.5 w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none ring-teal-700 focus:ring-2 ${error ? "border-rose-400" : "border-slate-300 dark:border-slate-600"}`}
          {...props}
        />
      )}
      {error ? <span className="mt-1.5 block text-rose-700">{error}</span> : hint ? <span className="mt-1.5 block text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function PasswordField({ label, error, hint, required, optional, id, ...props }: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const fieldId = id ?? props.name;
  return (
    <div className="block text-sm">
      <label className="font-medium text-slate-800 dark:text-slate-200" htmlFor={fieldId}>
        {label}
        {required ? <span className="text-rose-700"> *</span> : null}
        {optional ? <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">Optional</span> : null}
      </label>
      <div className="relative mt-1.5">
        <input
          id={fieldId}
          className={`w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2.5 pr-16 text-slate-900 dark:text-slate-100 outline-none ring-teal-700 focus:ring-2 ${error ? "border-rose-400" : "border-slate-300 dark:border-slate-600"}`}
          {...props}
          type={visible ? "text" : "password"}
        />
        <button
          className="absolute inset-y-0 right-3 text-sm font-medium text-teal-800"
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error ? <span className="mt-1.5 block text-rose-700">{error}</span> : hint ? <span className="mt-1.5 block text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </div>
  );
}

export function SelectField({ label, error, hint, required, optional, id, children, ...props }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const fieldId = id ?? props.name;
  return (
    <label className="block text-sm" htmlFor={fieldId}>
      <span className="font-medium text-slate-800 dark:text-slate-200">
        {label}
        {required ? <span className="text-rose-700"> *</span> : null}
        {optional ? <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">Optional</span> : null}
      </span>
      <select
        id={fieldId}
        className={`mt-1.5 w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none ring-teal-700 focus:ring-2 ${error ? "border-rose-400" : "border-slate-300 dark:border-slate-600"}`}
        {...props}
      >
        {children}
      </select>
      {error ? <span className="mt-1.5 block text-rose-700">{error}</span> : hint ? <span className="mt-1.5 block text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}
