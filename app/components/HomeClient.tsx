"use client";

import { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { getUserPlan, isPro, type UserPlan } from "@/lib/auth";
import { MarketIntelligenceReport } from "./MarketIntelligenceReport";

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
  // Confidence tier: "BREAKOUT" (3×+) or "RISING" (2.0-2.9×)
  confidenceTier?: "BREAKOUT" | "RISING";
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

function getNicheStatusColor(status: NicheStatus): string {
  switch (status) {
    case "SATURATED":
      return "bg-red-500/20 text-red-300 border-red-500/30";
    case "QUIET":
      return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "EMERGING":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    case "EVENT_DRIVEN":
      return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "DECLINING":
      return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    default:
      return "bg-neutral-700/50 text-neutral-300 border-neutral-600/30";
  }
}

function getNicheStatusIcon(status: NicheStatus): string {
  switch (status) {
    case "SATURATED":
      return "🔥";
    case "QUIET":
      return "🌊";
    case "EMERGING":
      return "📈";
    case "EVENT_DRIVEN":
      return "⚡";
    case "DECLINING":
      return "📉";
    default:
      return "📊";
  }
}

function getDifficultyColor(level: DifficultyLevel): string {
  switch (level) {
    case "BEGINNER":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    case "INTERMEDIATE":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "EXPERT":
      return "bg-red-500/20 text-red-300 border-red-500/30";
    default:
      return "bg-neutral-700/50 text-neutral-300 border-neutral-600/30";
  }
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
const ONBOARDING_BREAKOUT_KEY = "youtube-outlier-has-breakout";
const DEMO_COMPLETED_KEY = "outlier_demo_completed";

type AdjacentOpportunity = {
  term: string;
  breakoutCount: number;
  avgMultiplier: number;
};

type SuggestedSearch = {
  query: string;
  count: number;
};

type RecommendedAlternative = {
  query: string;
  count: number;
};

type SubscriberCap = "<10k" | "<50k" | "<100k" | "<250k" | "<500k" | "<1M" | "nolimit";
type ViewFloor = ">=1k" | ">=5k" | ">=10k" | "nomin";
type SortOption = "multiplier" | "views";
type SearchMode = "momentum" | "proven";

// Niche analysis types (matching backend)
type NicheStatus = "SATURATED" | "QUIET" | "EMERGING" | "EVENT_DRIVEN" | "DECLINING";
type DifficultyLevel = "BEGINNER" | "INTERMEDIATE" | "EXPERT";

interface NicheAnalysis {
  nicheStatus: NicheStatus;
  scannedVideos: number;
  averageChannelSize: number;
  dominantChannelThreshold: number;
  averageMultiplier?: number;
  topMultiplier?: number;
  explanation: string;
  difficultyLevel: DifficultyLevel;
  suggestedSearches: string[];
}

const SAVED_SEARCHES_KEY = "youtube-outlier-saved-searches";

export function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OutlierResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<string[]>([]);
  const [nearMisses, setNearMisses] = useState<(OutlierResult & { reason?: string })[]>([]);
  const [showNearMisses, setShowNearMisses] = useState(false);
  const [dismissedSoftLanding, setDismissedSoftLanding] = useState(false);
  const [searchSavedConfirmation, setSearchSavedConfirmation] = useState(false);
  const [nicheAnalysis, setNicheAnalysis] = useState<NicheAnalysis | null>(null);
  const [risingSignals, setRisingSignals] = useState<OutlierResult[]>([]);
  const [showRisingSignals, setShowRisingSignals] = useState(false);
  const [showCheckoutSuccess, setShowCheckoutSuccess] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // Lightweight UX flag: has the user ever seen at least one 3×+ breakout?
  const [hasSeenBreakout, setHasSeenBreakout] = useState(false);
  const [hasSubmittedSearch, setHasSubmittedSearch] = useState(false);
  const [queryHistoryCount, setQueryHistoryCount] = useState(0);
  const [adjacentOpps, setAdjacentOpps] = useState<AdjacentOpportunity[]>([]);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const [showQuotaFallbackNotice, setShowQuotaFallbackNotice] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [hasSeenDemo, setHasSeenDemo] = useState(false);
  const [showDemoExplanation, setShowDemoExplanation] = useState(false);
  const [suggestedSearches, setSuggestedSearches] = useState<SuggestedSearch[]>([]);
  const [searchType, setSearchType] = useState<"strict" | "expanded" | null>(null);
  const [expandedResults, setExpandedResults] = useState<OutlierResult[]>([]);
  const [showStrictOnly, setShowStrictOnly] = useState(false);
  const [recommendedAlternatives, setRecommendedAlternatives] = useState<RecommendedAlternative[]>([]);

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

  // Check for checkout success on mount
  useEffect(() => {
    if (typeof window !== "undefined" && searchParams?.get("session_id")) {
      setShowCheckoutSuccess(true);
      // Clear the session_id from URL after showing success
      const url = new URL(window.location.href);
      url.searchParams.delete("session_id");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [searchParams, router]);

  // Auto-hide success banner after Pro is confirmed
  useEffect(() => {
    if (!showCheckoutSuccess || !userIsPro) return;
    const timeout = setTimeout(() => setShowCheckoutSuccess(false), 10000);
    return () => clearTimeout(timeout);
  }, [showCheckoutSuccess, userIsPro]);

  // While awaiting webhook sync, refresh user state periodically
  useEffect(() => {
    if (!showCheckoutSuccess || userIsPro) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [showCheckoutSuccess, userIsPro, router]);

  // Auto-dismiss rate limit notice after a short delay
  useEffect(() => {
    if (!rateLimitMessage) return;
    const timeout = setTimeout(() => setRateLimitMessage(null), 7000);
    return () => clearTimeout(timeout);
  }, [rateLimitMessage]);

  // Load onboarding state (whether user has ever seen a successful breakout search)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(ONBOARDING_BREAKOUT_KEY);
      if (stored === "true") {
        setHasSeenBreakout(true);
      }
    }
  }, []);

  // Load demo completion state
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(DEMO_COMPLETED_KEY);
      if (stored === "true") {
        setHasSeenDemo(true);
      }
    }
  }, []);

  // Fetch suggested searches (dynamic, cached)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/suggested-searches");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setSuggestedSearches(data as SuggestedSearch[]);
        }
      } catch {
        // Ignore suggestion errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute adjacent opportunities when quiet or user has explored multiple queries
  useEffect(() => {
    if (!nicheAnalysis) {
      setAdjacentOpps([]);
      return;
    }

    const isQuiet = nicheAnalysis.nicheStatus === "QUIET";
    if (!isQuiet && queryHistoryCount <= 1) {
      // Only suggest adjacents after multiple queries if not QUIET
      setAdjacentOpps([]);
      return;
    }

    const candidates = (nicheAnalysis.suggestedSearches || []).slice(0, 5);
    if (!candidates.length) {
      setAdjacentOpps([]);
      return;
    }

    let cancelled = false;

    (async () => {
      const results: AdjacentOpportunity[] = [];

      for (const term of candidates) {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&mode=momentum&rateLimitScope=adjacent`);
          if (!res.ok) continue;

          const data = await res.json();
          const rawResults: any[] = Array.isArray(data) ? data : (data.results || []);
          const breakouts = rawResults.filter((v) => typeof v?.multiplier === "number" && v.multiplier >= 3);
          if (breakouts.length < 2) continue;

          const avgMult =
            breakouts.reduce((sum, v) => sum + (v.multiplier as number), 0) / breakouts.length;

          results.push({
            term,
            breakoutCount: breakouts.length,
            avgMultiplier: avgMult,
          });

          if (results.length >= 3) break;
        } catch {
          // Ignore individual suggestion errors
        }
      }

      if (!cancelled) {
        setAdjacentOpps(results);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nicheAnalysis, queryHistoryCount]);

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
    // Trigger search directly with the provided query
    performSearch(searchQuery);
  }

  // Canonical search function - used by both manual submit and suggested searches
  async function performSearch(searchTerm: string) {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      return; // Silently return if empty (no error for programmatic calls)
    }

    setHasSearched(true); // Show Results section immediately
    setHasSubmittedSearch(true);

    const previousState = {
      results,
      nearMisses,
      nicheAnalysis,
      risingSignals,
      adjacentOpps,
      showRisingSignals,
      showNearMisses,
      dismissedSoftLanding,
      searchSavedConfirmation,
      hasSearched,
      hasSubmittedSearch,
      searchType,
      expandedResults,
      showStrictOnly,
      recommendedAlternatives,
    };

    setLoading(true);
    setError(null);
    setValidationError(null);
    setRateLimitMessage(null);
    setShowQuotaFallbackNotice(false);
    // Clear previous UI state before fetching new results
    setResults([]);
    setNearMisses([]); // Clear nearMisses on new search
    setNicheAnalysis(null); // Clear niche analysis on new search
    setRisingSignals([]); // Clear rising signals on new search
    setAdjacentOpps([]); // Clear adjacent opportunities on new search
    setShowRisingSignals(false); // Reset rising signals toggle
    setShowNearMisses(false); // Reset opt-in state
    setDismissedSoftLanding(false); // Reset dismissal state
    setSearchSavedConfirmation(false); // Reset confirmation
    setSearchType(null);
    setExpandedResults([]);
    setShowStrictOnly(false);
    setRecommendedAlternatives([]);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&mode=${searchMode || "momentum"}`);

      if (!res.ok) {
        if (res.status === 429) {
          setRateLimitMessage("Too many searches at once. Please wait a minute or upgrade for unlimited access.");
          // Restore previous UI state so results remain intact
          setResults(previousState.results);
          setNearMisses(previousState.nearMisses);
          setNicheAnalysis(previousState.nicheAnalysis);
          setRisingSignals(previousState.risingSignals);
          setAdjacentOpps(previousState.adjacentOpps);
          setShowRisingSignals(previousState.showRisingSignals);
          setShowNearMisses(previousState.showNearMisses);
          setDismissedSoftLanding(previousState.dismissedSoftLanding);
          setSearchSavedConfirmation(previousState.searchSavedConfirmation);
          setHasSearched(previousState.hasSearched);
          setHasSubmittedSearch(previousState.hasSubmittedSearch);
          setSearchType(previousState.searchType);
          setExpandedResults(previousState.expandedResults);
          setShowStrictOnly(previousState.showStrictOnly);
          setRecommendedAlternatives(previousState.recommendedAlternatives);
          return;
        }
        // Quota exceeded or server error: auto-fallback to demo so user still sees the algorithm
        if (res.status === 403 || res.status === 502) {
          console.warn("Quota hit, pivoting to demo mode");
          setShowQuotaFallbackNotice(true);
          await runDemoSearch();
          return;
        }
        const data = await res.json().catch(() => null);
        const message = data?.error || "Unable to search for outliers. Please try again later.";
        throw new Error(message);
      }

      const data = await res.json();
      // Normalize results from API (array or object) into a single results array
      let newResults: OutlierResult[] = [];
      if (Array.isArray(data)) {
        newResults = (data || []) as OutlierResult[];
        setNearMisses([]);
        setNicheAnalysis(null);
        setRisingSignals([]);
        setSearchType(null);
        setExpandedResults([]);
      } else {
        newResults = (data.results || []) as OutlierResult[];
        setNearMisses((data.nearMisses || []) as (OutlierResult & { reason?: string })[]);
        setNicheAnalysis((data.nicheAnalysis || null) as NicheAnalysis | null);
        setRisingSignals((data.risingSignals || []) as OutlierResult[]);
        setSearchType((data.searchType || null) as "strict" | "expanded" | null);
        setExpandedResults((data.searchType === "expanded" ? data.results : []) as OutlierResult[]);
        setRecommendedAlternatives((data.recommendedAlternatives || []) as RecommendedAlternative[]);
      }

      setResults(newResults);

      // If this search returned at least one breakout result (3×+), mark onboarding as complete
      const hasBreakout = newResults.some((v) => typeof v.multiplier === "number" && v.multiplier >= 3);
      if (hasBreakout && !hasSeenBreakout) {
        setHasSeenBreakout(true);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(ONBOARDING_BREAKOUT_KEY, "true");
        }
      }

      // Track how many distinct searches have returned results/analysis
      setQueryHistoryCount((prev) => prev + 1);
    } catch (err: any) {
      const message = err?.message || "Unable to search for outliers. Please try again.";
      // Quota Exceeded in message (e.g. from upstream): auto-fallback to demo
      if (/quota exceeded/i.test(message)) {
        console.warn("Quota hit, pivoting to demo mode");
        setShowQuotaFallbackNotice(true);
        await runDemoSearch();
        return;
      }
      setError(message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleExampleSearch(exampleQuery: string) {
    setQuery(exampleQuery);
    // Trigger search directly with the provided term
    performSearch(exampleQuery);
  }

  async function runDemoSearch() {
    setHasSearched(true); // Show Results section immediately
    setHasSubmittedSearch(true);
    setIsDemoMode(true);

    // Mirror core search UI behavior so the demo feels identical
    const previousState = {
      results,
      nearMisses,
      nicheAnalysis,
      risingSignals,
      adjacentOpps,
      showRisingSignals,
      showNearMisses,
      dismissedSoftLanding,
      searchSavedConfirmation,
      hasSearched,
      hasSubmittedSearch,
      searchType,
      expandedResults,
      showStrictOnly,
      recommendedAlternatives,
    };

    try {
      setLoading(true);
      setError(null);
      setValidationError(null);
      setRateLimitMessage(null);

      // Clear previous UI state before loading demo results
      setResults([]);
      setNearMisses([]);
      setNicheAnalysis(null);
      setRisingSignals([]);
      setAdjacentOpps([]);
      setShowRisingSignals(false);
      setShowNearMisses(false);
      setDismissedSoftLanding(false);
      setSearchSavedConfirmation(false);
      setSearchType(null);
      setExpandedResults([]);
      setShowStrictOnly(false);
      setRecommendedAlternatives([]);

      // Bypass any HTTP cache by adding a timestamp param
      const res = await fetch(`/api/demo-search?t=${Date.now()}`);
      if (!res.ok) {
        // Restore previous state if demo fails
        setResults(previousState.results);
        setNearMisses(previousState.nearMisses);
        setNicheAnalysis(previousState.nicheAnalysis);
        setRisingSignals(previousState.risingSignals);
        setAdjacentOpps(previousState.adjacentOpps);
        setShowRisingSignals(previousState.showRisingSignals);
        setShowNearMisses(previousState.showNearMisses);
        setDismissedSoftLanding(previousState.dismissedSoftLanding);
        setSearchSavedConfirmation(previousState.searchSavedConfirmation);
        setHasSearched(previousState.hasSearched);
        setHasSubmittedSearch(previousState.hasSubmittedSearch);
        setSearchType(previousState.searchType);
        setExpandedResults(previousState.expandedResults);
        setShowStrictOnly(previousState.showStrictOnly);
        setRecommendedAlternatives(previousState.recommendedAlternatives);
        return;
      }

      const data = await res.json();
      const demoQuery =
        typeof data?.query === "string" && data.query.trim().length > 0
          ? data.query
          : "Faceless history shorts";
      const demoResults: OutlierResult[] = Array.isArray(data)
        ? (data as OutlierResult[])
        : ((data?.results || []) as OutlierResult[]);

      setQuery(demoQuery);
      setResults(demoResults);
      if (data?.nicheAnalysis) {
        setNicheAnalysis(data.nicheAnalysis as NicheAnalysis);
      }
      if (data?.risingSignals) {
        setRisingSignals((data.risingSignals || []) as OutlierResult[]);
      }
      if (data?.searchType) {
        setSearchType(data.searchType as "strict" | "expanded" | null);
      }

      // Mark onboarding breakout state if the demo includes a 3×+ result
      const hasBreakout = demoResults.some(
        (v) => typeof v.multiplier === "number" && v.multiplier >= 3
      );
      if (hasBreakout && !hasSeenBreakout) {
        setHasSeenBreakout(true);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(ONBOARDING_BREAKOUT_KEY, "true");
        }
      }

      // Show explanation only after demo results are on screen
      if (demoResults.length > 0) {
        setTimeout(() => setShowDemoExplanation(true), 1500);
      }
    } catch {
      // Swallow demo errors so they never block normal usage
    } finally {
      setLoading(false);
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
      setValidationError("Please enter a search query.");
      return;
    }

    // Use canonical search function
    await performSearch(query);
  }

  const baseResultsForDisplay =
    searchType === "expanded" && showStrictOnly ? [] : results;

  const filteredResults = [...baseResultsForDisplay]
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
  const resultsToDisplay =
    searchType === "expanded"
      ? filteredResults
      : showNearMisses && nearMisses.length > 0
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
        {/* Pro Status Badge - Persistent indicator */}
        {userIsPro && (
          <div className="fixed top-4 right-4 z-50">
            <div className="px-3 py-1.5 rounded-full text-xs font-semibold text-white backdrop-blur-md border border-purple-500/30 shadow-lg" style={{ background: "linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)" }}>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Pro Active
              </span>
            </div>
          </div>
        )}

        {/* Post-checkout success state */}
        {showCheckoutSuccess && userIsPro && (
          <div className="max-w-2xl mx-auto mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg animate-in fade-in slide-in-from-top-4">
            <div className="flex items-start gap-3">
              <span className="text-green-400 text-xl">✓</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-300 mb-1">
                  Pro unlocked successfully
                </p>
                <p className="text-xs text-green-200/80 leading-relaxed mb-2">
                  You now have access to:
                </p>
                <ul className="text-xs text-green-200/80 space-y-1 list-disc list-inside">
                  <li>Unlimited results (no 5-video cap)</li>
                  <li>Rising Signals (early momentum detection)</li>
                  <li>Saved searches & email alerts</li>
                  <li>Market Heat Check reports</li>
                  <li>Advanced subscriber cap filters</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckoutSuccess(false)}
                className="text-green-400/60 hover:text-green-400 transition-colors"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}
        {showCheckoutSuccess && !userIsPro && (
          <div className="max-w-2xl mx-auto mb-6 p-4 bg-emerald-500/10 border border-emerald-400/30 rounded-lg animate-in fade-in slide-in-from-top-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 h-5 w-5 rounded-full border-2 border-emerald-300/40 border-t-emerald-300 animate-spin" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-200 mb-1">
                  Payment received! Syncing your upgrade... (This takes about 5-10 seconds)
                </p>
              </div>
            </div>
          </div>
        )}

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
        {!hasSeenDemo && (
          <div className="max-w-2xl mx-auto mb-8 p-6 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
            <h3 className="text-xl font-semibold mb-3">
              👋 New here? See a live breakout in action
            </h3>
            <p className="text-gray-400 mb-4">
              We&apos;ll show you a real example of videos breaking out right now,
              so you understand what we&apos;re looking for.
            </p>
            <button
              onClick={runDemoSearch}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all"
            >
              Show me a real breakout →
            </button>
          </div>
        )}

        {/* Onboarding state: curated breakout searches for first-time users */}
        {!hasSubmittedSearch && !hasSeenBreakout && (
          <div className="max-w-2xl mx-auto mb-8 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                🔥 Try a search with live breakouts
              </h2>
              <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
                These are historically active niches. Results vary, but they’re good starting points to see how breakouts emerge.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleExampleSearch("Notion templates")}
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold text-white bg-neutral-900 border border-neutral-700 hover:border-purple-500/70 hover:bg-neutral-800 transition-colors"
              >
                <span className="flex flex-col items-start leading-tight">
                  <span>Notion templates</span>
                  <span className="text-[0.7rem] text-neutral-400">(historically 4 breakouts)</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleExampleSearch("Faceless YouTube shorts")}
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold text-white bg-neutral-900 border border-neutral-700 hover:border-purple-500/70 hover:bg-neutral-800 transition-colors"
              >
                <span className="flex flex-col items-start leading-tight">
                  <span>Faceless YouTube shorts</span>
                  <span className="text-[0.7rem] text-neutral-400">(historically 7 breakouts)</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleExampleSearch("ChatGPT workflows")}
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold text-white bg-neutral-900 border border-neutral-700 hover:border-purple-500/70 hover:bg-neutral-800 transition-colors"
              >
                <span className="flex flex-col items-start leading-tight">
                  <span>ChatGPT workflows</span>
                  <span className="text-[0.7rem] text-neutral-400">(historically 3 breakouts)</span>
                </span>
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              Tip: These examples aren’t guaranteed to break out now. Start broad, then narrow.
            </p>
          </div>
        )}

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
              onChange={(e) => {
                setQuery(e.target.value);
                if (validationError) {
                  setValidationError(null);
                }
              }}
              placeholder="Enter a niche (e.g., AI Agents, Faceless Finance)..."
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
            <span className="text-xs text-neutral-600">
              🔥 Active right now (updated every 6 hours):
            </span>
            {(suggestedSearches.length > 0
              ? suggestedSearches.map((s) => ({
                  label: s.query,
                  count: s.count,
                }))
              : [
                  { label: "AI Agents", count: 5 },
                  { label: "Deep Research", count: 3 },
                  { label: "Faceless Travel", count: 2 },
                  { label: "SaaS Micro-scripts", count: 1 },
                ]
            ).map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => handleExampleSearch(example.label)}
                className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors underline decoration-neutral-600 hover:decoration-neutral-400"
              >
                {example.label}
                {example.count > 0 && (
                  <span className="ml-1 text-purple-400">({example.count} 🔥)</span>
                )}
              </button>
            ))}
          </div>
          {/* Validation error: only for explicit empty-submit before any successful search */}
          {validationError && !hasSearched && (
            <p className="text-xs text-red-400 text-center">{validationError}</p>
          )}
        {rateLimitMessage && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-3 max-w-2xl mx-auto rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-center text-xs text-red-200"
          >
            {rateLimitMessage}
          </div>
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

        {hasSearched && (
          <div className="results-container">
            {loading && (
              <div className="max-w-2xl mx-auto mb-6 p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg text-center text-neutral-400">
                Searching for outliers...
              </div>
            )}
            {error && (
              <div className="max-w-2xl mx-auto mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            {showQuotaFallbackNotice && (
              <div className="max-w-2xl mx-auto mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start justify-between gap-3">
                <p className="text-sm text-amber-200/90 flex-1">
                  <span className="font-semibold text-amber-200">Notice:</span> Live search is at capacity—showing a simulated breakout for &quot;AI Agents&quot; to demonstrate the algorithm.
                </p>
                <button
                  type="button"
                  onClick={() => setShowQuotaFallbackNotice(false)}
                  className="shrink-0 text-amber-300/80 hover:text-amber-200 transition-colors p-1"
                  aria-label="Dismiss notice"
                >
                  ×
                </button>
              </div>
            )}

        {/* Soft Landing: Near-miss results */}
        {!loading && !error && results.length === 0 && nearMisses.length > 0 && !dismissedSoftLanding && !showNearMisses && (
          <div className="max-w-3xl mx-auto mb-6 p-5 bg-neutral-900/50 border border-neutral-800 rounded-lg">
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm font-semibold text-neutral-200">
                  No fresh breakouts detected
                </p>
                <p className="text-xs text-neutral-400 leading-relaxed max-w-lg mx-auto">
                  We scanned recent videos from channels under 50k subscribers. None exceeded the 3× multiplier threshold within the last 30 days.
                </p>
                <p className="text-xs text-neutral-500">
                  Found {nearMisses.length} {nearMisses.length === 1 ? "video" : "videos"} with early momentum (2.5–2.9× multiplier)
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
                      onClick={() => handleExampleSearch(suggestion)}
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
            {/* Market Heat Check Card - Shows niche intelligence when no breakouts found */}
            {nicheAnalysis && (
              <div className="p-5 bg-neutral-900/50 border border-neutral-800 rounded-lg backdrop-blur-sm">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📊</span>
                      {nicheAnalysis.nicheStatus === "QUIET" ? (
                        <h3 className="text-base font-semibold text-white">🌊 Market Heat Check: QUIET</h3>
                      ) : (
                        <h3 className="text-base font-semibold text-white">Market Heat Check</h3>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getNicheStatusColor(nicheAnalysis.nicheStatus)}`}>
                      {getNicheStatusIcon(nicheAnalysis.nicheStatus)} {nicheAnalysis.nicheStatus}
                    </span>
                  </div>

                  {nicheAnalysis.nicheStatus === "QUIET" ? (
                    <>
                      <div className="space-y-6">
                        {/* Header */}
                        <div className="text-center">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/30 mb-4">
                            <span className="text-2xl">📊</span>
                            <span className="font-semibold text-blue-300">Market Intelligence Report</span>
                          </div>
                          <h2 className="text-2xl font-bold mb-2">
                            &quot;{query || "This search"}&quot;
                          </h2>
                          <p className="text-gray-400">
                            Status: <span className="text-blue-400 font-semibold">MATURE MARKET</span>
                          </p>
                        </div>

                        {/* Research Summary */}
                        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
                          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span>🔍</span> What We Found
                          </h3>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-purple-400">
                                {nicheAnalysis.scannedVideos}
                              </div>
                              <div className="text-xs text-gray-400">Videos Scanned</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-purple-400">
                                {nicheAnalysis.averageMultiplier ? `${nicheAnalysis.averageMultiplier}×` : "—"}
                              </div>
                              <div className="text-xs text-gray-400">Avg Multiplier</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-purple-400">
                                {nicheAnalysis.averageChannelSize ? formatNumber(nicheAnalysis.averageChannelSize) : "—"}
                              </div>
                              <div className="text-xs text-gray-400">Avg Channel Size</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-purple-400">
                                {nicheAnalysis.topMultiplier ? `${nicheAnalysis.topMultiplier}×` : "—"}
                              </div>
                              <div className="text-xs text-gray-400">Top Performer</div>
                            </div>
                          </div>

                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <p className="text-sm text-gray-300">
                              <strong className="text-white">Verdict:</strong> This niche is currently
                              dominated by established channels (avg {nicheAnalysis.averageChannelSize ? formatNumber(nicheAnalysis.averageChannelSize) : "—"} subs).
                              Videos are performing <strong className="text-yellow-400">predictably</strong>
                              {nicheAnalysis.averageMultiplier ? ` (${nicheAnalysis.averageMultiplier}× avg)` : ""} rather than breaking out (3×+ needed).
                            </p>
                          </div>
                        </div>

                        {/* What This Means */}
                        <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6">
                          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                            <span>💡</span> What This Tells You
                          </h3>
                          <ul className="space-y-2 text-sm text-gray-300">
                            <li className="flex items-start gap-2">
                              <span className="text-green-400 mt-1">✓</span>
                              <span>No small creators are breaking through here right now</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-green-400 mt-1">✓</span>
                              <span>This niche is <strong>stable/mature</strong> — not trending upward for newcomers</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-green-400 mt-1">✓</span>
                              <span>You&apos;ve just <strong>saved hours</strong> you would have wasted competing here</span>
                            </li>
                          </ul>
                        </div>
                      </div>

                      <MarketIntelligenceReport
                        alternatives={recommendedAlternatives}
                        nicheName={query || "this niche"}
                        onSelect={(term) => handleExampleSearch(term)}
                      />

                      {/* Emerging Signals (Optional STATE D) */}
                      {risingSignals.length > 0 && (
                        <div className="space-y-2 pt-4 border-t border-neutral-800">
                          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                            🔥 Emerging Signals (Not Breakouts Yet)
                          </h4>
                          <p className="text-xs text-neutral-400 leading-relaxed">
                            These videos are performing better than average but haven’t crossed the breakout threshold. They may be early indicators.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            {risingSignals.map((video) => (
                              <a
                                key={video.id}
                                href={`https://www.youtube.com/watch?v=${video.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex gap-2 bg-neutral-950 border border-neutral-800 rounded-lg p-2 hover:border-neutral-600 transition-colors"
                              >
                                <div className="w-20 h-12 bg-neutral-800 rounded overflow-hidden flex-shrink-0">
                                  <img
                                    src={video.thumbnail}
                                    alt={video.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <p className="text-xs font-medium text-neutral-200 line-clamp-2">
                                    {video.title}
                                  </p>
                                  <p className="text-[0.7rem] text-neutral-400 truncate">
                                    {video.channelTitle}
                                  </p>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-semibold border border-yellow-500/40 bg-yellow-500/10 text-yellow-200">
                                    {video.multiplier.toFixed(1)}× — Strong, but not an outlier
                                  </span>
                                </div>
                              </a>
                            ))}
                          </div>
                          <p className="text-[0.7rem] text-neutral-500 leading-relaxed">
                            These are not guaranteed opportunities. True breakouts always exceed 3×.
                          </p>
                        </div>
                      )}

                      {/* Adjacent Opportunities (STATE: Adjacent) */}
                      {adjacentOpps.length > 0 && (
                        <div className="space-y-2 pt-4 border-t border-neutral-800">
                          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                            🔍 Adjacent Opportunities
                          </h4>
                          <p className="text-xs text-neutral-400 leading-relaxed">
                            Similar audiences, stronger signals right now.
                          </p>
                          <div className="space-y-1">
                            {adjacentOpps.map((opp) => (
                              <button
                                key={opp.term}
                                type="button"
                                onClick={() => handleExampleSearch(opp.term)}
                                className="w-full text-left text-xs text-neutral-300 hover:text-white px-0 py-1"
                              >
                                {`${opp.term} — ${opp.breakoutCount} breakouts (avg ${opp.avgMultiplier.toFixed(1)}×)`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* What to try next */}
                      <div className="space-y-2 pt-4 border-t border-neutral-800">
                        <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                          What to try next
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleExampleSearch("ChatGPT study hacks")}
                            className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold text-white bg-neutral-900 border border-neutral-700 hover:border-purple-500/70 hover:bg-neutral-800 transition-colors"
                          >
                            Try &apos;ChatGPT study hacks&apos; (3 breakouts)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExampleSearch("Notion for students")}
                            className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold text-white bg-neutral-900 border border-neutral-700 hover:border-purple-500/70 hover:bg-neutral-800 transition-colors"
                          >
                            Try &apos;Notion for students&apos; (2 breakouts)
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveSearchForAlerts}
                            className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold text-white bg-neutral-900 border border-neutral-700 hover:border-purple-500/70 hover:bg-neutral-800 transition-colors"
                          >
                            Alert me when this changes
                          </button>
                        </div>
                      </div>

                      {/* Footer note */}
                      <div className="pt-4 border-t border-neutral-800">
                        <p className="text-xs text-neutral-400 leading-relaxed">
                          Quiet isn’t bad. It means you’re not late. When something breaks out here, you’ll see it early.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Non-QUIET fallback: stats + insight */}
                      {/* Stats Grid */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-neutral-950/50 rounded-lg p-3 border border-neutral-800">
                          <div className="text-xs text-neutral-400 mb-1">Sample size</div>
                          <div className="text-sm font-semibold text-white">
                            {nicheAnalysis.scannedVideos} videos
                          </div>
                          <p className="mt-1 text-[0.65rem] text-neutral-500 leading-snug">
                            Scanned the top {nicheAnalysis.scannedVideos} most relevant recent videos under our strict breakout criteria.
                          </p>
                        </div>
                        <div className="bg-neutral-950/50 rounded-lg p-3 border border-neutral-800">
                          <div className="text-xs text-neutral-400 mb-1">Avg channel size</div>
                          <div className="text-sm font-semibold text-white">
                            {formatNumber(nicheAnalysis.averageChannelSize)}
                          </div>
                          <p className="mt-1 text-[0.65rem] text-neutral-500 leading-snug">
                            Additional context includes broader market averages for comparison, even when you filter to smaller channels.
                          </p>
                        </div>
                        <div className="bg-neutral-950/50 rounded-lg p-3 border border-neutral-800">
                          <div className="text-xs text-neutral-400 mb-1">Difficulty</div>
                          <div className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block ${getDifficultyColor(nicheAnalysis.difficultyLevel)}`}>
                            {nicheAnalysis.difficultyLevel}
                          </div>
                        </div>
                      </div>

                      {/* Explanation - Framed as market intelligence, not absence */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                            Market Insight
                          </h4>
                          <p className="text-sm text-neutral-300 leading-relaxed">
                            {nicheAnalysis.explanation}
                          </p>
                        </div>

                        {/* What this means */}
                        <div className="space-y-2 pt-3 border-t border-neutral-800">
                          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                            What this means
                          </h4>
                          <p className="text-xs text-neutral-400 leading-relaxed">
                            We scanned the top {nicheAnalysis.scannedVideos} most relevant recent videos that match this query. Our criteria: published within 30 days, primarily channels under 50k subscribers, and a 3×+ breakout multiplier.
                          </p>
                        </div>

                        {/* Interpretation */}
                        <div className="space-y-2 pt-3 border-t border-neutral-800">
                          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                            Interpretation
                          </h4>
                          <p className="text-xs text-neutral-400 leading-relaxed">
                            We intentionally analyze a small, high-signal sample to avoid noise from large legacy channels. This is diagnostic market intelligence, not a &quot;search everything&quot; engine.
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Suggested Searches */}
                  {nicheAnalysis.suggestedSearches.length > 0 && (
                    <div>
                      <p className="text-xs text-neutral-400 mb-2">Try these searches:</p>
                      <div className="flex flex-wrap gap-2">
                        {nicheAnalysis.suggestedSearches.map((suggestion, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleExampleSearch(suggestion)}
                            className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-xs text-neutral-300 hover:bg-neutral-750 hover:border-neutral-600 transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rising Signals info in Market Heat Check (if available) */}
                  {hasSearched && risingSignals.length > 0 && (
                    <div className="pt-3 border-t border-neutral-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-neutral-300">
                          {risingSignals.length} Rising Signal{risingSignals.length === 1 ? "" : "s"} Available
                        </span>
                        {userIsPro ? (
                          <button
                            type="button"
                            onClick={() => setShowRisingSignals(!showRisingSignals)}
                            className="text-xs text-purple-400 hover:text-purple-300 transition-colors font-semibold"
                          >
                            {showRisingSignals ? "Hide" : "Show"} (Pro)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleCheckout}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
                            style={{
                              background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                              boxShadow: "0 0 20px rgba(168, 85, 247, 0.3)"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = "0 0 30px rgba(168, 85, 247, 0.5)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = "0 0 20px rgba(168, 85, 247, 0.3)";
                            }}
                          >
                            Unlock Pro →
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-neutral-400 leading-relaxed">
                        Videos with 2.0–2.9× multiplier showing early momentum. Pro unlocks rising signals, unlimited results, and saved searches.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Primary CTA: Save Search & Get Alerted */}
            <div className="p-5 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <div className="text-center space-y-4">
                <div>
                  <p className="text-base font-semibold text-neutral-200 mb-2">
                    {nicheAnalysis 
                      ? "Monitor this niche for momentum shifts"
                      : "No fresh breakouts detected in this niche"}
                  </p>
                  {!nicheAnalysis && (
                    <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                      We scanned recent videos from small channels. None are outperforming expectations yet.
                    </p>
                  )}
                  {searchSavedConfirmation ? (
                    <p className="text-sm text-green-400 font-medium">
                      ✓ Search saved. We&apos;ll monitor this niche and alert you when breakouts appear.
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
                      Save search & monitor for changes
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Secondary empty state message - Only show if no niche analysis */}
            {!nicheAnalysis && (
              <div className="p-5 bg-neutral-900/50 border border-neutral-800 rounded-lg space-y-4">
                {/* What this means */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    What this means
                  </h4>
                  <p className="text-sm text-neutral-300 leading-relaxed">
                    We scanned recent videos from channels under 50k subscribers. None exceeded the 3× multiplier threshold within the last 30 days.
                  </p>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Our criteria: published within 30 days, channel size under 50k, multiplier of 3× or higher.
                  </p>
                </div>

                {/* Why this is useful */}
                <div className="space-y-2 pt-3 border-t border-neutral-800">
                  <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Why this is useful
                  </h4>
                  <p className="text-sm text-neutral-300 leading-relaxed">
                    This tells us the niche is currently stable or saturated. No videos are significantly outperforming channel size expectations right now.
                  </p>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    That scarcity is valuable intelligence — it indicates either low competition (opportunity) or high saturation (caution).
                  </p>
                </div>

                {/* What to do next */}
                <div className="space-y-2 pt-3 border-t border-neutral-800">
                  <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    What to do next
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                    {searchMode === "momentum" && (
                      <button
                        type="button"
                        onClick={() => setSearchMode("proven")}
                        className="text-xs text-purple-400 hover:text-purple-300 underline transition-colors"
                      >
                        Explore proven formats in Study Vault
                      </button>
                    )}
                    {searchMode === "momentum" && (
                      <span className="text-xs text-neutral-600 hidden sm:inline">•</span>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveSearchForAlerts}
                      className="text-xs text-purple-400 hover:text-purple-300 underline transition-colors"
                    >
                      Save this search to monitor for changes
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                      <div className="absolute -top-1 -right-1">
                        <span className="bg-red-500 text-white text-[0.6rem] font-semibold px-1 rounded" title="Pro feature: Filter by subscriber cap to focus on channels your size">
                          Pro
                        </span>
                        <button
                          type="button"
                          onClick={handleCheckout}
                          className="ml-1 text-[0.6rem] text-purple-400 hover:text-purple-300 underline"
                          title="Upgrade to Pro to unlock subscriber cap filters"
                        >
                          Unlock
                        </button>
                      </div>
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
            {searchType === "expanded" && (
              <div className="max-w-3xl mx-auto mb-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔍</span>
                  <div className="flex-1">
                    <h4 className="font-semibold text-blue-300 mb-1">
                      Expanded Search Results
                    </h4>
                    <p className="text-sm text-gray-300">
                      No videos met strict criteria (3×+, 60 days), so we expanded to
                      include videos with 2.5×+ multipliers from the last 90 days.
                    </p>
                    {showStrictOnly ? (
                      <button
                        onClick={() => setShowStrictOnly(false)}
                        className="mt-2 text-sm text-blue-400 hover:text-blue-300 underline"
                      >
                        Show expanded results again
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowStrictOnly(true)}
                        className="mt-2 text-sm text-blue-400 hover:text-blue-300 underline"
                      >
                        Show only strict results instead
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
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
                          onClick={() => handleExampleSearch(refinement)}
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
                <div className="space-y-2">
                  <p className="text-sm text-neutral-300 font-medium">
                    {userIsPro ? (
                      <span>Showing all {filteredResults.length} {searchMode === "momentum" ? "fresh breakouts" : "proven formats"}</span>
                    ) : (
                      <>
                        <span>Showing 5 of {filteredResults.length} {searchMode === "momentum" ? "fresh breakouts" : "proven formats"}</span>
                        <span className="text-neutral-500"> • </span>
                        <span className="text-neutral-400">Unlock {filteredResults.length - 5} more with Pro</span>
                      </>
                    )}
                  </p>
                  {!userIsPro && (
                    <button
                      type="button"
                      id="unlock-full-results-button-main"
                      data-testid="unlock-full-results-button"
                      onClick={() => {
                        handleCheckout();
                      }}
                      disabled={loading}
                      className="inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                        boxShadow: "0 0 30px rgba(168, 85, 247, 0.4)",
                        pointerEvents: "auto",
                        zIndex: 10,
                        position: "relative",
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
                      {loading ? "Loading..." : "Upgrade to Pro"}
                    </button>
                  )}
                  {!userIsPro && (
                    <div className="flex items-center justify-center gap-4 text-xs text-neutral-500 pt-1">
                      <span className="flex items-center gap-1">
                        <span className="text-green-400">✓</span>
                        <span>Unlimited results</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-green-400">✓</span>
                        <span>Saved searches</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-green-400">✓</span>
                        <span>Weekly digests</span>
                      </span>
                    </div>
                  )}
                </div>
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

        {/* Rising Signals Section - Opt-in secondary tier */}
        {/* Show when rising signals exist, regardless of main results */}
        {hasSearched && risingSignals.length > 0 && (
          <div className="max-w-3xl mx-auto mt-8">
            {/* Toggle/CTA Header */}
            <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200 mb-1">
                    Rising Signals (Early Momentum)
                  </h3>
                  <p className="text-xs text-neutral-400">
                    {Math.min(risingSignals.length, 5)} video{Math.min(risingSignals.length, 5) === 1 ? "" : "s"} with 2.0–2.9× multiplier showing early momentum
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRisingSignals(!showRisingSignals)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-amber-100 transition-all duration-300 hover:-translate-y-0.5"
                  style={{
                    background: showRisingSignals
                      ? "rgba(255, 255, 255, 0.1)"
                      : "linear-gradient(135deg, rgba(251, 191, 36, 0.25) 0%, rgba(245, 158, 11, 0.35) 100%)",
                    boxShadow: showRisingSignals
                      ? "none"
                      : "0 0 20px rgba(245, 158, 11, 0.35)"
                  }}
                  onMouseEnter={(e) => {
                    if (!showRisingSignals) {
                      e.currentTarget.style.boxShadow = "0 0 30px rgba(245, 158, 11, 0.5)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!showRisingSignals) {
                      e.currentTarget.style.boxShadow = "0 0 20px rgba(245, 158, 11, 0.35)";
                    }
                  }}
                >
                  {showRisingSignals ? "Hide Rising Signals" : `Show ${Math.min(risingSignals.length, 5)} Rising Signals (Early Momentum)`}
                </button>
              </div>
            </div>

            {/* Rising Signals Cards - Only shown when opted in */}
            {showRisingSignals && (
              <div className="space-y-4">
                {/* Disclaimer */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    ⚠️ Early Signals: These videos show strong momentum but haven&apos;t yet crossed our strict 3× Outlier threshold. Use for early trend spotting.
                  </p>
                </div>

                {/* Rising Signals Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {risingSignals.slice(0, 5).map((video) => {
                    const daysAgo = getDaysAgo(video.publishedAt);
                    return (
                      <a
                        key={video.id}
                        href={`https://www.youtube.com/watch?v=${video.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block bg-neutral-900/70 border border-neutral-700 rounded-lg overflow-hidden hover:border-neutral-600 hover:shadow-lg hover:shadow-black/20 transition-all cursor-pointer opacity-90"
                      >
                        <div className="relative w-full aspect-video bg-neutral-800">
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-full h-full object-cover"
                          />
                          {/* Rising Signal Badge */}
                          <div className="absolute top-2 right-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              RISING
                            </span>
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-medium text-neutral-200 line-clamp-2 flex-1">
                              {video.title}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-yellow-500/20 text-yellow-300 border-yellow-500/30 shrink-0">
                              {video.multiplier.toFixed(1)}×
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-neutral-400 truncate">
                              {video.channelTitle}
                            </p>
                            {daysAgo !== null && (
                              <span className="text-xs text-neutral-500 whitespace-nowrap shrink-0">
                                {daysAgo}d ago
                              </span>
                            )}
                          </div>
                          {/* Velocity/Engagement if available */}
                          {((video.viewsPerDay !== null && video.viewsPerDay !== undefined) || 
                            (video.likeRatio !== null && video.likeRatio !== undefined)) && (
                            <div className="flex items-center gap-3 text-xs text-neutral-500">
                              {video.viewsPerDay !== null && video.viewsPerDay !== undefined && (
                                <span className="flex items-center gap-1">
                                  <span>📈</span>
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
                                  <span>⚡</span>
                                  <span>{(video.likeRatio * 100).toFixed(1)}% engagement</span>
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-xs text-neutral-500">
                            <span>{formatNumber(video.views)} views</span>
                            <span>•</span>
                            <span>{formatNumber(video.subscribers)} subs</span>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

          </div>
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

        {showDemoExplanation && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-purple-500/30 rounded-2xl p-8 max-w-2xl">
              <h3 className="text-2xl font-bold mb-4">
                ✅ This is what we look for
              </h3>
              <p className="text-gray-300 mb-4">
                See those multipliers? (3.2×, 4.8×, 5.1×)
              </p>
              <p className="text-gray-300 mb-4">
                These videos got <strong>3-5× MORE views</strong> than their
                channel had subscribers. That&apos;s abnormal performance—and that&apos;s
                the signal we detect.
              </p>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
                <p className="text-yellow-200 text-sm">
                  ⚠️ <strong>Important:</strong> Not every niche will have breakouts
                  right now. When you see &quot;QUIET,&quot; it means the niche is stable or
                  saturated—which is valuable intelligence that saves you time.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDemoExplanation(false);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(DEMO_COMPLETED_KEY, "true");
                  }
                  setHasSeenDemo(true);
                  setQuery("");
                }}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold"
              >
                Got it – let me search my niche →
              </button>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-zinc-600">
          One breakout idea can outperform months of guesswork.
        </p>
      </div>
    </main>
  );
}
