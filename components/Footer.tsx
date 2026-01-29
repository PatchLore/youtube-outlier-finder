\"use client\";

import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  const handleResetDemo = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem("outlier_demo_completed");
      window.location.reload();
    } catch {
      // Ignore errors in non-browser environments
    }
  };

  return (
    <footer className="border-t border-zinc-800 bg-black/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-xs text-zinc-400 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-zinc-300">
            © {currentYear} OutlierYT. All rights reserved.
          </p>
          <p className="text-[11px] text-zinc-500">
            Powered by YouTube. This product uses the YouTube API Services but is
            not endorsed or certified by YouTube or Google.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 text-[11px] md:items-end">
          <div className="flex flex-wrap items-center gap-4 md:justify-end">
            <Link
              href="/privacy"
              className="transition-colors hover:text-zinc-200"
            >
              Privacy Policy
            </Link>
            <span className="h-3 w-px bg-zinc-700" aria-hidden="true" />
            <Link
              href="/terms"
              className="transition-colors hover:text-zinc-200"
            >
              Terms of Service
            </Link>
            <span className="h-3 w-px bg-zinc-700" aria-hidden="true" />
            <a
              href="mailto:founder@outlieryt.com"
              className="transition-colors hover:text-zinc-200"
            >
              Contact
            </a>
          </div>
          <button
            type="button"
            onClick={handleResetDemo}
            className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Reset onboarding demo
          </button>
        </div>
      </div>
    </footer>
  );
}
