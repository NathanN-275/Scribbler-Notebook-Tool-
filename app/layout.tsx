import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scribbler — A notebook for the way you think",
  description: "A digital notebook for handwritten notes, sketches, and study sessions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/library" signUpFallbackRedirectUrl="/library">
      {children}
    </ClerkProvider>
  </body></html>;
}
