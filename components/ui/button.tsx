import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    redirectUrl?: string;
  }
>;

export function Button({
  className = "",
  children,
  redirectUrl: _redirectUrl,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-zinc-900 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
