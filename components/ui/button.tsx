import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    redirectUrl?: string;
    signInFallbackRedirectUrl?: string;
    signInForceRedirectUrl?: string;
    signUpFallbackRedirectUrl?: string;
    signUpForceRedirectUrl?: string;
    signInUrl?: string;
    signUpUrl?: string;
  }
>;

export function Button({
  className = "",
  children,
  redirectUrl: _redirectUrl,
  signInFallbackRedirectUrl: _signInFallbackRedirectUrl,
  signInForceRedirectUrl: _signInForceRedirectUrl,
  signUpFallbackRedirectUrl: _signUpFallbackRedirectUrl,
  signUpForceRedirectUrl: _signUpForceRedirectUrl,
  signInUrl: _signInUrl,
  signUpUrl: _signUpUrl,
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
