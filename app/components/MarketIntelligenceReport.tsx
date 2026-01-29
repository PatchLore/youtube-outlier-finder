"use client";

import { useState } from "react";
import { AuthAlertModal } from "./modals/AuthAlertModal";

type RecommendedAlternative = {
  query: string;
  count: number;
};

export function MarketIntelligenceReport({
  alternatives,
  nicheName,
  onSelect,
}: {
  alternatives: RecommendedAlternative[];
  nicheName: string;
  onSelect: (query: string) => void;
}) {
  const [showMonitorModal, setShowMonitorModal] = useState(false);

  if (!alternatives || alternatives.length === 0) return null;

  return (
    <div className="mt-6 bg-gray-800/30 border border-gray-700 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">🎯 Recommended Alternatives</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {alternatives.map((alt) => (
          <button
            key={alt.query}
            onClick={() => onSelect(alt.query)}
            className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-700 hover:border-purple-500/50 text-sm transition-all"
          >
            <span className="text-gray-200">{alt.query}</span>
            <span className="text-purple-400">— {alt.count} Breakouts 🔥</span>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowMonitorModal(true)}
          className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm font-semibold text-purple-100 transition hover:border-purple-500/60 hover:bg-purple-500/20"
        >
          🔔 Monitor this Niche
        </button>
      </div>

      <AuthAlertModal
        isOpen={showMonitorModal}
        nicheName={nicheName}
        onClose={() => setShowMonitorModal(false)}
      />
    </div>
  );
}
