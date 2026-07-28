'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, X, ShieldCheck } from 'lucide-react';
import { useSiteStore } from '@/stores/site-store';

/**
 * MaintenanceBanner
 * -----------------
 * Shows a sticky top banner when admin has enabled maintenance mode.
 * - Visible to all users (NOT on admin pages — admin keeps full access)
 * - Dismissible per browser session (stays closed until tab closes or message changes)
 * - Assures users their data is safe
 *
 * Maintenance state comes from useSiteStore (populated by /api/site-settings).
 */
const SESSION_STORAGE_KEY = 'nexvo_maintenance_dismissed';

export default function MaintenanceBanner() {
  const { maintenanceMode, maintenanceMessage } = useSiteStore();
  const [dismissed, setDismissed] = useState(false);
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);

  // Reset dismissal when the message changes (admin updated the notice)
  useEffect(() => {
    if (!maintenanceMode) return;
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored && stored === maintenanceMessage) {
        setDismissed(true);
        setDismissedMessage(stored);
      } else {
        setDismissed(false);
        setDismissedMessage(null);
      }
    } catch {
      // sessionStorage might be unavailable (private mode) — just show banner
      setDismissed(false);
    }
  }, [maintenanceMode, maintenanceMessage]);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, maintenanceMessage);
    } catch {
      // Non-critical
    }
    setDismissed(true);
    setDismissedMessage(maintenanceMessage);
  };

  const shouldShow = maintenanceMode && !dismissed;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="sticky top-0 z-[60] w-full overflow-hidden"
          role="alert"
          aria-live="polite"
        >
          <div className="bg-gradient-to-r from-amber-500/95 via-amber-600/95 to-orange-600/95 text-white shadow-lg border-b border-amber-300/30">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-start sm:items-center gap-2.5 sm:gap-3">
              {/* Icon */}
              <motion.div
                animate={{ rotate: [0, -8, 8, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                className="flex-shrink-0 mt-0.5 sm:mt-0"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Wrench className="w-4 h-4 sm:w-4.5 sm:h-4.5" strokeWidth={2.2} />
                </div>
              </motion.div>

              {/* Message */}
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold leading-snug">
                  {maintenanceMessage}
                </p>
                <p className="text-[10px] sm:text-[11px] text-amber-50/90 mt-0.5 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 flex-shrink-0" strokeWidth={2.2} />
                  Semua data &amp; saldo Anda aman — tidak ada yang hilang.
                </p>
              </div>

              {/* Dismiss button */}
              <button
                onClick={handleDismiss}
                aria-label="Tutup pemberitahuan"
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white/90 hover:text-white"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
