import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-panel border border-edge p-4 ${className}`}>{children}</div>
  );
}

type Variant = "default" | "primary" | "danger" | "ghost" | "active";
const VARIANTS: Record<Variant, string> = {
  default: "bg-edge/60 hover:bg-edge text-slate-100",
  primary: "bg-accent hover:brightness-110 text-white",
  danger: "bg-live hover:brightness-110 text-white",
  ghost: "bg-transparent hover:bg-edge/50 text-slate-300",
  active: "bg-accent/20 border border-accent text-accent",
};

export function Button({
  variant = "default",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-xl px-4 py-3 font-medium transition disabled:opacity-40 disabled:cursor-not-allowed select-none ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Pill({
  ok,
  children,
}: {
  ok: boolean | "warn";
  children: ReactNode;
}) {
  const color = ok === "warn" ? "text-warn" : ok ? "text-good" : "text-slate-500";
  const dot = ok === "warn" ? "bg-warn" : ok ? "bg-good" : "bg-slate-600";
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${color}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
