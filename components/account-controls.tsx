"use client";

import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

export function AccountControls({ returnTo }: { returnTo: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <UserButton />;

  return <>
    <SignInButton fallbackRedirectUrl={returnTo}>
      <button type="button" className="button button-outline">Sign in</button>
    </SignInButton>
    <SignUpButton fallbackRedirectUrl={returnTo}>
      <button type="button" className="button button-primary">Sign up</button>
    </SignUpButton>
  </>;
}
