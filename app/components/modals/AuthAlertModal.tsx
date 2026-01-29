import { useState } from "react";

export function AuthAlertModal({
  isOpen,
  nicheName,
  onClose,
}: {
  isOpen: boolean;
  nicheName: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-purple-500/30 bg-gray-900 p-8 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold text-white">
              Track {nicheName} 24/7
            </h3>
            <p className="mt-2 text-sm text-gray-400">
              Get an email the second a small channel hits a 3x breakout.
            </p>
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

        <div className="mt-6 space-y-4">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-3 text-sm font-semibold text-white transition hover:border-purple-500/50"
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">or</span>
            <div className="h-px flex-1 bg-gray-800" />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-400">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-purple-500/60 focus:outline-none"
            />
          </div>

          <button
            type="button"
            className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 text-sm font-semibold text-white transition hover:shadow-lg hover:shadow-purple-500/30"
          >
            Start monitoring
          </button>
        </div>
      </div>
    </div>
  );
}
