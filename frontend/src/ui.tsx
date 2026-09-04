import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  wide,
  className = "",
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`field${wide ? " field-wide" : ""} ${className}`.trim()} htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <small className="field-hint">{hint}</small> : null}
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}

export function FieldGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`field-grid ${className}`.trim()}>{children}</div>;
}

export function FormSection({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="form-section">
      {title ? <h3 className="form-section-title">{title}</h3> : null}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="empty empty-state">
      <p>{title}</p>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
