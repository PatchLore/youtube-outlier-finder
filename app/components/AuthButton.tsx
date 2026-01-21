"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

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
      <SignInButton mode="modal">
        <button className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-zinc-900">
          Sign in
        </button>
      </SignInButton>
    </div>
  );
}
