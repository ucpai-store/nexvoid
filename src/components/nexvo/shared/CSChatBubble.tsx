'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Phone, Loader2 } from 'lucide-react';

interface CSAdmin {
  id: string;
  name: string;
  phone: string;
  order: number;
}

export default function CSChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [admins, setAdmins] = useState<CSAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Show tooltip after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTooltip(true);
      // Auto-hide tooltip after 5 seconds
      setTimeout(() => setShowTooltip(false), 5000);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch WhatsApp admins when opening
  const fetchAdmins = async () => {
    if (admins.length > 0) return; // Already fetched
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp');
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        setAdmins(data.data);
      } else {
        // Fallback - default CS number
        setAdmins([
          { id: 'default', name: 'CS NEXVO', phone: '6281234567890', order: 1 }
        ]);
      }
    } catch {
      setAdmins([
        { id: 'default', name: 'CS NEXVO', phone: '6281234567890', order: 1 }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    fetchAdmins();
    setShowTooltip(false);
  };

  const openWhatsApp = (phone: string) => {
    // Clean phone number - remove spaces, dashes, etc.
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const message = encodeURIComponent('Halo CS NEXVO, saya butuh bantuan.');
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  return (
    <>
      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed bottom-24 right-3 sm:bottom-24 sm:right-5 z-[60] w-[280px] sm:w-[300px] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-[#D4AF37]/30"
            style={{ background: 'linear-gradient(145deg, rgba(15,23,42,0.97), rgba(7,11,20,0.99))' }}
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-[#D4AF37] to-[#F0D060] px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#070B14]/20 flex items-center justify-center overflow-hidden shrink-0 border-2 border-white/30">
                <img src="/cs-chat-icon.png" alt="NEXVO CS" className="w-full h-full object-cover rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-[#070B14] text-sm leading-tight">NEXVO CS</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
                  <span className="text-[#070B14]/70 text-xs">Online</span>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/30 flex items-center justify-center hover:bg-white/50 transition-colors shrink-0"
              >
                <X className="w-4 h-4 text-[#070B14]" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              <p className="text-center text-muted-foreground text-xs">
                Chat langsung dengan Admin CS kami via WhatsApp
              </p>

              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 text-[#D4AF37] animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <button
                      key={admin.id}
                      onClick={() => openWhatsApp(admin.phone)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 hover:bg-[#25D366]/20 hover:border-[#25D366]/40 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0 group-hover:bg-[#25D366]/30 transition-colors">
                        <MessageCircle className="w-5 h-5 text-[#25D366]" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-foreground text-sm font-medium">{admin.name}</p>
                        <p className="text-muted-foreground text-xs truncate">{admin.phone}</p>
                      </div>
                      <Phone className="w-4 h-4 text-[#25D366] shrink-0 group-hover:scale-110 transition-transform" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && !isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="fixed bottom-24 right-20 sm:bottom-24 sm:right-[5.5rem] z-[55] bg-[#0F172A] border border-[#D4AF37]/30 rounded-xl px-3 py-2 shadow-lg max-w-[160px]"
          >
            <p className="text-foreground text-xs leading-relaxed">Butuh bantuan? Chat CS kami! 💬</p>
            <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[6px] border-l-[#D4AF37]/30" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      {!isOpen && (
        <motion.button
          onClick={handleOpen}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="fixed bottom-24 right-3 sm:bottom-6 sm:right-5 z-50 w-14 h-14 sm:w-[60px] sm:h-[60px] rounded-full flex items-center justify-center shadow-xl overflow-hidden group"
          style={{
            background: 'linear-gradient(135deg, #D4AF37, #F0D060)',
            boxShadow: '0 4px 20px rgba(212, 175, 55, 0.4), 0 0 40px rgba(212, 175, 55, 0.15)',
          }}
        >
          {/* Pulse animation ring */}
          <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-[#D4AF37]" style={{ animationDuration: '2s' }} />
          
          {/* Icon image */}
          <img 
            src="/cs-chat-icon.png" 
            alt="Chat CS" 
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-cover relative z-10 group-hover:scale-110 transition-transform" 
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              // Show fallback icon
              const parent = target.parentElement;
              if (parent) {
                const fallback = document.createElement('span');
                fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#070B14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
                fallback.className = 'relative z-10';
                parent.appendChild(fallback);
              }
            }}
          />
        </motion.button>
      )}
    </>
  );
}
