'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  MessageCircle, Phone, Link2, Unlink, Send, Settings,
  CheckCircle2, XCircle, Loader2, RefreshCw, QrCode, Key,
  ToggleLeft, ToggleRight, MessageSquare,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

interface BotStatus {
  service: string;
  status: 'connected' | 'disconnected';
  phoneNumber: string | null;
  pairingCode: string | null;
  hasQR: boolean;
  autoReply: boolean;
}

interface BotConfig {
  autoReply: boolean;
  onlyRegistered: boolean;
  welcomeMessage: string;
  menuHeader: string;
  menuFooter: string;
}

export default function AdminWhatsAppPage() {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendPhone, setSendPhone] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'connect' | 'config' | 'send'>('connect');
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/whatsapp?action=status', {
        headers: { Authorization: 'Bearer ' + adminToken },
      });
      const data = await res.json();
      if (data.success !== false && data.service) {
        setBotStatus(data);
      }
    } catch {}
  }, [adminToken]);

  const fetchConfig = useCallback(async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/whatsapp?action=config', {
        headers: { Authorization: 'Bearer ' + adminToken },
      });
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
      }
    } catch {}
  }, [adminToken]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchConfig()]);
    setLoading(false);
  }, [fetchStatus, fetchConfig]);

  useEffect(() => {
    loadData();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [loadData, fetchStatus]);

  const handleConnect = async () => {
    if (!phoneNumber || !adminToken) return;
    setConnecting(true);
    try {
      const res = await fetch('/api/admin/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'connect', phoneNumber }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Kode pairing dibuat!', description: 'Cek pairing code di bawah' });
        setTimeout(fetchStatus, 2000);
        setTimeout(fetchStatus, 5000);
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!adminToken) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/admin/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Bot disconnected' });
        fetchStatus();
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config || !adminToken) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'config', ...config }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Konfigurasi disimpan!' });
      } else {
        toast({ title: 'Gagal menyimpan', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendMessage = async () => {
    if (!sendPhone || !sendMessage || !adminToken) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'send', phone: sendPhone, message: sendMessage }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Pesan terkirim!' });
        setSendPhone('');
        setSendMessage('');
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const isConnected = botStatus?.status === 'connected';

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-[#D4AF37]" />
            WhatsApp Bot
          </h1>
          <p className="text-muted-foreground text-sm">Kelola bot WhatsApp otomatis</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="rounded-xl border-[#D4AF37]/20">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </motion.div>

      {/* Status Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass glow-gold rounded-2xl p-4 sm:p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isConnected ? 'bg-emerald-400/10' : 'bg-red-400/10'}`}>
              {isConnected ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <XCircle className="w-6 h-6 text-red-400" />}
            </div>
            <div>
              <h3 className="text-foreground font-semibold">{isConnected ? 'Bot Terkoneksi' : 'Bot Tidak Aktif'}</h3>
              <p className="text-muted-foreground text-sm">
                {botStatus?.phoneNumber ? `+${botStatus.phoneNumber}` : 'Belum ada nomor'}
              </p>
            </div>
          </div>
          <Badge className={`${isConnected ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'} border-0`}>
            {isConnected ? 'Online' : 'Offline'}
          </Badge>
        </div>

        {/* Pairing Code Display */}
        {botStatus?.pairingCode && !isConnected && (
          <div className="mt-4 p-4 bg-[#D4AF37]/5 rounded-xl border border-[#D4AF37]/20">
            <p className="text-muted-foreground text-xs mb-1">Kode Tautan / Pairing Code:</p>
            <div className="flex items-center gap-3">
              <p className="text-[#D4AF37] font-bold text-2xl tracking-[0.3em]">{botStatus.pairingCode}</p>
              <Button size="sm" variant="outline" className="rounded-lg border-[#D4AF37]/20 text-[#D4AF37] h-8"
                onClick={() => { navigator.clipboard.writeText(botStatus.pairingCode!); toast({ title: 'Kode disalin!' }); }}>
                Copy
              </Button>
            </div>
            <p className="text-muted-foreground text-xs mt-2">Buka WhatsApp → Perangkat tertaut → Tautkan perangkat → Masukkan kode</p>
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar">
        {[
          { key: 'connect' as const, label: 'Koneksi', icon: Link2 },
          { key: 'config' as const, label: 'Pengaturan', icon: Settings },
          { key: 'send' as const, label: 'Kirim Pesan', icon: Send },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.key ? 'bg-[#D4AF37]/15 text-[#D4AF37] glow-gold' : 'glass text-foreground/60 hover:text-foreground hover:bg-white/5'}`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Connect Tab */}
      {activeTab === 'connect' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 sm:p-6">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <Phone className="w-5 h-5 text-[#D4AF37]" /> Hubungkan Bot
          </h3>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Nomor WhatsApp Bot</Label>
              <div className="flex items-center gap-2">
                <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="628xxxxxxxxxx" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground flex-1" />
                <Button onClick={handleConnect} disabled={connecting || !phoneNumber}
                  className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90">
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  <span className="ml-1.5">Hubungkan</span>
                </Button>
              </div>
              <p className="text-muted-foreground text-xs mt-1">Format: 628xxxxxxxxxx (tanpa + atau spasi)</p>
            </div>

            {isConnected && (
              <div className="pt-4 border-t border-white/5">
                <Button onClick={handleDisconnect} disabled={disconnecting}
                  variant="outline" className="rounded-xl border-red-400/30 text-red-400 hover:bg-red-500/10">
                  {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlink className="w-4 h-4 mr-2" />}
                  Putuskan Koneksi
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Config Tab */}
      {activeTab === 'config' && config && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 sm:p-6">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#D4AF37]" /> Pengaturan Bot
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
              <div>
                <p className="text-foreground text-sm font-medium">Auto Reply</p>
                <p className="text-muted-foreground text-xs">Bot otomatis membalas pesan</p>
              </div>
              <button onClick={() => setConfig({ ...config, autoReply: !config.autoReply })}
                className="text-foreground">
                {config.autoReply ? <ToggleRight className="w-8 h-8 text-emerald-400" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
              <div>
                <p className="text-foreground text-sm font-medium">Hanya User Terdaftar</p>
                <p className="text-muted-foreground text-xs">Hanya balas nomor yang terdaftar</p>
              </div>
              <button onClick={() => setConfig({ ...config, onlyRegistered: !config.onlyRegistered })}
                className="text-foreground">
                {config.onlyRegistered ? <ToggleRight className="w-8 h-8 text-emerald-400" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
              </button>
            </div>

            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Pesan Selamat Datang</Label>
              <Textarea value={config.welcomeMessage} onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground min-h-[80px]" />
            </div>

            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Header Menu</Label>
              <Input value={config.menuHeader} onChange={(e) => setConfig({ ...config, menuHeader: e.target.value })}
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
            </div>

            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Footer Menu</Label>
              <Input value={config.menuFooter} onChange={(e) => setConfig({ ...config, menuFooter: e.target.value })}
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
            </div>

            <Button onClick={handleSaveConfig} disabled={saving}
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Simpan Pengaturan
            </Button>
          </div>
        </motion.div>
      )}

      {/* Send Message Tab */}
      {activeTab === 'send' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 sm:p-6">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <Send className="w-5 h-5 text-[#D4AF37]" /> Kirim Pesan Manual
          </h3>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Nomor WhatsApp</Label>
              <Input value={sendPhone} onChange={(e) => setSendPhone(e.target.value)}
                placeholder="628xxxxxxxxxx" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Pesan</Label>
              <Textarea value={sendMessage} onChange={(e) => setSendMessage(e.target.value)}
                placeholder="Tulis pesan..." className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground min-h-[120px]" />
            </div>
            <Button onClick={handleSendMessage} disabled={sending || !sendPhone || !sendMessage || !isConnected}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl w-full">
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Kirim Pesan
            </Button>
            {!isConnected && (
              <p className="text-red-400 text-xs text-center">Hubungkan bot terlebih dahulu untuk mengirim pesan</p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
