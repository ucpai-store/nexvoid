'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, Phone, Link2, Unlink, Send, Settings,
  CheckCircle2, XCircle, Loader2, RefreshCw, QrCode, Key,
  ToggleLeft, ToggleRight, MessageSquare, Users, Plus, Trash2, Edit3, Save, X,
  Copy, ExternalLink, Info,
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
  status: 'connected' | 'disconnected' | 'pairing' | 'qr_ready' | 'connecting';
  phoneNumber: string | null;
  pairingCode: string | null;
  pairingCodeExpiry: string | null;
  hasQR: boolean;
  hasQRImage: boolean;
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
  const [qrImageBase64, setQrImageBase64] = useState<string | null>(null);

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
  const qrRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/whatsapp?action=status', {
        headers: { Authorization: 'Bearer ' + adminToken },
      });
      const data = await res.json();
      if (data.service) {
        setBotStatus(data);
        // Auto-fetch QR image if available
        if (data.hasQRImage && data.status !== 'connected') {
          fetchQRImage();
        }
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

  const fetchQRImage = useCallback(async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/whatsapp?action=qr-image', {
        headers: { Authorization: 'Bearer ' + adminToken },
      });
      const data = await res.json();
      if (data.success && data.image) {
        setQrImageBase64(data.image);
      } else {
        // Fallback: try QR string
        const qrRes = await fetch('/api/admin/whatsapp?action=qr', {
          headers: { Authorization: 'Bearer ' + adminToken },
        });
        const qrDataRes = await qrRes.json();
        if (qrDataRes.success && qrDataRes.qr) setQrData(qrDataRes.qr);
      }
    } catch {}
  }, [adminToken]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchConfig(), fetchWaAdmins()]);
    setLoading(false);
  }, [fetchStatus, fetchConfig, fetchWaAdmins]);

  useEffect(() => {
    loadData();
    // Poll status every 5 seconds
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [loadData, fetchStatus]);

  // Auto-refresh QR image every 15 seconds when in QR mode and not connected
  useEffect(() => {
    if (connectionMode === 'qr' && botStatus?.hasQR && !botStatus?.status?.includes('connect')) {
      qrRefreshRef.current = setInterval(fetchQRImage, 15000);
    }
    return () => { if (qrRefreshRef.current) clearInterval(qrRefreshRef.current); };
  }, [connectionMode, botStatus?.hasQR, fetchQRImage]);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // ──── Bot Connection ────
  const handleConnect = async () => {
    if (connectionMode === 'pairing' && !phoneNumber) return;
    if (!adminToken) return;
    setConnecting(true);
    setQrImageBase64(null);
    setQrData(null);

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
          toast({ title: 'Bot Connected!', description: 'WhatsApp bot is now online.' });
          setConnecting(false);
          return;
        }

        // Start polling for status
        let attempts = 0;
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await fetch('/api/admin/whatsapp?action=status', {
              headers: { Authorization: 'Bearer ' + adminToken },
            });
            const statusData = await statusRes.json();
            if (statusData.service) setBotStatus(statusData);

            if (statusData.status === 'connected') {
              setBotStatus(statusData);
              toast({ title: 'Bot Connected!', description: 'WhatsApp bot is now online.' });
              setConnecting(false);
              if (pollingRef.current) clearInterval(pollingRef.current);
              return;
            }

            // Fetch QR image if available
            if (statusData.hasQR) {
              fetchQRImage();
            }

            if (attempts > 90) { // 3 minutes timeout
              setConnecting(false);
              if (pollingRef.current) clearInterval(pollingRef.current);
              toast({ title: 'Connection Timeout', description: 'The pairing code or QR code has expired. Please try again.', variant: 'destructive' });
            }
          } catch {}
        }, 2000);

        if (data.pairingCode) {
          toast({ title: 'Pairing Code Ready!', description: `Code: ${data.pairingCode} — Enter it in your WhatsApp app.` });
        } else if (data.hasQR) {
          toast({ title: 'QR Code Ready!', description: 'Scan the QR code with your WhatsApp app.' });
          fetchQRImage();
        } else {
          toast({ title: 'Connecting...', description: 'Waiting for response from WhatsApp servers.' });
        }
      } else {
        toast({ title: 'Connection Failed', description: data.error || 'Could not connect to bot service.', variant: 'destructive' });
        setConnecting(false);
      }
    } catch {
      toast({ title: 'Network Error', description: 'Could not reach the bot service.', variant: 'destructive' });
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
        toast({ title: 'Bot Disconnected', description: 'Session cleared successfully.' });
        setQrImageBase64(null);
        setQrData(null);
        fetchStatus();
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    }
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
      if (data.success) toast({ title: 'Configuration Saved!' });
      else toast({ title: 'Save Failed', description: data.error, variant: 'destructive' });
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    }
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
      if (data.success) {
        toast({ title: 'Message Sent!' });
        setSendPhone('');
        setSendMessage('');
      }
      else toast({ title: 'Send Failed', description: data.error, variant: 'destructive' });
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    }
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
        toast({ title: 'CS Number Added!' });
        setNewName('');
        setNewPhone('');
        setAddingAdmin(false);
        fetchWaAdmins();
      } else {
        toast({ title: 'Add Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    }
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
        toast({ title: 'CS Number Updated!' });
        setEditingAdmin(null);
        fetchWaAdmins();
      } else {
        toast({ title: 'Update Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    }
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
        toast({ title: admin.isActive ? 'CS Disabled' : 'CS Enabled' });
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
        toast({ title: 'CS Number Deleted' });
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

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            WhatsApp Bot
          </h1>
          <p className="text-muted-foreground text-sm">Manage WhatsApp bot connection & CS numbers</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="rounded-xl border-primary/20">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </motion.div>

      {/* Status Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass glow-gold rounded-2xl p-4 sm:p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isConnected ? 'bg-cardmerald-400/10' : 'bg-red-400/10'}`}>
              {isConnected ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <XCircle className="w-6 h-6 text-red-400" />}
            </div>
            <div>
              <h3 className="text-foreground font-semibold">{isConnected ? 'Bot Connected' : 'Bot Inactive'}</h3>
              <p className="text-muted-foreground text-sm">
                {botStatus?.phoneNumber ? `+${botStatus.phoneNumber}` : 'Not connected yet'}
              </p>
            </div>
          </div>
          <Badge className={`${isConnected ? 'bg-cardmerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'} border-border`}>
            {isConnected ? 'Online' : 'Offline'}
          </Badge>
        </div>

        {/* Pairing Code Display in Status Card */}
        {botStatus?.pairingCode && !isConnected && connectionMode === 'pairing' && (
          <div className="mt-4 p-5 bg-primary/5 rounded-xl border border-primary/20">
            <p className="text-foreground text-sm font-semibold mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" /> Your WhatsApp Pairing Code:
            </p>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-primary font-bold text-3xl tracking-[0.3em] font-mono">{botStatus.pairingCode}</p>
              <Button size="sm" variant="outline" className="rounded-lg border-primary/20 text-primary h-9"
                onClick={() => { navigator.clipboard.writeText(botStatus.pairingCode!); toast({ title: 'Code Copied!' }); }}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="bg-black/20 rounded-lg p-3 space-y-1.5">
              <p className="text-primary text-xs font-bold mb-1">📌 HOW TO CONNECT (Step by Step):</p>
              <p className="text-muted-foreground text-xs">1. Open <span className="text-foreground font-semibold">WhatsApp</span> on your phone</p>
              <p className="text-muted-foreground text-xs">2. Tap <span className="text-foreground font-semibold">⋮ menu</span> (3 dots, top right)</p>
              <p className="text-muted-foreground text-xs">3. Tap <span className="text-foreground font-semibold">Linked devices</span></p>
              <p className="text-muted-foreground text-xs">4. Tap <span className="text-foreground font-semibold">Link a device</span></p>
              <p className="text-muted-foreground text-xs">5. Select <span className="text-foreground font-semibold">"Link with phone number"</span></p>
              <p className="text-muted-foreground text-xs">6. Enter this code: <span className="text-primary font-bold text-sm">{botStatus.pairingCode}</span></p>
            </div>
            <p className="text-yellow-400 text-xs mt-2">⚠️ This code is temporary and will expire in a few minutes. If expired, click Connect again.</p>
            {connecting && (
              <div className="flex items-center gap-2 mt-3">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <p className="text-primary text-xs">Waiting for you to enter the code in WhatsApp...</p>
              </div>
            )}
          </div>
        )}

        {/* QR Code Display in Status Card */}
        {qrImageBase64 && !isConnected && connectionMode === 'qr' && (
          <div className="mt-4 p-5 bg-white rounded-xl border border-gray-200">
            <p className="text-black text-sm font-bold mb-2 flex items-center gap-2">
              <QrCode className="w-4 h-4" /> Scan this QR Code with WhatsApp:
            </p>
            <div className="flex justify-center mb-3">
              <img
                src={qrImageBase64}
                alt="WhatsApp QR Code"
                className="rounded-lg"
                width={256}
                height={256}
              />
            </div>
            <div className="bg-gray-100 rounded-lg p-3 space-y-1.5">
              <p className="text-gray-800 text-xs font-bold mb-1">📌 HOW TO SCAN (Step by Step):</p>
              <p className="text-muted-foreground text-xs">1. Open <span className="text-gray-900 font-semibold">WhatsApp</span> on your phone</p>
              <p className="text-muted-foreground text-xs">2. Tap <span className="text-gray-900 font-semibold">⋮ menu</span> (3 dots, top right)</p>
              <p className="text-muted-foreground text-xs">3. Tap <span className="text-gray-900 font-semibold">Linked devices</span></p>
              <p className="text-muted-foreground text-xs">4. Tap <span className="text-gray-900 font-semibold">Link a device</span></p>
              <p className="text-muted-foreground text-xs">5. <span className="text-gray-900 font-semibold">Point your camera</span> at the QR code above</p>
            </div>
            <p className="text-amber-600 text-xs mt-2">⚠️ QR code refreshes automatically. If expired, click Generate QR Code again.</p>
            {connecting && (
              <div className="flex items-center gap-2 mt-3 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                <p className="text-amber-600 text-xs">Waiting for QR scan...</p>
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.key ? 'bg-primary/15 text-primary glow-gold' : 'glass text-foreground/60 hover:text-foreground hover:bg-foreground/5'}`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Connect Tab */}
      {activeTab === 'connect' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 sm:p-6">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" /> Connect Bot to WhatsApp
          </h3>

          {/* Info Box */}
          <div className="mb-5 p-3 bg-blue-500/5 rounded-xl border border-blue-500/10">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-blue-300 text-xs font-semibold mb-1">How WhatsApp Bot Connection Works:</p>
                <p className="text-muted-foreground text-xs">This bot connects as a <span className="text-foreground font-semibold">Linked Device</span> (companion) to your WhatsApp account. Just like WhatsApp Web, you link it by entering a pairing code or scanning a QR code from your primary WhatsApp app.</p>
              </div>
            </div>
          </div>

          {/* Connection Mode Selection */}
          {!isConnected && (
            <div className="mb-5">
              <Label className="text-muted-foreground text-xs mb-3 block">Choose Connection Method</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConnectionMode('pairing')}
                  className={`p-4 rounded-xl border-border transition-all text-left ${connectionMode === 'pairing' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
                >
                  <Key className={`w-6 h-6 mb-2 ${connectionMode === 'pairing' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className={`font-semibold text-sm ${connectionMode === 'pairing' ? 'text-primary' : 'text-foreground'}`}>Pairing Code</p>
                  <p className="text-muted-foreground text-[10px] mt-1">Get a code, enter it in your WhatsApp Linked Devices</p>
                </button>
                <button
                  onClick={() => setConnectionMode('qr')}
                  className={`p-4 rounded-xl border-border transition-all text-left ${connectionMode === 'qr' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
                >
                  <QrCode className={`w-6 h-6 mb-2 ${connectionMode === 'qr' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className={`font-semibold text-sm ${connectionMode === 'qr' ? 'text-primary' : 'text-foreground'}`}>Scan QR Code</p>
                  <p className="text-muted-foreground text-[10px] mt-1">Scan QR code with WhatsApp, just like WhatsApp Web</p>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Pairing Code Mode - Phone Input */}
            {connectionMode === 'pairing' && !isConnected && (
              <div>
                <Label className="text-muted-foreground text-xs mb-2 block">Your WhatsApp Phone Number</Label>
                <div className="flex items-center gap-2">
                  <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="628xxxxxxxxxx" className="glass rounded-xl border-primary/20 bg-transparent text-foreground flex-1" />
                  <Button onClick={handleConnect} disabled={connecting || !phoneNumber}
                    className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90">
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    <span className="ml-1.5">{connecting ? 'Connecting...' : 'Connect'}</span>
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs mt-1">Format: 628xxxxxxxxxx (country code + number, no + or spaces)</p>
              </div>
            )}

            {/* QR Code Mode - Generate Button */}
            {connectionMode === 'qr' && !isConnected && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Button onClick={handleConnect} disabled={connecting}
                    className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90">
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <QrCode className="w-4 h-4 mr-2" />}
                    {connecting ? 'Generating QR...' : 'Generate QR Code'}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">Click the button above to generate a QR code, then scan it with your WhatsApp app.</p>
              </div>
            )}

            {/* Connected State */}
            {isConnected && (
              <div className="p-4 rounded-xl bg-cardmerald-400/10 border border-emerald-400/30">
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
                  Disconnect Bot
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
              <Users className="w-5 h-5 text-primary" /> CS WhatsApp Numbers
            </h3>
            <Button onClick={() => setAddingAdmin(true)} disabled={addingAdmin}
              className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 h-9 text-sm">
              <Plus className="w-4 h-4 mr-1" /> Add CS
            </Button>
          </div>

          <p className="text-muted-foreground text-xs mb-4">
            These CS numbers are shown to users when they need help via the chat bubble or bot help command.
          </p>

          {/* Add New Admin Form */}
          <AnimatePresence>
            {addingAdmin && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-4 bg-primary/5 rounded-xl border border-primary/20 overflow-hidden">
                <h4 className="text-foreground text-sm font-semibold mb-3">Add New CS Number</h4>
                <div className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground text-xs mb-1 block">CS Name</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. CS NEXVO" className="glass rounded-xl border-primary/20 bg-transparent text-foreground" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs mb-1 block">WhatsApp Number</Label>
                    <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="628xxxxxxxxxx" className="glass rounded-xl border-primary/20 bg-transparent text-foreground" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={handleAddAdmin} disabled={savingAdmin || !newName || !newPhone}
                      className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90">
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
              <p className="text-muted-foreground text-sm">No CS numbers yet</p>
              <p className="text-muted-foreground text-xs">Add a CS WhatsApp number above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {waAdmins.map((admin) => (
                <div key={admin.id} className={`p-4 rounded-xl border transition-all ${admin.isActive ? 'bg-white/[0.03] border-white/5' : 'bg-white/[0.01] border-white/5 opacity-50'}`}>
                  {editingAdmin === admin.id ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                          className="glass rounded-xl border-primary/20 bg-transparent text-foreground flex-1" placeholder="Name" />
                        <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                          className="glass rounded-xl border-primary/20 bg-transparent text-foreground flex-1" placeholder="628xxx" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={() => handleUpdateAdmin(admin.id)} disabled={savingAdmin}
                          className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 h-8 text-xs">
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${admin.isActive ? 'bg-cardmerald-400/10' : 'bg-gray-400/10'}`}>
                          <Phone className={`w-5 h-5 ${admin.isActive ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <h4 className="text-foreground text-sm font-semibold">{admin.name}</h4>
                          <p className="text-muted-foreground text-xs">+{admin.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleToggleAdmin(admin)}
                          className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors" title={admin.isActive ? 'Disable' : 'Enable'}>
                          {admin.isActive
                            ? <ToggleRight className="w-6 h-6 text-emerald-400" />
                            : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                        </button>
                        <button onClick={() => startEdit(admin)}
                          className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors text-foreground/50 hover:text-primary" title="Edit">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteAdmin(admin.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-foreground/50 hover:text-red-400" title="Delete">
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
            <Settings className="w-5 h-5 text-primary" /> Bot Settings
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
              <div>
                <p className="text-foreground text-sm font-medium">Auto Reply</p>
                <p className="text-muted-foreground text-xs">Bot automatically replies to incoming messages</p>
              </div>
              <button onClick={() => setConfig({ ...config, autoReply: !config.autoReply })} className="text-foreground">
                {config.autoReply ? <ToggleRight className="w-8 h-8 text-emerald-400" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl">
              <div>
                <p className="text-foreground text-sm font-medium">Registered Users Only</p>
                <p className="text-muted-foreground text-xs">Only reply to numbers registered on Nexvo</p>
              </div>
              <button onClick={() => setConfig({ ...config, onlyRegistered: !config.onlyRegistered })} className="text-foreground">
                {config.onlyRegistered ? <ToggleRight className="w-8 h-8 text-emerald-400" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
              </button>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Welcome Message</Label>
              <Textarea value={config.welcomeMessage} onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                className="glass rounded-xl border-primary/20 bg-transparent text-foreground min-h-[80px]" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Menu Header</Label>
              <Input value={config.menuHeader} onChange={(e) => setConfig({ ...config, menuHeader: e.target.value })}
                className="glass rounded-xl border-primary/20 bg-transparent text-foreground" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Menu Footer</Label>
              <Input value={config.menuFooter} onChange={(e) => setConfig({ ...config, menuFooter: e.target.value })}
                className="glass rounded-xl border-primary/20 bg-transparent text-foreground" />
            </div>
            <Button onClick={handleSaveConfig} disabled={saving}
              className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 w-full">
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
            <Send className="w-5 h-5 text-primary" /> Send Manual Message
          </h3>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">WhatsApp Number</Label>
              <Input value={sendPhone} onChange={(e) => setSendPhone(e.target.value)}
                placeholder="628xxxxxxxxxx" className="glass rounded-xl border-primary/20 bg-transparent text-foreground" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Message</Label>
              <Textarea value={sendMessage} onChange={(e) => setSendMessage(e.target.value)}
                placeholder="Type your message..." className="glass rounded-xl border-primary/20 bg-transparent text-foreground min-h-[120px]" />
            </div>
            <Button onClick={handleSendMessage} disabled={sending || !sendPhone || !sendMessage || !isConnected}
              className="bg-cardmerald-600 hover:bg-cardmerald-700 text-white font-semibold rounded-xl w-full">
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
