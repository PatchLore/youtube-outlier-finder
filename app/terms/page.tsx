"use client";

export default function TermsPage() {
  return (
    <main className="min-h-screen text-white overflow-x-hidden" style={{ background: "#0a0a0f" }}>
      <div className="relative z-10 max-w-3xl mx-auto px-5 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-4">Terms of Service</h1>
        <p className="text-sm text-neutral-400 mb-8">
          Last updated: January 2026
        </p>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">1. Agreement to Terms</h2>
          <p className="text-sm text-neutral-300">
            By accessing or using OutlierYT (&quot;the Service&quot;), you agree to be bound by these Terms of
            Service. If you do not agree, you may not use the Service.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">2. Use of the Service</h2>
          <p className="text-sm text-neutral-300">
            OutlierYT is provided for informational and research purposes to help creators understand YouTube
            performance patterns. You are responsible for how you use any insights or suggestions provided by
            the Service.
          </p>
          <ul className="list-disc list-inside text-sm text-neutral-300 space-y-2">
            <li>You may not attempt to reverse engineer or abuse the Service or its APIs.</li>
            <li>You may not use the Service to violate YouTube&apos;s or Google&apos;s terms or community guidelines.</li>
            <li>We reserve the right to suspend access for misuse or abuse.</li>
          </ul>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">3. YouTube API &amp; Third-Party Services</h2>
          <p className="text-sm text-neutral-300">
            The Service uses YouTube API Services to retrieve public video and channel information. By using
            OutlierYT, you also agree to the{" "}
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
            We also rely on third-party providers including Clerk (authentication), Stripe (payments),
            Supabase/Redis (storage and caching), and hosting providers. Your use of OutlierYT may be subject
            to their respective terms and policies.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">4. Subscriptions &amp; Billing</h2>
          <p className="text-sm text-neutral-300">
            Pro features may be offered on a subscription basis and billed via Stripe. By subscribing, you
            authorize us and our payment processor to charge your selected payment method on a recurring basis
            until you cancel.
          </p>
          <p className="text-sm text-neutral-300">
            Subscription details, including price and billing interval, will be presented at checkout. We may
            update pricing in the future; any changes will be communicated in advance where required.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">5. Disclaimer of Warranties</h2>
          <p className="text-sm text-neutral-300">
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether
            express or implied. We do not guarantee specific results, views, or outcomes from using OutlierYT.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">6. Limitation of Liability</h2>
          <p className="text-sm text-neutral-300">
            To the maximum extent permitted by law, OutlierYT and its creators shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or any loss of profits or data,
            arising out of or in connection with your use of the Service.
          </p>
        </section>

        <section className="space-y-4 mb-12">
          <h2 className="text-xl font-semibold">7. Contact</h2>
          <p className="text-sm text-neutral-300">
            If you have questions about these Terms, please contact:
          </p>
          <p className="text-sm text-neutral-300">
            <span className="font-semibold">Email:</span> support@outlieryt.com
          </p>
        </section>
      </div>
    </main>
  );
}

