import Link from 'next/link';
import Image from 'next/image';
import { WaitlistForm } from '@/components/landing/WaitlistForm';
import { Shield, Bot, Search, Sparkles, Sun, Keyboard } from 'lucide-react';

export const metadata = {
  title: 'Aethra - Email and calendar, finally on your terms',
  description: 'Privacy-first, agent-powered, keyboard-native email client built on Corsair.',
};

export default function MarketingPage() {
  return (
    <>
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 text-center bg-dot-grid">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-8">
          <h1 className="font-display text-5xl md:text-7xl font-semibold tracking-tight text-balance">
            Email and calendar,<br className="hidden md:block" />
            finally on <span className="text-accent">your</span> terms.
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl text-balance">
            Aethra connects to your Gmail and Calendar via Corsair.
            Privacy-first, agent-powered, keyboard-native.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mt-4">
            <Link 
              href="/api/auth/signin?callbackUrl=/inbox"
              className="btn-animated-border w-full sm:w-auto px-8 py-4 rounded-lg text-foreground font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              Connect Gmail →
            </Link>
            <a 
              href="#features"
              className="w-full sm:w-auto px-8 py-4 rounded-lg border border-border bg-surface text-foreground font-medium hover:bg-surface-raised transition-all flex items-center justify-center gap-2"
            >
              See how it works ↓
            </a>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 mt-8 text-xs text-muted-foreground font-medium">
            <div className="flex items-center gap-2"><span aria-hidden="true">🔒</span> Your data stays yours</div>
            <div className="flex items-center gap-2"><span aria-hidden="true">⌨</span> Fully keyboard navigable</div>
            <div className="flex items-center gap-2"><span aria-hidden="true">⚡</span> Sub-100ms search</div>
          </div>
          
          <div className="relative mt-12 rounded-xl overflow-hidden border border-border shadow-2xl">
            <Image
              src="/screenshots/inbox-dark.png"
              alt="Aethra inbox"
              width={1440}
              height={900}
              priority
              className="w-full dark:block hidden"
            />
            <Image
              src="/screenshots/inbox-light.png"
              alt="Aethra inbox"
              width={1440}
              height={900}
              priority
              className="w-full dark:hidden block"
            />
          </div>
        </div>
      </section>

      <section id="features" className="py-24 px-6 max-w-6xl mx-auto scroll-mt-16">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-balance mb-4">
            Everything your inbox is missing
          </h2>
          <p className="text-muted-foreground text-lg text-balance">
            Designed for speed, built for privacy, and powered by intelligent agents.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-surface border border-border rounded-xl p-6 hover:border-strong hover:bg-surface-raised transition-all duration-150 group">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
              <Shield className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-medium text-base mb-2">Privacy Gate</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You decide which emails the AI can see. Sensitive domains never leave your server.
            </p>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-6 hover:border-strong hover:bg-surface-raised transition-all duration-150 group">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
              <Bot className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-medium text-base mb-2">Agent Chat</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tell Aethra to send emails and schedule meetings. It asks before acting.
            </p>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-6 hover:border-strong hover:bg-surface-raised transition-all duration-150 group">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
              <Search className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-medium text-base mb-2">Instant Search</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Semantic search across your entire inbox. No Gmail API. Under 100ms.
            </p>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-6 hover:border-strong hover:bg-surface-raised transition-all duration-150 group">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-medium text-base mb-2">Thread TL;DR</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every thread summarized before you open it. Pre-computed, always ready.
            </p>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-6 hover:border-strong hover:bg-surface-raised transition-all duration-150 group">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
              <Sun className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-medium text-base mb-2">Morning Digest</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              One tap to know exactly what needs your attention today.
            </p>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-6 hover:border-strong hover:bg-surface-raised transition-all duration-150 group">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
              <Keyboard className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-medium text-base mb-2">Keyboard First</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Full inbox management without touching your mouse. Every action has a shortcut.
            </p>
          </div>
        </div>
      </section>

      {/* WAITLIST SECTION */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto bg-surface border border-border rounded-2xl p-10 md:p-16 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-balance mb-4">
            Get early access
          </h2>
          <p className="text-muted-foreground mb-10 max-w-md mx-auto text-balance">
            We are in beta. Join the waitlist to get access to features still in testing.
          </p>
          <WaitlistForm />
        </div>
      </section>
    </>
  );
}
