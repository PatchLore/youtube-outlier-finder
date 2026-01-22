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

  // Default to higher cap for Pro users to unlock benefits immediately
  const [subscriberCap, setSubscriberCap] = useState<SubscriberCap>("<50k");
  const [viewFloor, setViewFloor] = useState<ViewFloor>(">=1k");
  const [sortBy, setSortBy] = useState<SortOption>("multiplier");

  // Get user and calculate plan
  const { user, isLoaded } = useUser();
  const planValue = isLoaded ? (user?.publicMetadata?.plan as string | undefined) : undefined;
  const plan: UserPlan = getUserPlan(planValue);
  const userIsPro = isLoaded && isPro(plan);

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
      if (userIsPro) {
        // Pro users: apply selected cap from dropdown
        if (subscriberCap === "<10k" && video.subscribers >= 10_000) return false;
        if (subscriberCap === "<50k" && video.subscribers >= 50_000) return false;
        if (subscriberCap === "<100k" && video.subscribers >= 100_000) return false;
        if (subscriberCap === "<250k" && video.subscribers >= 250_000) return false;
        if (subscriberCap === "<500k" && video.subscribers >= 500_000) return false;
        if (subscriberCap === "<1M" && video.subscribers >= 1_000_000) return false;
        // "nolimit" allows all channels
      } else {
        // Free users: hard cap at 50k
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

  const visibleResults = userIsPro ? filteredResults : filteredResults.slice(0, FREE_LIMIT);

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
    <main className="min-h-screen text-white overflow-x-hidden" style={{ background: "#0a0a0f" }}>
      {/* Animated gradient background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div 
          className="absolute inset-0 opacity-100 animate-pulse"
          style={{
            background: `
              radial-gradient(circle at 20% 50%, rgba(120, 40, 200, 0.15) 0%, transparent 50%),
              radial-gradient(circle at 80% 80%, rgba(200, 40, 120, 0.15) 0%, transparent 50%),
              radial-gradient(circle at 40% 90%, rgba(40, 120, 200, 0.1) 0%, transparent 50%)
            `
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-5 py-10 sm:py-16">
        {/* Hero Section */}
        <div className="text-center mb-16 sm:mb-20 pt-12 sm:pt-16">
          {/* Badge */}
          <div className="inline-block px-5 py-2 mb-8 rounded-full text-xs font-semibold uppercase tracking-wider backdrop-blur-md border border-white/10" style={{ background: "rgba(255, 255, 255, 0.05)" }}>
            🚀 Be Early. Not Lucky.
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-5 leading-tight">
            <span className="bg-gradient-to-br from-white to-purple-500 bg-clip-text text-transparent">
              Spot breakout YouTube ideas<br className="hidden sm:block" /> before they&apos;re obvious
            </span>
          </h1>

          {/* Tagline */}
          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto mb-5 leading-relaxed">
            We don&apos;t show what went viral.<br />
            We show what&apos;s going viral.
          </p>

          {/* Description */}
          <p className="text-base sm:text-lg text-white/50 max-w-3xl mx-auto mb-10 leading-relaxed">
            Most tools show you what worked months ago — after it&apos;s already saturated. We surface videos from small creators that are{" "}
            <span className="text-white/80 font-medium">blowing up right now</span>
            , so you can jump on ideas while the wave is still rising.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
            <a
              href="#search"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                boxShadow: "0 0 30px rgba(168, 85, 247, 0.4)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 0 40px rgba(168, 85, 247, 0.6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 0 30px rgba(168, 85, 247, 0.4)";
              }}
            >
              See what&apos;s breaking out now →
            </a>

            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-semibold text-white transition-all duration-300 backdrop-blur-md border border-white/20 hover:bg-white/10 hover:border-purple-500/50"
              style={{ background: "rgba(255, 255, 255, 0.05)" }}
            >
              View pricing
            </Link>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="mb-16 sm:mb-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10 sm:mb-12 text-white">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Step 1 */}
            <div 
              className="rounded-2xl p-6 text-center"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="text-2xl font-bold mb-3 text-white/90">1</div>
              <h3 className="text-lg font-semibold mb-2 text-white">We scan YouTube</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                We continuously monitor new videos across YouTube to find fresh content.
              </p>
            </div>

            {/* Step 2 */}
            <div 
              className="rounded-2xl p-6 text-center"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="text-2xl font-bold mb-3 text-white/90">2</div>
              <h3 className="text-lg font-semibold mb-2 text-white">We detect breakouts</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                We compare views against channel size to spot videos that are outperforming expectations.
              </p>
            </div>

            {/* Step 3 */}
            <div 
              className="rounded-2xl p-6 text-center"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="text-2xl font-bold mb-3 text-white/90">3</div>
              <h3 className="text-lg font-semibold mb-2 text-white">We surface momentum</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                We show only videos that are still accelerating, not ones that already peaked.
              </p>
            </div>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-16">
          <div 
            className="relative rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 cursor-pointer group"
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
              e.currentTarget.style.boxShadow = "0 20px 60px rgba(168, 85, 247, 0.2)";
              e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            }}
          >
            <h3 className="text-xl font-bold mb-3 text-white">Live breakout signals</h3>
            <p className="text-[15px] text-white/60 leading-relaxed">Videos currently beating expectations.</p>
          </div>

          <div 
            className="relative rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 cursor-pointer group"
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
              e.currentTarget.style.boxShadow = "0 20px 60px rgba(168, 85, 247, 0.2)";
              e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            }}
          >
            <h3 className="text-xl font-bold mb-3 text-white">Fresh wins only</h3>
            <p className="text-[15px] text-white/60 leading-relaxed">No stale &quot;top of all time&quot; results.</p>
          </div>

          <div 
            className="relative rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 cursor-pointer group"
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
              e.currentTarget.style.boxShadow = "0 20px 60px rgba(168, 85, 247, 0.2)";
              e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            }}
          >
            <h3 className="text-xl font-bold mb-3 text-white">Small-creator proven</h3>
            <p className="text-[15px] text-white/60 leading-relaxed">Ideas that work without a massive audience.</p>
          </div>

          <div 
            className="relative rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 cursor-pointer group"
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
              e.currentTarget.style.boxShadow = "0 20px 60px rgba(168, 85, 247, 0.2)";
              e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            }}
          >
            <h3 className="text-xl font-bold mb-3 text-white">High signal over noise</h3>
            <p className="text-[15px] text-white/60 leading-relaxed">Punch-above-weight beats raw view counts.</p>
          </div>
        </div>

        {/* Why Timing Matters Section */}
        <div 
          className="rounded-3xl p-12 sm:p-16 mt-10"
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.08)"
          }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold mb-5 text-white">Why timing matters</h2>
          <p className="text-base sm:text-lg text-white/60 leading-relaxed">
            The difference between a successful content strategy and wasted effort often comes down to timing. By the time most creators discover a trend, it&apos;s already oversaturated. Our algorithm identifies momentum early, giving you the competitive edge to create content while there&apos;s still opportunity in the market.
          </p>
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
                Your saved searches power weekly email digests with personalized outlier recommendations (Pro feature)
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
              Pro feature: Save searches and receive weekly email digests with personalized outlier recommendations
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
              <label className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400">Subscriber cap</span>
                  <div className="relative">
                    <select
                      value={subscriberCap}
                      onChange={(e) =>
                        setSubscriberCap(e.target.value as SubscriberCap)
                      }
                      disabled={!userIsPro}
                      title={!userIsPro ? "Pro feature: Filter by subscriber cap to focus on channels your size" : undefined}
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
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[0.6rem] font-semibold px-1 rounded" title="Pro feature: Filter by subscriber cap to focus on channels your size">
                        Pro
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[0.65rem] text-neutral-500 leading-tight">
                  {userIsPro 
                    ? "Focus on replicable ideas from channels your size. Higher caps show what works at scale."
                    : "Free users see results from channels ≤50k. Pro unlocks unlimited results and custom subscriber filters."}
                </p>
              </label>

              <label className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400">Minimum traction</span>
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
                </div>
                <p className="text-[0.65rem] text-neutral-500 leading-tight">
                  Set the minimum view count threshold to focus on videos with meaningful traction.
                </p>
              </label>
            </div>

            <div className="flex flex-col gap-1 mt-1 sm:mt-0">
              <span className="text-xs text-neutral-400">Sorted by breakout performance</span>
              <p className="text-[0.65rem] text-neutral-500 leading-tight">
                Videos ranked by performance relative to channel size. Higher scores mean stronger breakout signals.
              </p>
            </div>
          </div>
        )}


        {hasBaseResults && !hasFilteredResults && (
          <p className="text-center text-sm text-neutral-500 mb-4">
            No outliers match these filters.
          </p>
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

            {isFreeLimitReached && !userIsPro && (
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
                  Showing {userIsPro ? filteredResults.length : 5} of {filteredResults.length} breakout videos. {!userIsPro && "Upgrade to Pro to see all results."}
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
                  {loading ? "Loading..." : "Upgrade to Pro"}
                </button>
              </div>
            )}

            {hasVisibleResults && (
              <div className="mt-4 max-w-3xl mx-auto text-center">
                <p className="text-xs text-neutral-500">
                  {userIsPro 
                    ? "Pro: Unlimited results, saved searches, and weekly email digests"
                    : "Free: Up to 5 results per search. Pro unlocks unlimited results, saved searches, and weekly email digests."}
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
