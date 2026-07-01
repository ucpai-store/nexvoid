'use client';

import { motion } from 'framer-motion';
import { MessageCircle, Bell, Smartphone } from 'lucide-react';
import { useT } from '@/lib/i18n';

/**
 * AdminWhatsAppPage — V18: WA Bot feature has been DISABLED.
 *
 * Reason: WA bot (mini-services/wa-bot) was removed to simplify deployment
 * and eliminate a class of notification-delivery bugs. All user notifications
 * now go through Web Push (VAPID) which is more reliable and doesn't require
 * a separate service to run.
 *
 * This page is kept as a placeholder so admin navigation doesn't break.
 * It shows a clear "feature disabled" message with explanation.
 */
export default function AdminWhatsAppPage() {
  const t = useT();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass rounded-2xl p-8 text-center"
      >
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-muted/30 rounded-full blur-2xl" />
            <div className="relative w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
              <MessageCircle className="w-10 h-10 text-muted-foreground" />
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-3">WhatsApp Bot Dinonaktifkan</h1>
        <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
          Fitur WhatsApp Bot telah dinonaktifkan pada versi V18 untuk meningkatkan
          stabilitas sistem. Semua notifikasi pengguna sekarang dikirim melalui
          <strong> Web Push Notification</strong> yang lebih andal.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 max-w-2xl mx-auto">
          <div className="glass rounded-xl p-4 text-center">
            <Bell className="w-6 h-6 mx-auto mb-2 text-primary" />
            <div className="text-sm font-medium">Notifikasi Push</div>
            <div className="text-xs text-muted-foreground mt-1">
              Profit, deposit, WD
            </div>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <Smartphone className="w-6 h-6 mx-auto mb-2 text-primary" />
            <div className="text-sm font-medium">Ke HP Langsung</div>
            <div className="text-xs text-muted-foreground mt-1">
              Browser / PWA
            </div>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <MessageCircle className="w-6 h-6 mx-auto mb-2 text-primary" />
            <div className="text-sm font-medium">CS Manual</div>
            <div className="text-xs text-muted-foreground mt-1">
              via WhatsApp Admin
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-left max-w-2xl mx-auto">
          <p className="font-medium mb-2">Cara kerja notifikasi V18:</p>
          <ul className="space-y-1 text-muted-foreground list-disc list-inside">
            <li>User login → otomatis subscribe Web Push (VAPID)</li>
            <li>Profit masuk jam 00:00 WIB → push notif ke HP user</li>
            <li>Deposit pending → push notif ke admin</li>
            <li>Withdraw pending → push notif ke admin</li>
            <li>Tidak perlu service terpisah — lebih stabil</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
