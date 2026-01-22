"use client";

import { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { getUserPlan, isPro, type UserPlan } from "@/lib/auth";

type OutlierResult = {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  views: number;
  subscribers: number;
  multiplier: number;
  outlier: boolean;
};

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

function getMultiplierBadgeColor(multiplier: number): string {
  if (multiplier >= 50) return "bg-purple-500/20 text-purple-300 border-purple-500/30";
  if (multiplier >= 25) return "bg-red-500/20 text-red-300 border-red-500/30";
  if (multiplier >= 10) return "bg-orange-500/20 text-orange-300 border-orange-500/30";
  return "bg-neutral-700/50 text-neutral-300 border-neutral-600/30";
}

function getConfidenceTier(multiplier: number): string | null {
  if (multiplier >= 50) return "💎 Breakout";
  if (multiplier >= 25) return "🚀 Strong";
  if (multiplier >= 10) return "🔥 Promising";
  return null;
}

function getReplicabilityLabel(subscribers: number): {
  label: string;
  color: string;
  subtext: string;
} {
  if (subscribers < 50_000) {
    return {
      label: "🟢 High Replicability",
      color: "bg-green-500/20 text-green-300 border-green-500/30",
      subtext: "Won with zero authority",
    };
  } else if (subscribers <= 250_000) {
    return {
      label: "🟡 Mid-Range Signal",
      color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
      subtext: "Proven concept with some audience boost",
    };
  } else {
    return {
      label: "🔵 Scale-Up Signal",
      color: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      subtext: "Strong trend, requires serious execution",
    };
  }
}

function getExampleRefinements(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const examples: string[] = [];
  
  // Common format keywords
  const formats = ["shorts", "long form", "faceless", "talking head", "gameplay", "reaction", "tutorial", "review", "compilation", "storytime"];
  
  // Extract potential niche keywords
  const nicheWords = lowerQuery.split(/\s+/).filter(word => word.length > 2);
  
  // Generate combinations
  if (nicheWords.length > 0) {
    const niche = nicheWords[0];
    examples.push(`${niche} shorts`);
    examples.push(`${niche} faceless`);
    examples.push(`${niche} tutorial`);
    if (nicheWords.length > 1) {
      examples.push(`${nicheWords[0]} ${nicheWords[1]} shorts`);
    }
  }
  
  // Add generic format suggestions if query doesn't contain format keywords
  if (!formats.some(format => lowerQuery.includes(format))) {
    examples.push(`${query} shorts`);
    examples.push(`${query} faceless`);
  }
  
  // Ensure we have at least 3-5 examples
  const defaultExamples = [
    `${query} shorts`,
    `${query} faceless`,
    `${query} tutorial`,
    `${query} compilation`,
    `${query} reaction`
  ];
  
  // Return unique examples, prioritizing generated ones
  const unique = [...new Set([...examples, ...defaultExamples])];
  return unique.slice(0, 5);
}

const FREE_LIMIT = 5;

type SubscriberCap = "<10k" | "<50k" | "<100k" | "<250k" | "<500k" | "<1M" | "nolimit";
type ViewFloor = ">=1k" | ">=5k" | ">=10k" | "nomin";
type SortOption = "multiplier" | "views";

const SAVED_SEARCHES_KEY = "youtube-outlier-saved-searches";

export function HomeClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OutlierResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<string[]>([]);

  const [subscriberCap, setSubscriberCap] = useState<SubscriberCap>("<50k");
  const [viewFloor, setViewFloor] = useState<ViewFloor>(">=1k");
  const [sortBy, setSortBy] = useState<SortOption>("multiplier");
  const [includeScaleUpChannels, setIncludeScaleUpChannels] = useState(false);
  const [showScaleUpWarning, setShowScaleUpWarning] = useState(false);

  // Get user and calculate plan
  const { user } = useUser();
  const userEmail = user?.emailAddresses[0]?.emailAddress;
  const publicMetadata = user?.publicMetadata;
  const plan: UserPlan = getUserPlan(userEmail, publicMetadata);
  const userIsPro = isPro(plan);

  // Load saved searches from localStorage on mount
  useEffect(() => {
    if (userIsPro && typeof window !== "undefined") {
      const saved = localStorage.getItem(SAVED_SEARCHES_KEY);
      if (saved) {
        try {
          setSavedSearches(JSON.parse(saved));
        } catch {
          // Invalid JSON, ignore
        }
      }
    }
  }, []);

  // Save searches to localStorage whenever they change
  useEffect(() => {
    if (userIsPro && typeof window !== "undefined") {
      localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(savedSearches));
    }
  }, [savedSearches, userIsPro]);

  function saveSearch() {
    const trimmed = query.trim();
    if (!trimmed || !userIsPro) return;
    
    if (!savedSearches.includes(trimmed)) {
      setSavedSearches([...savedSearches, trimmed]);
    }
  }

  function deleteSearch(searchQuery: string) {
    if (!userIsPro) return;
    setSavedSearches(savedSearches.filter((q) => q !== searchQuery));
  }

  function loadSearch(searchQuery: string) {
    if (!userIsPro) return;
    setQuery(searchQuery);
    // Trigger search automatically
    const form = document.querySelector("form");
    if (form) {
      form.requestSubmit();
    }
  }

  function handleScaleUpToggle(enabled: boolean) {
    setIncludeScaleUpChannels(enabled);
    if (enabled) {
      setShowScaleUpWarning(true);
    }
  }

  async function handleCheckout() {
    console.log("handleCheckout called");
    try {
      console.log("Starting checkout...");
      setLoading(true);
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("Checkout response:", response.status, response.statusText);

      if (!response.ok) {
        const data = await response.json();
        console.error("Checkout error:", data);
        throw new Error(data.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      console.log("Checkout URL received:", url);
      if (url) {
        window.location.href = url;
      } else {
        console.error("No checkout URL in response");
        throw new Error("No checkout URL received");
      }
    } catch (err: any) {
      console.error("Checkout exception:", err);
      setError(err.message || "Failed to start checkout. Please try again.");
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) {
      setError("Please enter a search query.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error || "Unable to search for outliers. Please try again later.";
        throw new Error(message);
      }

      const data = await res.json();
      setResults(data || []);
    } catch (err: any) {
      setError(err.message || "Unable to search for outliers. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredResults = [...results]
    .filter((video) => {
      // Subscriber cap logic
      if (userIsPro && includeScaleUpChannels) {
        // Scale-up toggle is ON: respect the selected cap
        if (subscriberCap === "<10k" && video.subscribers >= 10_000) return false;
        if (subscriberCap === "<50k" && video.subscribers >= 50_000) return false;
        if (subscriberCap === "<100k" && video.subscribers >= 100_000) return false;
        if (subscriberCap === "<250k" && video.subscribers >= 250_000) return false;
        if (subscriberCap === "<500k" && video.subscribers >= 500_000) return false;
        if (subscriberCap === "<1M" && video.subscribers >= 1_000_000) return false;
        // "nolimit" allows all channels
      } else {
        // Scale-up toggle is OFF (or free user): cap at 50k
        if (video.subscribers >= 50_000) return false;
      }
      // View floor
      if (viewFloor === ">=1k" && video.views < 1_000) return false;
      if (viewFloor === ">=5k" && video.views < 5_000) return false;
      if (viewFloor === ">=10k" && video.views < 10_000) return false;
      return true;
    })
    .sort((a, b) => {
      // Always sort by virality multiplier first (efficiency over raw views)
      return b.multiplier - a.multiplier;
    });

  const visibleResults = filteredResults.slice(0, FREE_LIMIT);

  const hasBaseResults = results.length > 0;
  const hasFilteredResults = filteredResults.length > 0;
  const hasVisibleResults = visibleResults.length > 0;
  const isFreeLimitReached = filteredResults.length > FREE_LIMIT;
  const areFiltersActive = (userIsPro && subscriberCap !== "<50k") || viewFloor !== ">=1k";

  // Debug: Log when button should be visible
  useEffect(() => {
    if (isFreeLimitReached) {
      console.log("Unlock button should be visible. filteredResults.length:", filteredResults.length, "FREE_LIMIT:", FREE_LIMIT);
    }
  }, [isFreeLimitReached, filteredResults.length]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        {/* Subtle background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="mx-auto h-[420px] w-[720px] -translate-y-24 rounded-full bg-zinc-800/20 blur-3xl" />
        </div>

        <div className="relative">
          {/* Hero */}
          <section className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-semibold tracking-wide text-zinc-200">
              BE EARLY. NOT LUCKY.
              <span className="h-1 w-1 rounded-full bg-zinc-500" />
              Live breakout signals
            </p>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
              Spot breakout YouTube ideas before they're obvious
            </h1>

            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-left sm:p-6">
              <p className="text-lg font-medium leading-relaxed text-zinc-100">
                We don't show what went viral.
                <br />
                <span className="text-zinc-300">We show what's going viral.</span>
              </p>
            </div>

            <p className="mt-6 text-base leading-relaxed text-zinc-300 sm:text-lg">
              Most tools show you what worked months ago — after it's already
              saturated. We surface videos from small creators that are{" "}
              <span className="text-zinc-100 font-medium">blowing up right now</span>
              , so you can jump on ideas while the wave is still rising.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#search"
                className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-50 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-200 sm:w-auto"
              >
                See what's breaking out now →
              </a>

              <Link
                href="/pricing"
                className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900 sm:w-auto"
              >
                View pricing
              </Link>
            </div>

            {/* Value bullets */}
            <div className="mt-12 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-left">
                <p className="text-sm font-semibold text-zinc-100">
                  Live breakout signals
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  Videos currently beating expectations.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-left">
                <p className="text-sm font-semibold text-zinc-100">
                  Fresh wins only
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  No stale "top of all time" results.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-left">
                <p className="text-sm font-semibold text-zinc-100">
                  Small-creator proven
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  Ideas that work without a massive audience.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-left">
                <p className="text-sm font-semibold text-zinc-100">
                  High signal over noise
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  Punch-above-weight beats raw view counts.
                </p>
              </div>
            </div>

            {/* Timing section */}
            <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-left">
              <h2 className="text-base font-semibold text-zinc-100">
                Why timing matters
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                Most YouTube tools show what worked months ago — by the time you
                see it, 100 creators have already copied the idea.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                We focus on what's working{" "}
                <span className="text-zinc-100 font-medium">right now</span> —
                videos still gaining momentum, before the wave peaks.
              </p>
              <p className="mt-4 text-sm font-semibold text-zinc-100">
                If you're second or third to a breakout, you win.
                <br />
                If you're 50th, you're noise.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Search Section */}
      <div id="search" className="mx-auto max-w-7xl px-6 pb-16">

        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-8 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by niche + format (e.g. 'gaming horror', 'roblox myths')"
              className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/70 focus:border-red-500/70 placeholder:text-neutral-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="shrink-0 rounded-md bg-red-500 text-sm font-medium px-4 py-2 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          <p className="text-xs text-neutral-500 text-center">
            Combine niche and format for better results (e.g. "faceless youtube", "minecraft shorts")
          </p>
          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}
        </form>

        {/* Saved Searches Section */}
        {userIsPro && savedSearches.length > 0 && (
          <div className="max-w-2xl mx-auto mb-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-neutral-200">Saved Searches</h3>
                <p className="text-xs text-neutral-500">
                  {savedSearches.length} {savedSearches.length === 1 ? "search" : "searches"}
                </p>
              </div>
              <p className="text-xs text-neutral-500 mb-3">
                Saved searches power your weekly personalized outlier feed (Pro)
              </p>
              <div className="flex flex-wrap gap-2">
                {savedSearches.map((savedQuery) => (
                  <div
                    key={savedQuery}
                    className="flex items-center gap-1 bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1 text-xs"
                  >
                    <button
                      onClick={() => loadSearch(savedQuery)}
                      className="text-neutral-300 hover:text-neutral-100 transition-colors"
                    >
                      {savedQuery}
                    </button>
                    <button
                      onClick={() => deleteSearch(savedQuery)}
                      className="text-neutral-500 hover:text-red-400 transition-colors ml-1"
                      title="Remove saved search"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Saved Searches Info for Free Users */}
        {!userIsPro && hasBaseResults && (
          <div className="max-w-2xl mx-auto mb-4">
            <p className="text-xs text-neutral-500 text-center">
              Pro users can save searches to power their weekly personalized outlier feed
            </p>
          </div>
        )}

        {/* Save Search Button */}
        {userIsPro && hasBaseResults && query.trim() !== "" && (
          <div className="max-w-2xl mx-auto mb-4">
            <button
              onClick={saveSearch}
              disabled={savedSearches.includes(query.trim())}
              className="text-xs text-neutral-400 hover:text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={savedSearches.includes(query.trim()) ? "Search already saved" : "Save this search"}
            >
              {savedSearches.includes(query.trim()) ? "✓ Saved" : "+ Save this search"}
            </button>
          </div>
        )}

        {!loading && !error && results.length === 0 && query.trim() !== "" && (
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <p className="text-sm text-neutral-400">
              No outlier videos found for this query.
            </p>
            <p className="text-xs text-neutral-500">
              This means no videos in this niche have views that are 3× or more their channel&apos;s subscriber count. Try a different keyword or check back later as trends emerge.
            </p>
          </div>
        )}

        {hasBaseResults && (
          <div className="max-w-3xl mx-auto mb-4 flex flex-wrap gap-3 items-center justify-between text-xs text-neutral-300">
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2">
                <span className="text-neutral-400">Subscriber cap</span>
                <div className="relative">
                  <select
                    value={subscriberCap}
                    onChange={(e) =>
                      setSubscriberCap(e.target.value as SubscriberCap)
                    }
                    disabled={!userIsPro}
                    title={!userIsPro ? "Filter out channels bigger than yours (Pro)" : undefined}
                    className={`bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-500/70 ${
                      !userIsPro ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                  >
                    <option value="<10k">≤10k</option>
                    <option value="<50k">≤50k (Recommended)</option>
                    <option value="<100k">≤100k</option>
                    <option value="<250k">≤250k</option>
                    <option value="<500k">≤500k</option>
                    <option value="<1M">≤1M+</option>
                    <option value="nolimit">Unlimited</option>
                  </select>
                  {!userIsPro && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[0.6rem] font-semibold px-1 rounded" title="Filter out channels bigger than yours (Pro)">
                      Pro
                    </span>
                  )}
                </div>
              </label>

              <label className="flex items-center gap-2">
                <span className="text-neutral-400">View floor</span>
                <select
                  value={viewFloor}
                  onChange={(e) => setViewFloor(e.target.value as ViewFloor)}
                  className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-500/70"
                >
                  <option value=">=1k">≥ 1,000</option>
                  <option value=">=5k">≥ 5,000</option>
                  <option value=">=10k">≥ 10,000</option>
                  <option value="nomin">No minimum</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-2 mt-1 sm:mt-0">
              <span className="text-xs text-neutral-400">Sorted by highest multiplier</span>
            </div>
          </div>
        )}

        {/* Advanced Toggle: Include Scale-Up Channels */}
        {hasBaseResults && userIsPro && (
          <div className="max-w-3xl mx-auto mb-4">
            <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeScaleUpChannels}
                onChange={(e) => handleScaleUpToggle(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-red-500 focus:ring-1 focus:ring-red-500/70"
              />
              <span>Include Scale-Up Channels (Advanced)</span>
            </label>
          </div>
        )}

        {/* Scale-Up Warning Message */}
        {showScaleUpWarning && includeScaleUpChannels && (
          <div className="max-w-3xl mx-auto mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-yellow-400 text-sm">⚠️</span>
              <div className="flex-1">
                <p className="text-xs text-yellow-300 font-medium mb-1">
                  Larger channels included.
                </p>
                <p className="text-xs text-yellow-400/80">
                  These results are best used for trend study, not direct replication.
                </p>
              </div>
              <button
                onClick={() => setShowScaleUpWarning(false)}
                className="text-yellow-400/60 hover:text-yellow-400 text-xs"
                title="Dismiss warning"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {hasBaseResults && !hasFilteredResults && (
          <p className="text-center text-sm text-neutral-500 mb-4">
            No outliers match these filters.
          </p>
        )}

        {areFiltersActive && hasVisibleResults && (
          <div className="max-w-3xl mx-auto mb-4 p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg text-xs text-neutral-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p>
              Growth users can save searches and get weekly outlier digests by email.
            </p>
            <button
              type="button"
              disabled
              className="shrink-0 rounded-md bg-neutral-800 border border-neutral-700 text-xs font-medium px-3 py-1.5 hover:bg-neutral-750 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
            >
              Upgrade to Growth
            </button>
          </div>
        )}

        {hasVisibleResults && (
          <>
            <div className="max-w-3xl mx-auto mb-4">
              <p className="text-xs text-neutral-500 text-center">
                Showing recently published videos that are currently outperforming expectations
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleResults.map((video) => (
              <a
                key={video.id}
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden hover:border-neutral-700 hover:shadow-lg hover:shadow-black/20 transition-all cursor-pointer"
              >
                <div className="relative w-full aspect-video bg-neutral-800">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-neutral-100 line-clamp-2 flex-1">
                      {video.title}
                    </h3>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getMultiplierBadgeColor(
                          video.multiplier
                        )}`}
                      >
                        {video.multiplier.toFixed(1)}×
                      </span>
                      {getConfidenceTier(video.multiplier) && (
                        <span className="text-xs text-neutral-400">
                          {getConfidenceTier(video.multiplier)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400 truncate">
                    {video.channelTitle}
                  </p>
                  {(() => {
                    const replicability = getReplicabilityLabel(video.subscribers);
                    return (
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border w-fit ${replicability.color}`}
                        >
                          {replicability.label}
                        </span>
                        <p className="text-xs text-neutral-500 italic">
                          {replicability.subtext}
                        </p>
                      </div>
                    );
                  })()}
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    This video has {video.multiplier.toFixed(1)}× more views than the channel's subscriber count, indicating it broke through beyond its existing audience.
                  </p>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    <span>{formatNumber(video.views)} views</span>
                    <span>•</span>
                    <span>{formatNumber(video.subscribers)} subscribers</span>
                  </div>
                </div>
              </a>
            ))}
            </div>

            {/* Guidance for broad searches with few results */}
            {results.length > 0 && results.length <= 2 && query.trim() !== "" && (
              <div className="mt-6 max-w-3xl mx-auto p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-neutral-300 font-medium mb-1">
                      Broad niches are often saturated
                    </p>
                    <p className="text-xs text-neutral-400">
                      Few outliers found for this search. Try refining to specific formats or combinations to find breakout ideas.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 mb-2">Example refinements:</p>
                    <div className="flex flex-wrap gap-2">
                      {getExampleRefinements(query).map((refinement, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setQuery(refinement);
                            const form = document.querySelector("form");
                            if (form) {
                              form.requestSubmit();
                            }
                          }}
                          className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-xs text-neutral-300 hover:bg-neutral-750 hover:border-neutral-600 transition-colors"
                        >
                          {refinement}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isFreeLimitReached && (
              <div 
                className="mt-4 max-w-3xl mx-auto p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg text-xs text-neutral-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                style={{ pointerEvents: "auto" }}
                onClick={(e) => {
                  // Prevent parent from capturing clicks
                  if (e.target === e.currentTarget) {
                    e.stopPropagation();
                  }
                }}
              >
                <p>
                  Showing 5 of {filteredResults.length} breakout videos.
                </p>
                <button
                  type="button"
                  id="unlock-full-results-button-main"
                  data-testid="unlock-full-results-button"
                  onClick={() => {
                    console.log("🔴 MAIN PAGE BUTTON CLICKED - Direct onClick handler");
                    handleCheckout();
                  }}
                  disabled={loading}
                  style={{ pointerEvents: "auto", zIndex: 10, position: "relative", cursor: "pointer" }}
                  className="shrink-0 rounded-md bg-red-500/90 text-xs font-semibold px-3 py-1.5 text-white hover:bg-red-500 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Loading..." : "Unlock full results"}
                </button>
              </div>
            )}

            {hasVisibleResults && (
              <div className="mt-4 max-w-3xl mx-auto text-center">
                <p className="text-xs text-neutral-500">
                  Pro users see all outliers + unlock subscriber filters
                </p>
              </div>
            )}

          </>
        )}

        <div className="mt-10 max-w-2xl mx-auto bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-5">
          <div className="space-y-3 text-center sm:text-left">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-neutral-50">
                Weekly Outlier Digest
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400">
                Get breakout YouTube ideas from small channels before they go mainstream.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <input
                type="email"
                disabled
                placeholder="you@example.com"
                className="w-full rounded-md bg-neutral-950 border border-neutral-800 px-3 py-2 text-xs sm:text-sm text-neutral-400 placeholder:text-neutral-600 cursor-not-allowed"
              />
              <button
                type="button"
                disabled
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-md bg-red-500/90 text-xs sm:text-sm font-semibold px-4 py-2 text-white disabled:opacity-70 disabled:cursor-not-allowed"
              >
                Join the waitlist
              </button>
            </div>
            <p className="text-[0.7rem] sm:text-xs text-neutral-500">
              No spam. Launching soon.
            </p>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-600">
          One breakout idea can outperform months of guesswork.
        </p>
      </div>
    </main>
  );
}
