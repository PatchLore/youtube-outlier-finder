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

      <div className="relative z-10 max-w-6xl mx-auto px-5 py-12 sm:py-16">
        {/* Header */}
        <div className="text-center space-y-3 mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-br from-white to-purple-500 bg-clip-text text-transparent">
              Spot breakout YouTube ideas before they&apos;re obvious
            </span>
          </h1>
          <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto">
            Most tools show what&apos;s popular. We show what&apos;s breaking out — even without a big audience.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* FREE TIER */}
          <div 
            className="relative rounded-3xl p-8 flex flex-col"
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2 text-white">FREE</h2>
              <h3 className="text-sm font-medium text-white/60 mb-3">Explore</h3>
              <p className="text-sm text-white/50">
                Understand what breakout really looks like
              </p>
            </div>
            <ul className="space-y-3 flex-1 mb-8 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>Search YouTube for outlier videos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>See up to 5 results per search</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>Confidence tiers (🔥 Promising / 🚀 Strong / 💎 Breakout)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>Plain-English &quot;Why this is an outlier&quot; explanations</span>
              </li>
            </ul>
            <button
              type="button"
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all duration-300 backdrop-blur-md border border-white/20 hover:bg-white/10"
              style={{ background: "rgba(255, 255, 255, 0.05)" }}
            >
              Try it free
            </button>
          </div>

          {/* PRO TIER */}
          <div 
            className="relative rounded-3xl p-8 flex flex-col group"
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(168, 85, 247, 0.3)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.6)";
              e.currentTarget.style.boxShadow = "0 20px 60px rgba(168, 85, 247, 0.3)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.3)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
            }}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
              <span 
                className="text-xs font-semibold px-4 py-1.5 rounded-full text-white"
                style={{
                  background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                  boxShadow: "0 0 20px rgba(168, 85, 247, 0.5)"
                }}
              >
                Recommended
              </span>
            </div>
            <div className="mb-6 mt-2">
              <h2 className="text-2xl font-bold mb-2 text-white">PRO</h2>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-bold text-white">$29</span>
                <span className="text-sm text-white/60">/ month</span>
              </div>
              <p className="text-sm text-white/50 mb-3">
                For creators who want a repeatable, unfair advantage
              </p>
            </div>
            <ul className="space-y-3 flex-1 mb-8 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>Unlimited searches</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>See all outlier results (no 5-video cap)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>Saved searches</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>Weekly email digests (coming soon)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>Subscriber cap filters (hide channels bigger than you)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>View floor filters</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>Sort by virality multiplier or views</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-0.5">•</span>
                <span>Email alerts when new outliers appear</span>
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
              className="w-full rounded-xl py-4 text-base font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
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
              Upgrade to Pro
            </button>
          </div>
        </div>

        {/* What Pro Unlocks Section */}
        <div 
          className="mt-12 mb-12 rounded-3xl p-8"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(168, 85, 247, 0.2)"
          }}
        >
          <h2 className="text-2xl font-bold mb-6 text-white text-center">
            What Pro Unlocks
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Rising Signals */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📈</span>
                <h3 className="text-lg font-semibold text-white">Rising Signals</h3>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                See videos with 2.0–2.9× multiplier showing early momentum before they become full breakouts. Spot trends early with opt-in access to rising signals.
              </p>
            </div>

            {/* Alerts & Monitoring */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔔</span>
                <h3 className="text-lg font-semibold text-white">Alerts & Monitoring</h3>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                Save searches and get email alerts when new breakouts appear in your watched niches. Never miss an opportunity window.
              </p>
            </div>

            {/* Deeper Analysis */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔍</span>
                <h3 className="text-lg font-semibold text-white">Deeper Analysis</h3>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                Access Market Heat Check reports, niche intelligence, and unlimited results. Get full context on why niches are quiet or saturated.
              </p>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div 
          className="mt-8 mb-12 rounded-3xl overflow-hidden"
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.08)"
          }}
        >
          <div className="grid grid-cols-3 text-xs sm:text-sm text-white/70">
            <div className="px-4 sm:px-6 py-4 border-b border-white/10" style={{ background: "rgba(255, 255, 255, 0.02)" }} />
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center font-semibold text-white" style={{ background: "rgba(255, 255, 255, 0.02)" }}>
              Free
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center font-semibold text-white" style={{ background: "rgba(255, 255, 255, 0.02)" }}>
              Pro
            </div>

            {/* Price row */}
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 font-medium text-white/60">
              Price
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center text-white/80">
              $0
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center" style={{ color: "#a855f7" }}>
              $29 / month
            </div>

            {/* Result limit */}
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-white/60">
              Outlier results per search
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center text-white/50">
              Up to 5 breakout videos
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center text-white/80">
              All breakout videos
            </div>

            {/* Subscriber cap */}
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-white/60">
              Subscriber cap filtering
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center text-white/50">
              View-only (locked)
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center text-white/80">
              Filter out channels bigger than you
            </div>

            {/* Weekly feed */}
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-white/60">
              Weekly email digests
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center text-white/50">
              –
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center text-white/80">
              Coming soon (based on saved searches)
            </div>

            {/* Alerts */}
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-white/60">
              Alerts for new outliers
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center text-white/50">
              –
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 text-center text-white/80">
              Email alerts when new outliers appear
            </div>

            {/* Saved searches */}
            <div className="px-4 sm:px-6 py-4 text-white/60">
              Saved searches
            </div>
            <div className="px-4 sm:px-6 py-4 text-center text-white/50">
              –
            </div>
            <div className="px-4 sm:px-6 py-4 text-center text-white/80">
              Unlimited saved keyword / niche watches
            </div>
          </div>
        </div>

        <div className="text-center space-y-3 text-xs sm:text-sm text-white/50 max-w-2xl mx-auto">
          <p className="font-medium text-white/70">
            No ads. No affiliate bias. No fake metrics.
          </p>
          <p className="text-white/60">
            One good idea pays for this.
          </p>
          <p className="text-[0.7rem] text-white/40">
            Prices may increase as features ship. Early users will be grandfathered.
          </p>
        </div>
      </div>
    </main>
  );
}
