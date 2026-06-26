'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarX2, Clock } from 'lucide-react';

/**
 * WeekendNoticeBanner
 *
 * Displays a prominent banner when today is Saturday or Sunday (WIB timezone),
 * informing the user that ONLY profit distribution and withdrawal (WD) are off.
 * Deposit, salary, referral bonus tetap jalan normal di akhir pekan.
 *
 * The banner computes WIB time on the client side (UTC+7) regardless of the
 * browser's local timezone, so it works for users anywhere.
 *
 * Props:
 *  - activity: the specific activity label, e.g. "Withdrawal", "Profit harian"
 *               (used in the message text)
 */
export function WeekendNoticeBanner({ activity }: { activity: string }) {
  const [isWeekend, setIsWeekend] = useState(false);
  const [dayName, setDayName] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const check = () => {
      // Compute WIB time (UTC+7) regardless of browser timezone
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const wibNow = new Date(utcMs + 7 * 3600000); // UTC+7
      const day = wibNow.getDay(); // 0=Sunday, 6=Saturday
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      setDayName(days[day]);
      setIsWeekend(day === 0 || day === 6);
    };

    check();
    // Re-check every minute (in case the day rolls over while page is open)
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence>
      {mounted && isWeekend && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/10 p-4 sm:p-5 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 flex items-center justify-center shrink-0">
                <CalendarX2 className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-foreground font-bold text-sm sm:text-base mb-1 flex items-center gap-2 flex-wrap">
                  <span className="text-amber-400">Libur Akhir Pekan</span>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/20">
                    {dayName}
                  </span>
                </h3>
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                  {activity} diblokir pada hari <span className="text-foreground font-semibold">Sabtu &amp; Minggu</span>.
                  Profit &amp; Withdrawal (WD) libur di akhir pekan — deposit &amp; aktivitas lain tetap jalan normal.
                  Silakan kembali pada hari kerja <span className="text-foreground font-semibold">Senin-Jumat</span>.
                </p>
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-amber-400/80">
                  <Clock className="w-3 h-3" />
                  <span>Waktu server: WIB (UTC+7)</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
