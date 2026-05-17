'use client';

import { useState } from 'react';
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

  const fetchAdmins = async () => {
    if (admins.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp');
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        setAdmins(data.data);
      } else {
        setAdmins([{ id: 'default', name: 'CS NEXVO', phone: '6281234567890', order: 1 }]);
      }
    } catch {
      setAdmins([{ id: 'default', name: 'CS NEXVO', phone: '6281234567890', order: 1 }]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    fetchAdmins();
  };

  const openWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const message = encodeURIComponent('Halo CS NEXVO, saya butuh bantuan.');
    window.open('https://wa.me/' + cleanPhone + '?text=' + message, '_blank');
  };

  return (
    <>
      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-[88px] sm:bottom-20 right-3 sm:right-5 z-[60] w-[280px] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Header - Solid Gold */}
            <div className="bg-[#D4AF37] px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#070B14] flex items-center justify-center overflow-hidden shrink-0">
                <img src="/cs-chat-icon.png" alt="CS" className="w-full h-full object-cover rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-[#070B14] text-sm leading-tight">Customer Service</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-700" />
                  <span className="text-[#070B14]/70 text-[11px]">Online</span>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg bg-[#070B14]/20 flex items-center justify-center hover:bg-[#070B14]/30 transition-colors shrink-0"
              >
                <X className="w-4 h-4 text-[#070B14]" />
              </button>
            </div>

            {/* Body - Solid Dark */}
            <div className="bg-[#0c1222] p-4 space-y-3">
              <p className="text-center text-gray-400 text-[11px]">
                Chat langsung dengan Admin CS via WhatsApp
              </p>

              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 text-[#D4AF37] animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <button
                      key={admin.id}
                      onClick={() => openWhatsApp(admin.phone)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-white text-sm font-semibold">{admin.name}</p>
                        <p className="text-white/70 text-[11px]">{admin.phone}</p>
                      </div>
                      <Phone className="w-4 h-4 text-white/80 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button - Solid, Clean, No transparency */}
      {!isOpen && (
        <motion.button
          onClick={handleOpen}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="fixed bottom-[88px] sm:bottom-5 right-3 sm:right-5 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg overflow-hidden group bg-[#D4AF37] hover:bg-[#c9a22e] transition-colors"
        >
          <img 
            src="/cs-chat-icon.png" 
            alt="CS" 
            className="w-8 h-8 rounded-full object-cover group-hover:scale-105 transition-transform" 
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        </motion.button>
      )}
    </>
  );
}
