import { Suspense } from "react";
import { SignInButton } from "./sign-in-button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | Tempo",
  description: "Your inbox, your rules.",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-background relative overflow-hidden p-4">
      <div className="absolute inset-0 bg-dot-grid opacity-20 pointer-events-none" />
      
      <div className="relative z-10 max-w-sm w-full">
        <div className="bg-card border border-border rounded-xl p-10 shadow-sm flex flex-col items-center text-center gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold font-display tracking-tight text-foreground">
              tempo<span className="text-accent">.</span>
            </h1>
            <p className="text-muted-foreground text-sm">Your inbox, your rules.</p>
          </div>

          <div className="w-full h-px bg-border" />

          <Suspense fallback={<div className="h-[44px] w-full" />}>
            <SignInButton />
          </Suspense>
        </div>

        <p className="text-muted-foreground text-xs text-center mt-6 max-w-xs mx-auto">
          By continuing, you agree to Tempo&apos;s privacy-first approach.
        </p>
      </div>
    </main>
  );
}
