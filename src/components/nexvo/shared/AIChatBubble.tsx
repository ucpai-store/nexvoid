'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, User, Loader2, ArrowLeft, RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useT } from '@/lib/i18n';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIChatBubble() {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('ai.greeting') },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuthStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.data.message }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: t('ai.error') }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('ai.connectionError') }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 right-3 sm:bottom-6 sm:right-6 md:bottom-8 md:right-6 z-[60] w-[calc(100vw-1.5rem)] sm:w-[22rem] max-h-[40vh] sm:max-h-[55vh] flex flex-col glass-strong rounded-2xl overflow-hidden shadow-2xl glow-gold"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#D4AF37] to-[#F0D060] px-3 py-3 flex items-center gap-2">
              {/* Back button - prominent */}
              <button
                onClick={() => setIsOpen(false)}
                className="w-10 h-10 rounded-xl bg-white/30 flex items-center justify-center hover:bg-white/50 transition-colors shrink-0"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5 text-[#070B14]" />
              </button>
              {/* AI Icon */}
              <div className="w-10 h-10 rounded-2xl bg-[#070B14]/20 flex items-center justify-center overflow-hidden shrink-0">
                <img src="/nexvo-ai-icon.jpeg" alt="NEXVO AI" className="w-full h-full object-cover rounded-2xl" />
              </div>
              {/* Title */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#070B14] text-sm leading-tight">{t('ai.assistant')}</h3>
                <p className="text-[#070B14]/70 text-xs leading-tight">{t('ai.online')}</p>
              </div>
              {/* Reset & Close buttons */}
              <button
                onClick={() => setMessages([{ role: 'assistant', content: t('ai.greeting') }])}
                className="w-9 h-9 rounded-xl bg-white/30 flex items-center justify-center hover:bg-white/50 transition-colors shrink-0"
                title="Reset Chat"
              >
                <RotateCcw className="w-4 h-4 text-[#070B14]" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-9 h-9 rounded-xl bg-white/30 flex items-center justify-center hover:bg-white/50 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-5 h-5 text-[#070B14]" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 min-h-[200px] sm:min-h-[280px] max-h-[40vh] sm:max-h-[55vh]" style={{ scrollbarWidth: 'thin' }}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    msg.role === 'user' ? 'bg-[#D4AF37]/20' : 'bg-[#1E3A5F]/30'
                  }`}>
                    {msg.role === 'user' ? (
                      <User className="w-4 h-4 text-[#D4AF37]" />
                    ) : (
                      <img src="/nexvo-ai-icon.jpeg" alt="AI" className="w-full h-full object-cover rounded-xl" />
                    )}
                  </div>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#D4AF37]/20 text-foreground rounded-tr-md'
                      : 'bg-[#1E3A5F]/30 text-foreground rounded-tl-md'
                  }`}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#1E3A5F]/30 flex items-center justify-center shrink-0 overflow-hidden">
                    <img src="/nexvo-ai-icon.jpeg" alt="AI" className="w-full h-full object-cover rounded-xl" />
                  </div>
                  <div className="bg-[#1E3A5F]/30 px-4 py-3 rounded-2xl rounded-tl-md">
                    <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-[#D4AF37]/10">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={t("ai.typeMessage")}
                  className="flex-1 bg-[#0F172A]/60 border border-[#D4AF37]/20 rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 rounded-2xl bg-gradient-to-r from-[#D4AF37] to-[#F0D060] flex items-center justify-center disabled:opacity-50 hover:shadow-lg transition-all"
                >
                  <Send className="w-4 h-4 text-[#070B14]" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button — hidden when chat is open */}
      {!isOpen && (
        <motion.button
          onClick={() => setIsOpen(true)}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="fixed bottom-20 right-3 sm:bottom-6 sm:right-6 md:bottom-8 md:right-6 z-50 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#F0D060] flex items-center justify-center shadow-lg glow-gold hover:scale-105 transition-transform overflow-hidden"
          whileTap={{ scale: 0.95 }}
        >
          <img src="/nexvo-ai-icon.jpeg" alt="NEXVO AI" className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl" />
        </motion.button>
      )}
    </>
  );
}
