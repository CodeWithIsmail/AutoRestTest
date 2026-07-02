import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const FIELD_CLASS =
  "rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Labelled text input. */
export function FormField({
  label,
  error,
  id,
  className = "",
  ...props
}: FormFieldProps) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-zinc-300">
        {label}
      </label>
      <input id={inputId} className={`h-10 ${FIELD_CLASS} ${className}`} {...props} />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

interface TextareaFieldProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

/** Labelled multi-line textarea (e.g. project description). */
export function TextareaField({
  label,
  error,
  id,
  className = "",
  rows = 3,
  ...props
}: TextareaFieldProps) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-zinc-300">
        {label}
      </label>
      <textarea
        id={inputId}
        rows={rows}
        className={`resize-y py-2 ${FIELD_CLASS} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
