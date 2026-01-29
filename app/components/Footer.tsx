"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-neutral-800 bg-black/40">
      <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <span>© 2026 OutlierYT. All rights reserved.</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/privacy" className="hover:text-neutral-300 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-neutral-300 transition-colors">
            Terms of Service
          </Link>
          <a
            href="mailto:support@outlieryt.com"
            className="hover:text-neutral-300 transition-colors"
          >
            Contact
          </a>
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <span>Powered by</span>
            <span className="font-semibold text-red-400">YouTube</span>
          </a>
        </div>
      </div>
    </footer>
  );
}

