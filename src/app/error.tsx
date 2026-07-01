'use client';

import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[GlobalError]', error);

  return (
    <div className="min-h-screen bg-[#070B14] flex items-center justify-center p-4">
      <div className="glass rounded-3xl p-8 sm:p-12 text-center max-w-md mx-auto glow-gold">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-foreground font-semibold mb-2">Something went wrong</h3>
        <p className="text-muted-foreground text-sm mb-2">
          {error?.message || 'An unexpected error occurred'}
        </p>
        <details className="text-muted-foreground/50 text-xs mb-6 cursor-pointer">
          <summary>Technical details</summary>
          <pre className="mt-2 text-left whitespace-pre-wrap break-words">
            {error?.stack}
          </pre>
        </details>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-gradient text-[#070B14] font-semibold text-sm hover:opacity-90 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#D4AF37]/20 text-foreground font-semibold text-sm hover:bg-white/5 transition-all"
          >
            <Home className="w-4 h-4" />
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
