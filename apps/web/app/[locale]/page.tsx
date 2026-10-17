"use client";

import { Link } from "@/i18n/navigation";

export default function RootPage() {
  return (
    <div className="fixed inset-0 z-50 flex w-screen h-screen flex-col bg-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
        <div className="font-display text-xl font-bold text-canvas-ink">Beauty AI</div>
        <nav className="hidden gap-6 text-sm font-medium text-canvas-ink-muted md:flex">
          <a href="#" onClick={(e) => e.preventDefault()} className="cursor-default hover:text-primary transition-colors">Home</a>
          <a href="#" onClick={(e) => e.preventDefault()} className="cursor-default hover:text-primary transition-colors">Our Project</a>
          <a href="#" onClick={(e) => e.preventDefault()} className="cursor-default hover:text-primary transition-colors">Pricing</a>
          <a href="#" onClick={(e) => e.preventDefault()} className="cursor-default hover:text-primary transition-colors">About Us</a>
          <a href="#" onClick={(e) => e.preventDefault()} className="cursor-default hover:text-primary transition-colors">FAQ</a>
          <a href="#" onClick={(e) => e.preventDefault()} className="cursor-default hover:text-primary transition-colors">Contact Us</a>
        </nav>
        <Link 
          href="/admin" 
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-surface shadow-sm hover:bg-primary/90 transition-all"
        >
          Log In
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="flex max-w-4xl flex-col items-center gap-8">
          <div className="space-y-6">
            <h1 className="font-display text-5xl font-bold tracking-tight text-canvas-ink sm:text-7xl">
              Beauty AI Advisor
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-canvas-ink-muted sm:text-2xl">
              Unlock the secrets of your skin with AI-powered analysis and personalized routines.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
