"use client";

import { useState } from "react";
import Link from "next/link";

export type UpgradeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  features: string[];
};

export function UpgradeModal({
  isOpen,
  onClose,
  title,
  description,
  features,
}: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleUpgrade() {
    try {
      setLoading(true);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start checkout");
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
      else throw new Error("No checkout URL received");
    } catch (err) {
      setLoading(false);
      console.error(err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-purple-500/30 bg-gray-900 p-8 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="mt-2 text-sm text-gray-400">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-200"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {features.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm text-gray-300">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-purple-400">✓</span>
                {f}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 text-sm font-semibold text-white transition hover:from-purple-500 hover:to-pink-500 disabled:opacity-50"
          >
            {loading ? "Starting checkout…" : "Upgrade to Pro"}
          </button>
          <Link
            href="/pricing"
            onClick={onClose}
            className="block text-center text-sm text-gray-400 hover:text-gray-300"
          >
            View pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
