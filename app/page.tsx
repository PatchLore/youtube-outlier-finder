// Force dynamic rendering to prevent any build-time prerender
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { HomeClient } from "./components/HomeClient";

export default function HomePage() {
  return <HomeClient />;
}
