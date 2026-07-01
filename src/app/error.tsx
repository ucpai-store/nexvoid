'use client';

import { AlertTriangle, RefreshCw, Home, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Detects whether an error is a Next.js chunk-loading failure.
 * These happen when a new deploy changes chunk hashes but the user's
 * browser still holds stale HTML/JS referencing the old (now 404) chunks.
 *
 * Matching patterns (covering Webpack + Turbopack + native ESM dynamic import):
 *  - "Loading chunk <id> failed"
 *  - "Loading CSS chunk <id> failed"
 *  - "ChunkLoadError"
 *  - "Failed to fetch dynamically imported module"
 *  - "Importing a module script failed"
 *  - ".chunk.js"  /  "/_next/static/chunks/"
 */
function isChunkLoadError(error: Error & { digest?: string }): boolean {
  // ONLY match exact chunk-load error phrases in the message/name.
  // Do NOT search the stack trace — stack traces contain file paths like
  // '/_next/static/chunks/...' which would false-positive on every normal error.
  const msg = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return (
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('chunkloaderror') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed')
  );
}

const RELOAD_KEY = '__nexvo_chunk_reload_count';
const MAX_AUTO_RELOADS = 3;

function getReloadCount(): number {
  try {
    const n = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function bumpReloadCount(): number {
  const next = getReloadCount() + 1;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(next));
  } catch {
    /* ignore */
  }
  return next;
}

function resetReloadCount() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Force a hard reload that bypasses the browser cache for the HTML document.
 * We append (or refresh) a `_cb` cache-buster query param so the server returns
 * fresh HTML that references the CURRENT chunk hashes — breaking the stale-loop.
 */
function forceHardReload() {
  const url = new URL(window.location.href);
  url.searchParams.set('_cb', String(Date.now()));
  // Keep the hash if any
  window.location.replace(url.toString());
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isChunkError, setIsChunkError] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    console.error('[GlobalError]', error);

    if (isChunkLoadError(error)) {
      setIsChunkError(true);
      const count = getReloadCount();
      setAttempt(count);

      if (count < MAX_AUTO_RELOADS) {
        // Auto-reload with cache-busting after a short delay so the user
        // sees what's happening (and so the error is logged first).
        setReloading(true);
        bumpReloadCount();
        const timer = setTimeout(() => {
          forceHardReload();
        }, 1200);
        return () => clearTimeout(timer);
      }
      // Exceeded auto-reload attempts — show manual recovery UI.
    } else {
      // Not a chunk error — clear the counter so a future real chunk error
      // can auto-recover cleanly.
      resetReloadCount();
    }
  }, [error]);

  const handleTryAgain = () => {
    if (isChunkError) {
      // For chunk errors, reset() alone won't help (it re-renders the same
      // broken chunk). Do a hard, cache-busted reload instead.
      resetReloadCount();
      setReloading(true);
      forceHardReload();
    } else {
      // For non-chunk errors, the standard React reset is the right move.
      reset();
    }
  };

  const handleHome = () => {
    resetReloadCount();
    const url = new URL(window.location.origin);
    url.searchParams.set('_cb', String(Date.now()));
    window.location.href = url.toString();
  };

  // ── Chunk-error auto-reloading state ─────────────────────────────────────
  if (isChunkError && reloading) {
    return (
      <div className="min-h-screen bg-[#070B14] flex items-center justify-center p-4">
        <div className="glass rounded-3xl p-8 sm:p-12 text-center max-w-md mx-auto glow-gold">
          <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-7 h-7 text-gold animate-spin" />
          </div>
          <h3 className="text-foreground font-semibold mb-2">Updating NEXVO…</h3>
          <p className="text-muted-foreground text-sm mb-1">
            A new version is available. Reloading…
          </p>
          <p className="text-muted-foreground/50 text-xs">
            Attempt {attempt + 1} of {MAX_AUTO_RELOADS + 1}
          </p>
        </div>
      </div>
    );
  }

  // ── Chunk-error manual recovery (after auto-reload attempts exhausted) ──
  if (isChunkError) {
    return (
      <div className="min-h-screen bg-[#070B14] flex items-center justify-center p-4">
        <div className="glass rounded-3xl p-8 sm:p-12 text-center max-w-md mx-auto glow-gold">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-foreground font-semibold mb-2">Update required</h3>
          <p className="text-muted-foreground text-sm mb-2">
            Your browser is running an old version of NEXVO. Please reload to get the latest version.
          </p>
          <p className="text-muted-foreground/50 text-xs mb-6">
            Tip: if the problem persists, clear your browser cache or open the site in a private window.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleTryAgain}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-gradient text-[#070B14] font-semibold text-sm hover:opacity-90 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Reload now
            </button>
            <button
              onClick={handleHome}
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

  // ── Generic (non-chunk) error ────────────────────────────────────────────
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
            onClick={handleTryAgain}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-gradient text-[#070B14] font-semibold text-sm hover:opacity-90 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <button
            onClick={handleHome}
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
