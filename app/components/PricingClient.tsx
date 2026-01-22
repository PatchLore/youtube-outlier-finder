"use client";

import { useRouter } from "next/navigation";

export function PricingClient() {
  const router = useRouter();

  async function handleCheckout() {
    console.log("Pricing page: handleCheckout called");
    try {
      console.log("Pricing page: Starting checkout...");
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("Pricing page: Checkout response:", response.status, response.statusText);

      if (!response.ok) {
        const data = await response.json();
        console.error("Pricing page: Checkout error:", data);
        throw new Error(data.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      console.log("Pricing page: Checkout URL received:", url);
      if (url) {
        window.location.href = url;
      } else {
        console.error("Pricing page: No checkout URL in response");
        throw new Error("No checkout URL received");
      }
    } catch (err: any) {
      console.error("Pricing page: Checkout exception:", err);
      alert(err.message || "Failed to start checkout. Please try again.");
    }
  }
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 px-4 py-12 sm:py-16">
      <div className="max-w-5xl mx-auto">
        <div className="text-center space-y-3 mb-12">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Find YouTube ideas that outperform their audience size
          </h1>
          <p className="text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto">
            Most tools show what's popular. We show what worked — even without a big audience.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* FREE TIER */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col">
            <div className="mb-4">
              <h2 className="text-xl font-semibold mb-1">FREE</h2>
              <h3 className="text-sm font-medium text-neutral-400 mb-3">Explore</h3>
              <p className="text-xs text-neutral-400">
                Understand what breakout really looks like
              </p>
            </div>
            <ul className="space-y-2 flex-1 mb-6 text-xs text-neutral-300">
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>Search YouTube for outlier videos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>See up to 5 results per search</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>Confidence tiers (🔥 Promising / 🚀 Strong / 💎 Breakout)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>Plain-English "Why this is an outlier" explanations</span>
              </li>
            </ul>
            <button
              type="button"
              className="w-full rounded-md bg-neutral-800 border border-neutral-700 text-sm font-medium px-4 py-2 hover:bg-neutral-750 transition-colors"
            >
              Try it free
            </button>
          </div>

          {/* PRO TIER */}
          <div className="bg-neutral-900 border-2 border-red-500/50 rounded-xl p-6 flex flex-col relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-red-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                Most Popular
              </span>
            </div>
            <div className="mb-4 mt-2">
              <h2 className="text-xl font-semibold mb-1">PRO</h2>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl font-semibold">$29</span>
                <span className="text-sm text-neutral-400">/ month</span>
              </div>
              <p className="text-xs text-neutral-400 mb-3">
                For creators who want a repeatable, unfair advantage
              </p>
            </div>
            <ul className="space-y-2 flex-1 mb-6 text-xs text-neutral-300">
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>Unlimited searches</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>See all outlier results (no 5-video cap)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>Subscriber cap filters (hide channels bigger than you)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>View floor filters</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>Sort by virality multiplier or views</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>Full explanations on every result</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>Weekly personalized outlier feed based on saved searches</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neutral-500 mt-0.5">•</span>
                <span>Email alerts when new outliers appear in your niches</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={(e) => {
                console.log("=== PRICING PAGE BUTTON CLICKED ===");
                e.preventDefault();
                e.stopPropagation();
                handleCheckout();
              }}
              className="w-full rounded-md bg-red-500 text-sm font-medium px-4 py-2 hover:bg-red-600 transition-colors"
            >
              Unlock full results
            </button>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="mt-4 mb-10 bg-neutral-950/50 border border-neutral-900 rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 text-xs sm:text-sm text-neutral-300">
            <div className="bg-neutral-950/80 px-3 sm:px-4 py-3 border-b border-neutral-900" />
            <div className="bg-neutral-950/80 px-3 sm:px-4 py-3 border-b border-neutral-900 text-center font-medium">
              Free
            </div>
            <div className="bg-neutral-950/80 px-3 sm:px-4 py-3 border-b border-neutral-900 text-center font-medium">
              Pro
            </div>

            {/* Price row */}
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 font-medium text-neutral-400">
              Price
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center text-neutral-200">
              $0
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center text-red-400">
              $29 / month
            </div>

            {/* Result limit */}
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-neutral-400">
              Outlier results per search
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center">
              Up to 5 breakout videos
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center">
              All breakout videos
            </div>

            {/* Subscriber cap */}
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-neutral-400">
              Subscriber cap filtering
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center text-neutral-500">
              View-only (locked)
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center">
              Filter out channels bigger than you
            </div>

            {/* Weekly feed */}
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-neutral-400">
              Weekly personalized outlier feed
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center text-neutral-500">
              –
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center">
              Based on your saved searches
            </div>

            {/* Alerts */}
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-neutral-400">
              Alerts for new outliers
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center text-neutral-500">
              –
            </div>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-900 text-center">
              Email alerts when new outliers appear
            </div>

            {/* Saved searches */}
            <div className="px-3 sm:px-4 py-3 text-neutral-400">
              Saved searches
            </div>
            <div className="px-3 sm:px-4 py-3 text-center text-neutral-500">
              –
            </div>
            <div className="px-3 sm:px-4 py-3 text-center">
              Unlimited saved keyword / niche watches
            </div>
          </div>
        </div>

        <div className="text-center space-y-3 text-xs sm:text-sm text-neutral-400 max-w-2xl mx-auto">
          <p className="font-medium text-neutral-300">
            No ads. No affiliate bias. No fake metrics.
          </p>
          <p className="text-neutral-500">
            One good idea pays for this.
          </p>
          <p className="text-[0.7rem] text-neutral-600">
            Prices may increase as features ship. Early users will be grandfathered.
          </p>
        </div>
      </div>
    </main>
  );
}
