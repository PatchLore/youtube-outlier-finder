// Force dynamic rendering to prevent any build-time prerender
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { PricingClient } from "../components/PricingClient";

export default function PricingPage() {
  return <PricingClient />;
}
