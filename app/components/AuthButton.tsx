"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { SignInButton } from "./SignInButton";

export function AuthButton() {
  const { isSignedIn } = useUser();

  if (isSignedIn) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <UserButton />
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <SignInButton />
    </div>
  );
}
