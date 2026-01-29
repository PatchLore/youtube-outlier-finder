"use client";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen text-white overflow-x-hidden" style={{ background: "#0a0a0f" }}>
      <div className="relative z-10 max-w-3xl mx-auto px-5 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-4">Privacy Policy</h1>
        <p className="text-sm text-neutral-400 mb-8">
          Last updated: January 2026
        </p>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">1. Overview</h2>
          <p className="text-sm text-neutral-300">
            OutlierYT (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) helps creators discover YouTube video ideas by
            analyzing performance metrics and surfacing breakout signals. This Privacy Policy explains how we
            collect, use, and protect your information when you use our website and services.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">2. YouTube API &amp; Google Services</h2>
          <p className="text-sm text-neutral-300">
            This product uses YouTube API Services to fetch public video and channel data. By using OutlierYT,
            you agree to be bound by the{" "}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-300 underline"
            >
              YouTube Terms of Service
            </a>{" "}
            and the{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-300 underline"
            >
              Google Privacy Policy
            </a>
            .
          </p>
          <p className="text-sm text-neutral-300">
            We only access publicly available YouTube data and do not access your private YouTube account
            or upload content on your behalf.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">3. Data We Collect</h2>
          <ul className="list-disc list-inside text-sm text-neutral-300 space-y-2">
            <li>
              <strong>Account data:</strong> We use{" "}
              <span className="text-neutral-100 font-semibold">Clerk</span> to handle authentication and
              session management. Clerk may store your email, name, and basic profile information to create
              your account.
            </li>
            <li>
              <strong>Payment data:</strong> We use{" "}
              <span className="text-neutral-100 font-semibold">Stripe</span> to process payments. We do not
              store your full payment card details; Stripe acts as our payment processor and handles this
              securely.
            </li>
            <li>
              <strong>Usage data:</strong> We log basic usage information (such as search queries, filters,
              and interactions) to improve the product and maintain reliability.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">4. Storage &amp; Infrastructure</h2>
          <p className="text-sm text-neutral-300">
            We may use managed databases and storage providers such as Supabase (PostgreSQL) and Redis/KV
            services to store:
          </p>
          <ul className="list-disc list-inside text-sm text-neutral-300 space-y-2">
            <li>Saved searches and alert preferences</li>
            <li>Aggregated performance metrics and cached results</li>
            <li>Non-sensitive application metadata</li>
          </ul>
          <p className="text-sm text-neutral-300">
            Access to these systems is restricted and protected using industry-standard security practices.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">5. Cookies &amp; Tracking</h2>
          <p className="text-sm text-neutral-300">
            We use cookies and similar technologies for:
          </p>
          <ul className="list-disc list-inside text-sm text-neutral-300 space-y-2">
            <li>
              <strong>Authentication:</strong> Clerk uses cookies to maintain your signed-in session.
            </li>
            <li>
              <strong>Analytics &amp; performance:</strong> We may use privacy-friendly analytics to
              understand how the product is used and to improve the experience.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">6. Your Rights</h2>
          <p className="text-sm text-neutral-300">
            Depending on your jurisdiction, you may have the right to access, update, or delete your
            personal data. If you have questions or requests related to your data, please contact us using
            the information below.
          </p>
        </section>

        <section className="space-y-4 mb-12">
          <h2 className="text-xl font-semibold">7. Contact</h2>
          <p className="text-sm text-neutral-300">
            If you have any questions about this Privacy Policy or how we handle your data, please contact
            us at:
          </p>
          <p className="text-sm text-neutral-300">
            <span className="font-semibold">Email:</span> support@outlieryt.com
          </p>
        </section>
      </div>
    </main>
  );
}

