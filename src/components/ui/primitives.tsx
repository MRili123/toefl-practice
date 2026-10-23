"use client";

import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { IconCheck, IconDash, IconX } from "./icons";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-[15px]",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-accent text-white hover:bg-accent-hover",
        variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-ink-2 hover:bg-black/[0.04] hover:text-ink",
        variant === "danger" && "border border-danger/40 bg-surface text-danger hover:bg-danger-weak",
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-lg border border-line bg-surface", className)}>{children}</div>;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cx("flex items-start justify-between gap-4", disabled && "opacity-50")}>
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="block text-sm text-ink-3">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissable = true,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** When false, Escape and backdrop clicks are ignored (e.g. unsaved edits); close with an explicit button. */
  dismissable?: boolean;
  /** "lg": a large, fixed-height window for writing (children should fill it with h-full). */
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => !dismissable && e.preventDefault()}
      onClick={(e) => dismissable && e.target === ref.current && onClose()}
      aria-label={title}
      className={cx(
        "m-auto rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-black/30",
        size === "lg" ? "h-[min(860px,calc(100dvh-32px))] max-h-none w-[min(1040px,calc(100vw-32px))] max-w-none" : "w-[min(640px,calc(100vw-32px))]",
      )}
    >
      {open && children}
    </dialog>
  );
}

export type Status = "correct" | "incorrect" | "unanswered";

/** Icon + shape + text, so status never relies on color alone. */
export function StatusMark({ status, withLabel = false, size = 16 }: { status: Status; withLabel?: boolean; size?: number }) {
  const label = status === "correct" ? "Correct" : status === "incorrect" ? "Incorrect" : "Unanswered";
  const Icon = status === "correct" ? IconCheck : status === "incorrect" ? IconX : IconDash;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 font-medium",
        status === "correct" && "text-success",
        status === "incorrect" && "text-danger",
        status === "unanswered" && "text-ink-3",
      )}
    >
      <Icon width={size} height={size} strokeWidth={2.5} />
      {withLabel ? <span className="text-sm">{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden />;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</div>;
}

/** Page title block used at the top of every main view. */
export function PageHeader({ eyebrow, title, description, aside }: { eyebrow?: string; title: string; description?: string; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-8">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-2">{description}</p>}
      </div>
      {aside}
    </header>
  );
}

export function SectionHeading({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {title}
        {count !== undefined && <span className="ml-2 text-sm font-normal text-ink-3 tabular">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, text, action, compact }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("flex flex-col items-center rounded-lg border border-dashed border-line-strong bg-surface-2/60 text-center", compact ? "px-6 py-8" : "px-6 py-16")}>
      {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-weak text-accent">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-3">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-sm text-ink-2 tabular">{Math.round(pct)}%</span>
    </div>
  );
}

/** Circular progress; `value` 0–1. */
export function RingProgress({ value, size = 40, stroke = 4, children, label }: { value: number | null; size?: number; stroke?: number; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {value !== null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular">{value}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function ChipGroup<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            value === o.id ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-ink-2 hover:border-accent/60 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Shared card surface with the one hover treatment used across the app. */
export const cardInteractive =
  "rounded-lg border border-line bg-surface transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-accent/50 hover:shadow-[0_6px_20px_rgba(22,24,29,0.06)]";
