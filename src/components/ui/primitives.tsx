import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "icon";

export function buttonStyles({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--canvas))]",
    variant === "primary" &&
      "bg-[hsl(var(--brand))] text-[hsl(var(--brand-ink))] hover:bg-[hsl(var(--brand-strong))]",
    variant === "secondary" &&
      "border border-[hsl(var(--stroke-strong))] bg-[hsl(var(--surface-raised))] text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-hover))]",
    variant === "ghost" &&
      "bg-transparent text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]",
    variant === "danger" &&
      "bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger-soft)/0.8)]",
    size === "sm" && "min-h-11 px-3 text-xs",
    size === "md" && "min-h-11 px-4 text-sm",
    size === "icon" && "h-11 w-11 p-0",
    className,
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={buttonStyles({ variant, size, className })}
    {...props}
  />
));
Button.displayName = "Button";

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(({ className, label, children, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-label={label}
    className={buttonStyles({ variant: "ghost", size: "icon", className })}
    {...props}
  >
    {children}
  </button>
));
IconButton.displayName = "IconButton";

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-surface)] border border-[hsl(var(--stroke))] bg-[hsl(var(--surface))]",
        className,
      )}
      {...props}
    />
  );
}

export function Meta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums text-[hsl(var(--text-muted))]",
        className,
      )}
      {...props}
    />
  );
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[hsl(var(--text-subtle))]",
        className,
      )}
      {...props}
    />
  );
}

export function SearchField({
  className,
  value,
  onClear,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  value?: string;
  onClear?: () => void;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-subtle))]"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        className="h-11 w-full rounded-[var(--radius-control)] border border-white/20 bg-white/5 pl-10 pr-10 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/40 focus:ring-1 focus:ring-white/35"
        {...props}
      />
      {Boolean(value) && onClear && (
        <button
          type="button"
          onClick={onClear}
        className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-white/55 hover:text-white"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-8 py-12 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center border border-white/10 bg-white/5 text-white/55">
          {icon}
        </div>
      )}
      <h2 className="text-base font-semibold text-[hsl(var(--text))]">{title}</h2>
      {description && (
        <p className="mt-1 max-w-xs text-sm leading-6 text-[hsl(var(--text-muted))]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function AnnotationDot({ color }: { color?: string | null }) {
  return (
    <span
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full border border-[hsl(var(--stroke-strong))]",
        color === "red" && "bg-rose-500",
        color === "blue" && "bg-blue-500",
        color === "pink" && "bg-pink-500",
        color === "cyan" && "bg-cyan-400",
        !color && "bg-[hsl(var(--stroke-strong))]",
      )}
      aria-hidden
    />
  );
}
