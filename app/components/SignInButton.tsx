"use client";

import { SignInButton as ClerkSignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SignInButton() {
  return (
    <ClerkSignInButton mode="redirect" signInFallbackRedirectUrl="/">
      <Button>Sign In</Button>
    </ClerkSignInButton>
  );
}
