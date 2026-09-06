import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";

const BANNER_HIDE_MS = 5000;

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-intro">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <div className="page-head-title">
          <h2>{title}</h2>
          {actions ? <div className="page-head-actions">{actions}</div> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

export function Alert({
  children,
  tone = "danger",
  onDismiss,
  dismissLabel,
}: {
  children: ReactNode;
  tone?: "danger" | "success" | "warning";
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!dismissRef.current) return;
    const timer = window.setTimeout(() => dismissRef.current?.(), BANNER_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [children]);

  return (
    <div className={`app-alert app-alert-${tone} app-banner`} role="status">
      <p>{children}</p>
      {onDismiss ? (
        <button type="button" className="icon-button" onClick={onDismiss} aria-label={dismissLabel || "Close"}>
          ×
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label }: { label: ReactNode }) {
  return (
    <div className="loading loading-state" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function PhoneField({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="tel" inputMode="tel" autoComplete="tel" className={`phone-input ${className}`.trim()} {...props} />;
}

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
    <label className={`field${wide ? " field-wide" : ""}${error ? " is-invalid" : ""} ${className}`.trim()} htmlFor={htmlFor}>
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
