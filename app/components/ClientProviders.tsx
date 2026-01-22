"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ReactNode } from "react";

/**
 * Client-only provider wrapper for Clerk
 * This prevents Clerk from executing during build-time prerender
 */
export function ClientProviders({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
