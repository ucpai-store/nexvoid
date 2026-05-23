'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, Phone, Link2, Unlink, Send, Settings,
  CheckCircle2, XCircle, Loader2, RefreshCw, QrCode, Key,
  ToggleLeft, ToggleRight, MessageSquare, Users, Plus, Trash2, Edit3, Save, X,
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
  status: 'connected' | 'disconnected' | 'pairing' | 'connecting';
  phoneNumber: string | null;
  pairingCode: string | null;
  hasQR: boolean;
  connectionMode?: 'pairing' | 'qr';
  autoReply: boolean;
}

interface BotConfig {
  autoReply: boolean;
  onlyRegistered: boolean;
  welcomeMessage: string;
  menuHeader: string;
  menuFooter: string;
}

interface WAAdmin {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  order: number;
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
  const [activeTab, setActiveTab] = useState<'connect' | 'cs' | 'config' | 'send'>('connect');
  const [connectionMode, setConnectionMode] = useState<'pairing' | 'qr'>('pairing');
  const [qrData, setQrData] = useState<string | null>(null);

  // WhatsApp Admin (CS) state
  const [waAdmins, setWaAdmins] = useState<WAAdmin[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [savingAdmin, setSavingAdmin] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
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

  const fetchWaAdmins = useCallback(async () => {
    if (!adminToken) return;
    setLoadingAdmins(true);
    try {
      const res = await fetch('/api/admin/whatsapp-admins', {
        headers: { Authorization: 'Bearer ' + adminToken },
      });
      const data = await res.json();
      if (data.success) {
        setWaAdmins(data.data);
      }
    } catch {} finally {
      setLoadingAdmins(false);
    }
  }, [adminToken]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchConfig(), fetchWaAdmins()]);
    setLoading(false);
  }, [fetchStatus, fetchConfig, fetchWaAdmins]);

  useEffect(() => {
    loadData();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [loadData, fetchStatus]);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // ──── Bot Connection ────
  const handleConnect = async () => {
    if (!phoneNumber || !adminToken) return;
    setConnecting(true);
    try {
      const res = await fetch('/api/admin/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'connect', phoneNumber, mode: connectionMode }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.connected) {
          setBotStatus(prev => prev ? { ...prev, status: 'connected', phoneNumber: data.phoneNumber } : prev);
          toast({ title: '✅ Bot Connected!' });
          setConnecting(false);
          return;
        }
        toast({ title: 'Connecting...', description: 'Waiting for pairing code' });
        let attempts = 0;
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await fetch('/api/admin/whatsapp?action=status', {
              headers: { Authorization: 'Bearer ' + adminToken },
            });
            const statusData = await statusRes.json();
            if (statusData.status === 'connected') {
              setBotStatus(statusData);
              toast({ title: '✅ Bot Connected!' });
              setConnecting(false);
              if (pollingRef.current) clearInterval(pollingRef.current);
              return;
            }
            if (statusData.pairingCode) setBotStatus(statusData);
            // Also fetch QR data if in QR mode
            if (statusData.hasQR && connectionMode === 'qr') {
              try {
                // Try to get base64 image first
                const imgRes = await fetch('/api/admin/whatsapp?action=qr-image', {
                  headers: { Authorization: 'Bearer ' + adminToken },
                });
                const imgData = await imgRes.json();
                if (imgData.success && imgData.image) {
                  setQrImageBase64(imgData.image);
                } else {
                  // Fallback to QR string
                  const qrRes = await fetch('/api/admin/whatsapp?action=qr', {
                    headers: { Authorization: 'Bearer ' + adminToken },
                  });
                  const qrDataRes = await qrRes.json();
                  if (qrDataRes.success && qrDataRes.qr) setQrData(qrDataRes.qr);
                }
              } catch {}
            }
            if (attempts > 60) {
              setConnecting(false);
              if (pollingRef.current) clearInterval(pollingRef.current);
              toast({ title: '⏰ Timeout', description: 'Try reconnecting.', variant: 'destructive' });
            }
          } catch {}
        }, 2000);
        if (data.pairingCode) {
          setBotStatus(prev => prev ? { ...prev, pairingCode: data.pairingCode } : prev);
          toast({ title: '📱 Pairing Code Ready!', description: 'Enter the code in your WhatsApp' });
        }
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
        setConnecting(false);
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
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
      if (data.success) { toast({ title: 'Bot disconnected' }); fetchStatus(); }
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
    finally { setDisconnecting(false); }
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
      if (data.success) toast({ title: 'Configuration saved!' });
      else toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
    finally { setSaving(false); }
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
      if (data.success) { toast({ title: 'Message terkirim!' }); setSendPhone(''); setSendMessage(''); }
      else toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
    finally { setSending(false); }
  };

  // ──── WhatsApp Admin (CS) CRUD ────
  const handleAddAdmin = async () => {
    if (!newName || !newPhone || !adminToken) return;
    setSavingAdmin(true);
    try {
      const res = await fetch('/api/admin/whatsapp-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ name: newName, phone: newPhone, isActive: true, order: waAdmins.length }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '✅ CS Numbers ditambahkan!' });
        setNewName(''); setNewPhone(''); setAddingAdmin(false);
        fetchWaAdmins();
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
    finally { setSavingAdmin(false); }
  };

  const handleUpdateAdmin = async (id: string) => {
    if (!editName || !editPhone || !adminToken) return;
    setSavingAdmin(true);
    try {
      const res = await fetch('/api/admin/whatsapp-admins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ id, name: editName, phone: editPhone }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '✅ CS Numbers diperbarui!' });
        setEditingAdmin(null);
        fetchWaAdmins();
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
    finally { setSavingAdmin(false); }
  };

  const handleToggleAdmin = async (admin: WAAdmin) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/whatsapp-admins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ id: admin.id, isActive: !admin.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: admin.isActive ? 'CS disabled' : '✅ CS enabled' });
        fetchWaAdmins();
      }
    } catch {}
  };

  const handleDeleteAdmin = async (id: string) => {
    if (!adminToken) return;
    if (!confirm('Delete this CS number?')) return;
    try {
      const res = await fetch(`/api/admin/whatsapp-admins?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + adminToken },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'CS Numbers dihapus' });
        fetchWaAdmins();
      }
    } catch {}
  };

  const startEdit = (admin: WAAdmin) => {
    setEditingAdmin(admin.id);
    setEditName(admin.name);
    setEditPhone(admin.phone);
  };

  const isConnected = botStatus?.status === 'connected';
  // Also update QR data from status
  useEffect(() => { if (botStatus?.hasQR && connectionMode === 'qr' && !qrData) { fetchQR(); } }, [botStatus?.hasQR]);

  const fetchQR = async () => { 
    try { 
      // First try to get base64 image from bot
      const imgRes = await fetch('/api/admin/whatsapp?action=qr-image', { headers: { Authorization: 'Bearer ' + adminToken } }); 
      const imgData = await imgRes.json(); 
      if (imgData.success && imgData.image) { 
        setQrImageBase64(imgData.image); 
      } else {
        // Fallback to QR string
        const res = await fetch('/api/admin/whatsapp?action=qr', { headers: { Authorization: 'Bearer ' + adminToken } }); 
        const data = await res.json(); 
        if (data.success && data.qr) setQrData(data.qr); 
      }
    } catch {} 
  };

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-[#D4AF37]" />
            WhatsApp Bot
          </h1>
          <p className="text-muted-foreground text-sm">Manage WhatsApp bot & CS numbers</p>
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
              <h3 className="text-foreground font-semibold">{isConnected ? 'Bot Connected' : 'Bot Inactive'}</h3>
              <p className="text-muted-foreground text-sm">
                {botStatus?.phoneNumber ? `+${botStatus.phoneNumber}` : 'No number yet'}
              </p>
            </div>
          </div>
          <Badge className={`${isConnected ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'} border-0`}>
            {isConnected ? 'Online' : 'Offline'}
          </Badge>
        </div>

        {botStatus?.pairingCode && !isConnected && (
          <div className="mt-4 p-5 bg-[#D4AF37]/5 rounded-xl border border-[#D4AF37]/20">
            <p className="text-foreground text-sm font-semibold mb-2">📱 WhatsApp Pairing Code:</p>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[#D4AF37] font-bold text-3xl tracking-[0.3em] font-mono">{botStatus.pairingCode}</p>
              <Button size="sm" variant="outline" className="rounded-lg border-[#D4AF37]/20 text-[#D4AF37] h-9"
                onClick={() => { navigator.clipboard.writeText(botStatus.pairingCode!); toast({ title: 'Code copied!' }); }}>
                Copy
              </Button>
            </div>
            <div className="bg-black/20 rounded-lg p-3 space-y-1.5">
              <p className="text-muted-foreground text-xs font-semibold">📌 How to Connect:</p>
              <p className="text-muted-foreground text-xs">1. Open WhatsApp on your phone</p>
              <p className="text-muted-foreground text-xs">2. Tap ⋮ (menu) → Linked Devices</p>
              <p className="text-muted-foreground text-xs">3. Tap "Link a device"</p>
              <p className="text-muted-foreground text-xs">4. Select "Link with phone number"</p>
              <p className="text-muted-foreground text-xs">5. Enter code: <span className="text-[#D4AF37] font-bold">{botStatus.pairingCode}</span></p>
            </div>
            <p className="text-yellow-400 text-xs mt-2">⚠️ Code is temporary. If expired, reconnect.</p>
            {connecting && (
              <div className="flex items-center gap-2 mt-3">
                <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                <p className="text-[#D4AF37] text-xs">Waiting for code to be entered on WhatsApp...</p>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar">
        {[
          { key: 'connect' as const, label: 'Connection', icon: Link2 },
          { key: 'cs' as const, label: 'CS Numbers', icon: Users },
          { key: 'config' as const, label: 'Settings', icon: Settings },
          { key: 'send' as const, label: 'Send Message', icon: Send },
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
            <Phone className="w-5 h-5 text-[#D4AF37]" /> Connect Bot
          </h3>
          
          {/* Connection Mode Selection */}
          {!isConnected && (
            <div className="mb-5">
              <Label className="text-muted-foreground text-xs mb-3 block">Connection Method</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConnectionMode('pairing')}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${connectionMode === 'pairing' ? 'border-[#D4AF37] bg-[#D4AF37]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
                >
                  <Key className={`w-6 h-6 mb-2 ${connectionMode === 'pairing' ? 'text-[#D4AF37]' : 'text-muted-foreground'}`} />
                  <p className={`font-semibold text-sm ${connectionMode === 'pairing' ? 'text-[#D4AF37]' : 'text-foreground'}`}>Pairing Code</p>
                  <p className="text-muted-foreground text-[10px] mt-1">Enter bot number, get code to input in WhatsApp</p>
                </button>
                <button
                  onClick={() => setConnectionMode('qr')}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${connectionMode === 'qr' ? 'border-[#D4AF37] bg-[#D4AF37]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
                >
                  <QrCode className={`w-6 h-6 mb-2 ${connectionMode === 'qr' ? 'text-[#D4AF37]' : 'text-muted-foreground'}`} />
                  <p className={`font-semibold text-sm ${connectionMode === 'qr' ? 'text-[#D4AF37]' : 'text-foreground'}`}>Scan QR Code</p>
                  <p className="text-muted-foreground text-[10px] mt-1">Scan QR code with WhatsApp like WhatsApp Web</p>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Pairing Code Mode - Phone Input */}
            {connectionMode === 'pairing' && !isConnected && (
              <div>
                <Label className="text-muted-foreground text-xs mb-2 block">Bot WhatsApp Number</Label>
                <div className="flex items-center gap-2">
                  <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="628xxxxxxxxxx" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground flex-1" />
                  <Button onClick={handleConnect} disabled={connecting || !phoneNumber}
                    className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90">
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    <span className="ml-1.5">{connecting ? 'Connecting...' : 'Connect'}</span>
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs mt-1">Format: 628xxxxxxxxxx (no + or spaces)</p>
              </div>
            )}

            {/* QR Code Mode - Scan Button */}
            {connectionMode === 'qr' && !isConnected && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Button onClick={handleConnect} disabled={connecting}
                    className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90">
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <QrCode className="w-4 h-4 mr-2" />}
                    {connecting ? 'Generating QR...' : 'Generate QR Code'}
                  </Button>
                </div>
              </div>
            )}

            {/* Pairing Code Display */}
            {botStatus?.pairingCode && !isConnected && connectionMode === 'pairing' && (
              <div className="p-4 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-center">
                <p className="text-[#D4AF37] text-xs font-semibold mb-2">📱 Your Pairing Code</p>
                <p className="text-3xl font-bold text-foreground tracking-[0.3em] font-mono">{botStatus.pairingCode}</p>
                <p className="text-muted-foreground text-xs mt-2">Open WhatsApp → Settings → Linked Devices → Link with phone number</p>
                <p className="text-muted-foreground text-[10px] mt-1">Enter this code in your WhatsApp app</p>
              </div>
            )}

            {/* QR Code Display */}
            {qrData && !isConnected && connectionMode === 'qr' && (
              <div className="p-4 rounded-xl bg-white text-center">
                <p className="text-black text-xs font-semibold mb-2">📱 Scan this QR Code</p>
                <img 
                  src={qrImageBase64 || `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrData)}`} 
                  alt="WhatsApp QR Code"
                  className="mx-auto rounded-lg"
                  width={256}
                  height={256}
                />
                <p className="text-gray-600 text-xs mt-2">Open WhatsApp → Settings → Linked Devices → Scan QR code</p>
              </div>
            )}

            {/* Connected State */}
            {isConnected && (
              <div className="p-4 rounded-xl bg-emerald-400/10 border border-emerald-400/30">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  <div>
                    <p className="text-emerald-400 font-semibold text-sm">Bot Connected!</p>
                    <p className="text-muted-foreground text-xs">Number: +{botStatus?.phoneNumber}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Disconnect Button */}
            {isConnected && (
              <div className="pt-4 border-t border-white/5">
                <Button onClick={handleDisconnect} disabled={disconnecting}
                  variant="outline" className="rounded-xl border-red-400/30 text-red-400 hover:bg-red-500/10">
                  {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlink className="w-4 h-4 mr-2" />}
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* CS Admin Numbers Tab */}
      {activeTab === 'cs' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-[#D4AF37]" /> CS WhatsApp Numbers
            </h3>
            <Button onClick={() => setAddingAdmin(true)} disabled={addingAdmin}
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 h-9 text-sm">
              <Plus className="w-4 h-4 mr-1" /> Add CS
            </Button>
          </div>

          <p className="text-muted-foreground text-xs mb-4">
            CS Numbers ini ditampilkan ke user saat mereka membutuhkan bantuan (menu Bantuan di bot & halaman kontak).
          </p>

          {/* Add New Admin Form */}
          <AnimatePresence>
            {addingAdmin && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-4 bg-[#D4AF37]/5 rounded-xl border border-[#D4AF37]/20 overflow-hidden">
                <h4 className="text-foreground text-sm font-semibold mb-3">Add CS Numbers Baru</h4>
                <div className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground text-xs mb-1 block">CS Name</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="Example: CS NEXVO" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs mb-1 block">WhatsApp Number</Label>
                    <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="628xxxxxxxxxx" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={handleAddAdmin} disabled={savingAdmin || !newName || !newPhone}
                      className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90">
                      {savingAdmin ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                      Save
                    </Button>
                    <Button onClick={() => { setAddingAdmin(false); setNewName(''); setNewPhone(''); }}
                      variant="outline" className="rounded-xl border-white/10 text-foreground">
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Admin List */}
          {loadingAdmins ? (
            <div className="space-y-3">
              {[1,2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : waAdmins.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No number yet CS</p>
              <p className="text-muted-foreground text-xs">Add a CS WhatsApp number above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {waAdmins.map((admin) => (
                <div key={admin.id} className={`p-4 rounded-xl border transition-all ${admin.isActive ? 'bg-white/[0.03] border-white/5' : 'bg-white/[0.01] border-white/5 opacity-50'}`}>
                  {editingAdmin === admin.id ? (
                    /* Edit Mode */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                          className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground flex-1" placeholder="Nama" />
                        <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                          className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground flex-1" placeholder="628xxx" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={() => handleUpdateAdmin(admin.id)} disabled={savingAdmin}
                          className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 h-8 text-xs">
                          {savingAdmin ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                          Save
                        </Button>
                        <Button onClick={() => setEditingAdmin(null)} variant="outline"
                          className="rounded-xl border-white/10 text-foreground h-8 text-xs">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${admin.isActive ? 'bg-emerald-400/10' : 'bg-gray-400/10'}`}>
                          <Phone className={`w-5 h-5 ${admin.isActive ? 'text-emerald-400' : 'text-gray-400'}`} />
                        </div>
                        <div>
                          <h4 className="text-foreground text-sm font-semibold">{admin.name}</h4>
                          <p className="text-muted-foreground text-xs">+{admin.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleToggleAdmin(admin)}
                          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title={admin.isActive ? 'Disable' : 'Enable'}>
                          {admin.isActive
                            ? <ToggleRight className="w-6 h-6 text-emerald-400" />
                            : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                        </button>
                        <button onClick={() => startEdit(admin)}
                          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-foreground/50 hover:text-[#D4AF37]" title="Edit">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteAdmin(admin.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-foreground/50 hover:text-red-400" title="Hapus">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Config Tab */}
      {activeTab === 'config' && config && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 sm:p-6">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#D4AF37]" /> Settings Bot
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
              <div>
                <p className="text-foreground text-sm font-medium">Auto Reply</p>
                <p className="text-muted-foreground text-xs">Bot automatically replies to messages</p>
              </div>
              <button onClick={() => setConfig({ ...config, autoReply: !config.autoReply })} className="text-foreground">
                {config.autoReply ? <ToggleRight className="w-8 h-8 text-emerald-400" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
              <div>
                <p className="text-foreground text-sm font-medium">Registered Users Only</p>
                <p className="text-muted-foreground text-xs">Only reply to registered numbers</p>
              </div>
              <button onClick={() => setConfig({ ...config, onlyRegistered: !config.onlyRegistered })} className="text-foreground">
                {config.onlyRegistered ? <ToggleRight className="w-8 h-8 text-emerald-400" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
              </button>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Welcome Message</Label>
              <Textarea value={config.welcomeMessage} onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground min-h-[80px]" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Menu Header</Label>
              <Input value={config.menuHeader} onChange={(e) => setConfig({ ...config, menuHeader: e.target.value })}
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Menu Footer</Label>
              <Input value={config.menuFooter} onChange={(e) => setConfig({ ...config, menuFooter: e.target.value })}
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
            </div>
            <Button onClick={handleSaveConfig} disabled={saving}
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Settings
            </Button>
          </div>
        </motion.div>
      )}

      {/* Send Message Tab */}
      {activeTab === 'send' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 sm:p-6">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <Send className="w-5 h-5 text-[#D4AF37]" /> Send Message Manual
          </h3>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">WhatsApp Number</Label>
              <Input value={sendPhone} onChange={(e) => setSendPhone(e.target.value)}
                placeholder="628xxxxxxxxxx" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Message</Label>
              <Textarea value={sendMessage} onChange={(e) => setSendMessage(e.target.value)}
                placeholder="Write message..." className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground min-h-[120px]" />
            </div>
            <Button onClick={handleSendMessage} disabled={sending || !sendPhone || !sendMessage || !isConnected}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl w-full">
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Send Message
            </Button>
            {!isConnected && (
              <p className="text-red-400 text-xs text-center">Connect the bot first to send messages</p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

