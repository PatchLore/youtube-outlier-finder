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
  publishedAt?: string | null;
  // Tier classification metadata (from backend)
  outlierTier?: string[] | null;
  // Velocity and engagement metrics
  viewsPerDay?: number | null;
  likeRatio?: number | null;
  // Niche context
  nicheAverageMultiplier?: number | null;
  // Near-miss metadata (for soft landing UI)
  reason?: string | null;
};

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

function getDaysAgo(publishedAt: string | null | undefined): number | null {
  if (!publishedAt) return null;
  const published = new Date(publishedAt);
  if (isNaN(published.getTime())) return null;
  const now = new Date();
  const diffTime = now.getTime() - published.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
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

function getTierBadgeInfo(tier: string): {
  label: string;
  icon: string;
  color: string;
  explanation: string;
} | null {
  switch (tier) {
    case "breakout":
      return {
        label: "Breakout",
        icon: "💎",
        color: "bg-purple-500/20 text-purple-300 border-purple-500/30",
        explanation: "3×+ multiplier — significantly outperforming channel size",
      };
    case "emerging":
      return {
        label: "Emerging",
        icon: "📈",
        color: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        explanation: "High velocity — gaining views faster than expected",
      };
    case "high_signal":
      return {
        label: "High Signal",
        icon: "⚡",
        color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
        explanation: "Strong engagement — unusually high like-to-view ratio",
      };
    case "niche_outlier":
      return {
        label: "Niche Outlier",
        icon: "🎯",
        color: "bg-green-500/20 text-green-300 border-green-500/30",
        explanation: "Outperforming niche average — stands out in this search",
      };
    default:
      return null;
  }
}

function getPrimaryTier(tiers: string[] | null | undefined): string | null {
  if (!tiers || tiers.length === 0) return null;
  // Priority order: breakout > emerging > high_signal > niche_outlier
  if (tiers.includes("breakout")) return "breakout";
  if (tiers.includes("emerging")) return "emerging";
  if (tiers.includes("high_signal")) return "high_signal";
  if (tiers.includes("niche_outlier")) return "niche_outlier";
  return tiers[0]; // Fallback to first tier
}

function buildExplanation(video: OutlierResult): string {
  const parts: string[] = [];
  
  // Start with tier explanation if available
  const primaryTier = getPrimaryTier(video.outlierTier);
  if (primaryTier) {
    const tierInfo = getTierBadgeInfo(primaryTier);
    if (tierInfo) {
      parts.push(tierInfo.explanation);
    }
  }
  
  // Add velocity signal if high (threshold: >500 views/day indicates high velocity)
  if (video.viewsPerDay !== null && video.viewsPerDay !== undefined && video.viewsPerDay > 500) {
    parts.push("High velocity");
  }
  
  // Add engagement signal if strong (threshold: >2% like ratio indicates strong engagement)
  if (video.likeRatio !== null && video.likeRatio !== undefined && video.likeRatio > 0.02) {
    parts.push("Strong engagement");
  }
  
  // If we have any metadata-based explanation, use it
  if (parts.length > 0) {
    return parts.join(" • ");
  }
  
  // Fallback to original explanation
  return `This video has ${video.multiplier.toFixed(1)}× more views than the channel's subscriber count, indicating it broke through beyond its existing audience.`;
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

function needsRefinement(query: string): boolean {
  const trimmed = query.trim();
  const words = trimmed.split(/\s+/);
  const lowerQuery = trimmed.toLowerCase();
  
  // Check if query is too long (> 3 words)
  if (words.length > 3) return true;
  
  // Check for restrictive keywords
  const restrictiveKeywords = ["best", "top", "2024", "2025"];
  return restrictiveKeywords.some(keyword => lowerQuery.includes(keyword));
}

function generateRefinementSuggestions(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const words = query.split(/\s+/).filter(w => w.trim().length > 0);
  
  // 1. Core topic: Remove restrictive keywords
  const restrictiveWords = ["best", "top", "2024", "2025", "the", "a", "an"];
  const coreWords = words.filter(word => 
    !restrictiveWords.includes(word.toLowerCase())
  );
  const coreTopic = coreWords.join(" ").trim();
  
  // 2. Format angle: Add format keyword
  const formatKeywords = ["reviews", "explained", "shorts", "tutorial", "guide"];
  let formatSuggestion = "";
  if (coreTopic) {
    // Check if query already has a format keyword
    const hasFormat = formatKeywords.some(f => lowerQuery.includes(f));
    if (!hasFormat) {
      formatSuggestion = `${coreTopic} reviews`;
    } else {
      // Replace existing format or add new one
      formatSuggestion = `${coreTopic} explained`;
    }
  }
  
  // 3. Adjacent niche: Simple synonym/keyword replacement
  const synonymMap: Record<string, string> = {
    "apps": "tools",
    "app": "tools",
    "productivity": "Notion alternatives",
    "gaming": "gameplay",
    "video": "content",
    "channel": "creator",
  };
  
  let adjacentNiche = "";
  if (coreTopic) {
    const coreLower = coreTopic.toLowerCase();
    
    // Special case: "productivity apps" -> "Notion alternatives"
    if (coreLower.includes("productivity") && (coreLower.includes("app") || coreLower.includes("tool"))) {
      adjacentNiche = "Notion alternatives";
    } else {
      // Try to find a synonym replacement
      for (const [key, value] of Object.entries(synonymMap)) {
        if (coreLower.includes(key)) {
          adjacentNiche = coreLower.replace(new RegExp(key, "gi"), value);
          break;
        }
      }
      
      // If no synonym found, try a simple variation
      if (!adjacentNiche && coreWords.length > 0) {
        if (coreLower.includes("app")) {
          adjacentNiche = coreLower.replace(/app(s)?/gi, "tools");
        } else {
          // Generic: add "alternatives" or similar
          adjacentNiche = `${coreWords[0]} alternatives`;
        }
      }
    }
  }
  
  // Return suggestions, filtering out empty ones and ensuring uniqueness
  const suggestions = [coreTopic, formatSuggestion, adjacentNiche]
    .filter(s => s && s.length > 0)
    .filter((s, idx, arr) => arr.indexOf(s) === idx); // Remove duplicates
  
  return suggestions.slice(0, 3);
}

const FREE_LIMIT = 5;

type SubscriberCap = "<10k" | "<50k" | "<100k" | "<250k" | "<500k" | "<1M" | "nolimit";
type ViewFloor = ">=1k" | ">=5k" | ">=10k" | "nomin";
type SortOption = "multiplier" | "views";
type SearchMode = "momentum" | "proven";

const SAVED_SEARCHES_KEY = "youtube-outlier-saved-searches";

export function HomeClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OutlierResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<string[]>([]);
  const [nearMisses, setNearMisses] = useState<(OutlierResult & { reason?: string })[]>([]);
  const [showNearMisses, setShowNearMisses] = useState(false);
  const [dismissedSoftLanding, setDismissedSoftLanding] = useState(false);
  const [searchSavedConfirmation, setSearchSavedConfirmation] = useState(false);

  // Default to higher cap for Pro users to unlock benefits immediately
  const [subscriberCap, setSubscriberCap] = useState<SubscriberCap>("<50k");
  const [viewFloor, setViewFloor] = useState<ViewFloor>(">=1k");
  const [sortBy, setSortBy] = useState<SortOption>("multiplier");
  const [searchMode, setSearchMode] = useState<SearchMode>("momentum");

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

  function handleSaveSearchForAlerts() {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (userIsPro) {
      // Save the search
      if (!savedSearches.includes(trimmed)) {
        setSavedSearches([...savedSearches, trimmed]);
      }
      setSearchSavedConfirmation(true);
      // Clear confirmation after 5 seconds
      setTimeout(() => setSearchSavedConfirmation(false), 5000);
    } else {
      // Free user: trigger upgrade flow
      handleCheckout();
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

  function handleExampleSearch(exampleQuery: string) {
    setQuery(exampleQuery);
    // Trigger search automatically
    const form = document.querySelector("form");
    if (form) {
      form.requestSubmit();
    }
  }


  async function handleCheckout() {
    try {
      setLoading(true);
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (err: any) {
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
    setNearMisses([]); // Clear nearMisses on new search
    setShowNearMisses(false); // Reset opt-in state
    setDismissedSoftLanding(false); // Reset dismissal state
    setSearchSavedConfirmation(false); // Reset confirmation

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&mode=${searchMode || "momentum"}`);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error || "Unable to search for outliers. Please try again later.";
        throw new Error(message);
      }

      const data = await res.json();
      // Handle response format: array (normal) or object with results + nearMisses
      if (Array.isArray(data)) {
        setResults(data || []);
        setNearMisses([]);
      } else {
        setResults(data.results || []);
        setNearMisses(data.nearMisses || []);
        // nearMisses stored but not rendered automatically (Layer 1: Soft Landing UI pending)
      }
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

  // Merge nearMisses into results if user opted in
  const resultsToDisplay = showNearMisses && nearMisses.length > 0
    ? [...filteredResults, ...nearMisses]
    : filteredResults;
  
  const visibleResults = userIsPro ? resultsToDisplay : resultsToDisplay.slice(0, FREE_LIMIT);

  const hasBaseResults = results.length > 0;
  const hasFilteredResults = filteredResults.length > 0;
  const hasVisibleResults = visibleResults.length > 0;
  const isFreeLimitReached = filteredResults.length > FREE_LIMIT;
  const areFiltersActive = (userIsPro && subscriberCap !== "<50k") || viewFloor !== ">=1k";


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
          <div className="flex items-center justify-center gap-4 text-xs text-neutral-500 mb-2">
            <span>Replicate winning video ideas</span>
            <span>•</span>
            <span>Explore rising niches</span>
          </div>
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
              className="shrink-0 inline-flex items-center justify-center rounded-xl text-sm font-semibold px-4 py-2 text-white transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                boxShadow: "0 0 30px rgba(168, 85, 247, 0.4)"
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = "0 0 40px rgba(168, 85, 247, 0.6)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 0 30px rgba(168, 85, 247, 0.4)";
              }}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          <p className="text-xs text-neutral-500 text-center">
            Combine niche and format for better results (e.g. "faceless youtube", "minecraft shorts")
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="text-xs text-neutral-600">Try:</span>
            {[
              "faceless history facts",
              "AI tools for students",
              "study with me pomodoro",
              "gaming challenge shorts",
              "productivity apps review"
            ].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExampleSearch(example)}
                className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors underline decoration-neutral-600 hover:decoration-neutral-400"
              >
                {example}
              </button>
            ))}
          </div>
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
                Pro: Saved searches and weekly email digests (coming soon) with personalized outlier recommendations
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
              Pro: Saved searches and weekly email digests (coming soon) with personalized outlier recommendations
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
              title={savedSearches.includes(query.trim()) ? "Search already saved" : "Save this search (Pro: weekly email digests coming soon)"}
            >
              {savedSearches.includes(query.trim()) ? "✓ Saved" : "+ Save search"}
            </button>
          </div>
        )}

        {/* Soft Landing: Near-miss results */}
        {!loading && !error && results.length === 0 && nearMisses.length > 0 && !dismissedSoftLanding && !showNearMisses && (
          <div className="max-w-3xl mx-auto mb-6 p-5 bg-neutral-900/50 border border-neutral-800 rounded-lg">
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-semibold text-neutral-200 mb-1">
                  No fresh breakouts in the last 30 days
                </p>
                <p className="text-xs text-neutral-400">
                  But we found {nearMisses.length} {nearMisses.length === 1 ? "video" : "videos"} that nearly qualify
                </p>
              </div>

              {/* Near-miss cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {nearMisses.map((video) => {
                  const daysAgo = video.publishedAt ? getDaysAgo(video.publishedAt) : null;
                  const reasonText = video.reason?.includes("multiplier")
                    ? `Multiplier just below threshold (${video.multiplier.toFixed(1)}×)`
                    : video.reason?.includes("published")
                    ? `Published ${daysAgo} days ago`
                    : "Near-miss";
                  
                  return (
                    <div
                      key={video.id}
                      className="bg-neutral-950 border border-neutral-700 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-medium text-neutral-300 line-clamp-2 flex-1">
                          {video.title}
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 shrink-0">
                          Near-miss
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 truncate">
                        {video.channelTitle}
                      </p>
                      <p className="text-xs text-neutral-500 italic">
                        {reasonText}
                      </p>
                      <p className="text-xs text-neutral-500 font-medium">
                        Not a full breakout
                      </p>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span>{formatNumber(video.views)} views</span>
                        <span>•</span>
                        <span>{formatNumber(video.subscribers)} subs</span>
                        <span>•</span>
                        <span>{video.multiplier.toFixed(1)}×</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Controls */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowNearMisses(true)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
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
                  Show these anyway
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedSoftLanding(true)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-300 backdrop-blur-md border border-white/20 hover:bg-white/10"
                  style={{ background: "rgba(255, 255, 255, 0.05)" }}
                >
                  Keep strict filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search Refinement Hint - Show when strict results === 0 and query needs refinement */}
        {!loading && !error && results.length === 0 && query.trim() !== "" && needsRefinement(query) && (
          <div className="max-w-2xl mx-auto">
            <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <div className="space-y-3">
                <p className="text-xs text-neutral-400 text-center">
                  Breakout videos rarely use formal phrases like &apos;best&apos; or years in titles.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {generateRefinementSuggestions(query).map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setQuery(suggestion);
                        const form = document.querySelector("form");
                        if (form) {
                          form.requestSubmit();
                        }
                      }}
                      className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-xs text-neutral-300 hover:bg-neutral-750 hover:border-neutral-600 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && results.length === 0 && query.trim() !== "" && (nearMisses.length === 0 || dismissedSoftLanding || showNearMisses) && (
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Primary CTA: Save Search & Get Alerted */}
            <div className="p-5 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <div className="text-center space-y-4">
                <div>
                  <p className="text-base font-semibold text-neutral-200 mb-2">
                    No fresh breakouts in this niche right now — want to know when that changes?
                  </p>
                  {searchSavedConfirmation ? (
                    <p className="text-sm text-green-400 font-medium">
                      ✓ We&apos;ll notify you when momentum appears
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSaveSearchForAlerts}
                      className="inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
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
                      Save this search & get alerted
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Secondary empty state message */}
            <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <div className="text-center space-y-3">
                <div>
                  <p className="text-sm text-neutral-300 font-medium">
                    No fresh breakouts in this niche right now.
                  </p>
                  <p className="text-xs text-neutral-400 leading-relaxed mt-2">
                    That usually means low competition — which is an opportunity.
                  </p>
                </div>
                {searchMode === "momentum" && (
                  <button
                    type="button"
                    onClick={() => setSearchMode("proven")}
                    className="text-xs text-purple-400 hover:text-purple-300 underline transition-colors"
                  >
                    Switch to Study Vault to explore proven formats
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {hasBaseResults && (
          <div className="max-w-3xl mx-auto mb-4 flex flex-wrap gap-3 items-center justify-between text-xs text-neutral-300">
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400">Show ideas already proven at scale (less replicable)</span>
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
                    ? "Keeping this off focuses on ideas small creators can realistically replicate."
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
            {/* Search Mode Toggle */}
            <div className="max-w-3xl mx-auto mb-4">
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setSearchMode("momentum")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    searchMode === "momentum"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/50"
                      : "bg-neutral-900/50 text-neutral-400 border border-neutral-800 hover:bg-neutral-800/50"
                  }`}
                >
                  🔥 Breaking Now
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode("proven")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    searchMode === "proven"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/50"
                      : "bg-neutral-900/50 text-neutral-400 border border-neutral-800 hover:bg-neutral-800/50"
                  }`}
                >
                  📚 Study Vault
                </button>
              </div>
              <p className="text-xs text-neutral-500 text-center mt-3">
                {searchMode === "momentum"
                  ? "Fresh videos gaining momentum right now"
                  : "Proven formats that outperformed expectations"}
              </p>
            </div>
            {filteredResults.length < 5 && filteredResults.length > 0 && (
              <div className="max-w-3xl mx-auto mb-4 p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                <p className="text-xs text-neutral-300 text-center leading-relaxed">
                  {searchMode === "momentum" ? (
                    <>
                      Fresh breakouts gaining traction right now.
                      <br />
                      That scarcity is the signal — fewer competitors means more opportunity.
                    </>
                  ) : (
                    <>
                      Formats that proved they can outperform.
                      <br />
                      These validated patterns show what consistently works in this niche.
                    </>
                  )}
                </p>
              </div>
            )}
            <div className="relative">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleResults.map((video, index) => (
                <a
                  key={video.id}
                  href={`https://www.youtube.com/watch?v=${video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden hover:border-neutral-700 hover:shadow-lg hover:shadow-black/20 transition-all cursor-pointer ${
                    !userIsPro && isFreeLimitReached && index === visibleResults.length - 1
                      ? "opacity-60"
                      : ""
                  }`}
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
                      <p className="text-xs text-neutral-500 text-right">
                        Getting {video.multiplier.toFixed(1)}× more views than this channel normally does.
                      </p>
                      {(() => {
                        const primaryTier = getPrimaryTier(video.outlierTier);
                        const tierInfo = primaryTier ? getTierBadgeInfo(primaryTier) : null;
                        if (tierInfo) {
                          return (
                            <div className="group relative">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${tierInfo.color} cursor-help`}
                              >
                                <span>{tierInfo.icon}</span>
                                <span>{tierInfo.label}</span>
                              </span>
                              <div className="absolute right-0 top-full mt-1 w-48 p-2 bg-neutral-900 border border-neutral-700 rounded-md text-xs text-neutral-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-lg">
                                {tierInfo.explanation}
                                {video.outlierTier && video.outlierTier.length > 1 && (
                                  <div className="mt-2 pt-2 border-t border-neutral-700">
                                    <div className="text-xs text-neutral-400">Also: {video.outlierTier.filter(t => t !== primaryTier).join(", ")}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        } else if (getConfidenceTier(video.multiplier)) {
                          return (
                            <span className="text-xs text-neutral-400">
                              {getConfidenceTier(video.multiplier)}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-neutral-400 truncate">
                      {video.channelTitle}
                    </p>
                    {(() => {
                      const daysAgo = getDaysAgo(video.publishedAt);
                      const isResurrected = daysAgo !== null && daysAgo > 180 && searchMode === "momentum";
                      return (
                        <div className="flex items-center gap-2 shrink-0">
                          {isResurrected && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                              Resurrected
                            </span>
                          )}
                          {daysAgo !== null && (
                            <span className="text-xs text-neutral-500 whitespace-nowrap">
                              Published {daysAgo} {daysAgo === 1 ? "day" : "days"} ago
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Compact Signals Row */}
                  {((video.viewsPerDay !== null && video.viewsPerDay !== undefined) || 
                    (video.likeRatio !== null && video.likeRatio !== undefined)) && (
                    <div className="flex items-center gap-3 text-xs text-neutral-500">
                      {video.viewsPerDay !== null && video.viewsPerDay !== undefined && (
                        <span className="flex items-center gap-1">
                          <span className="text-neutral-400">📈</span>
                          <span>
                            {video.viewsPerDay >= 1000
                              ? `${(video.viewsPerDay / 1000).toFixed(1)}k`
                              : Math.round(video.viewsPerDay).toLocaleString()}{" "}
                            views/day
                          </span>
                        </span>
                      )}
                      {video.likeRatio !== null && video.likeRatio !== undefined && (
                        <span className="flex items-center gap-1">
                          <span className="text-neutral-400">⚡</span>
                          <span>{(video.likeRatio * 100).toFixed(1)}% engagement</span>
                        </span>
                      )}
                    </div>
                  )}
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
                    {buildExplanation(video)}
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
              {!userIsPro && isFreeLimitReached && (
                <>
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
                    style={{
                      background: "linear-gradient(to top, rgba(10, 10, 15, 0.95) 0%, rgba(10, 10, 15, 0.5) 50%, transparent 100%)"
                    }}
                  />
                  <div className="mt-3 text-center">
                    <p className="text-xs text-neutral-400">
                      There are {filteredResults.length - FREE_LIMIT} more {searchMode === "momentum" ? "fresh breakout" : "proven format"}{filteredResults.length - FREE_LIMIT === 1 ? "" : "s"} hidden.
                    </p>
                  </div>
                </>
              )}
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
                  Showing {userIsPro ? filteredResults.length : 5} of {filteredResults.length} {searchMode === "momentum" ? "fresh breakouts" : "proven formats"}{!userIsPro && ". Upgrade to Pro to see all results"}
                </p>
                <button
                  type="button"
                  id="unlock-full-results-button-main"
                  data-testid="unlock-full-results-button"
                  onClick={() => {
                    handleCheckout();
                  }}
                  disabled={loading}
                  style={{ 
                    pointerEvents: "auto", 
                    zIndex: 10, 
                    position: "relative", 
                    cursor: "pointer",
                    background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                    boxShadow: "0 0 30px rgba(168, 85, 247, 0.4)"
                  }}
                  className="shrink-0 inline-flex items-center justify-center rounded-xl text-xs font-semibold px-3 py-1.5 text-white transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.boxShadow = "0 0 40px rgba(168, 85, 247, 0.6)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 0 30px rgba(168, 85, 247, 0.4)";
                  }}
                >
                  {loading ? "Loading..." : "Upgrade to Pro"}
                </button>
              </div>
            )}

            {hasVisibleResults && (
              <div className="mt-4 max-w-3xl mx-auto text-center">
                <p className="text-xs text-neutral-500">
                  {userIsPro 
                    ? "Pro: Unlimited results, saved searches, and weekly email digests (coming soon)"
                    : "Free: Up to 5 results per search. Pro: Unlimited results, saved searches, and weekly email digests (coming soon)."}
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
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl text-xs sm:text-sm font-semibold px-4 py-2 text-white transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                  boxShadow: "0 0 30px rgba(168, 85, 247, 0.4)"
                }}
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
