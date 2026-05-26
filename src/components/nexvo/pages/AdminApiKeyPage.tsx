'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Key, Plus, Trash2, Loader2, Copy, CheckCircle2,
  AlertTriangle, ShieldCheck, ShieldOff, Clock, Calendar,
  Eye, EyeOff, Smartphone, MessageSquare, Bell, BellOff,
  Settings2, Save, Bot, BookOpen, ChevronDown, ChevronUp,
  Link2, RefreshCw, Unplug, QrCode, Zap, Wifi, WifiOff, Activity, Phone
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

/* ───────── Types ───────── */
interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface GeneratedKey extends ApiKeyItem {
  key: string; // full raw key — only available once
}

interface PairingCodeData {
  pairingCode: string | null;
  expiresAt: string | null;
  isActive: boolean;
  botConnected?: boolean;
  botNumber?: string | null;
  adminNumber?: string | null;
  lastHeartbeat?: string | null;
  pairedAt?: string | null;
}

/* ═══════════════════════════════════════════
   ADMIN API KEY PAGE
   ═══════════════════════════════════════════ */
export default function AdminApiKeyPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<GeneratedKey | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  // Bot Configuration State
  const [botConfig, setBotConfig] = useState({
    bot_whatsapp_number: '',
    bot_admin_number: '',
    bot_notify_deposit: true,
    bot_notify_withdraw: true,
    bot_notify_register: true,
    bot_custom_api_key: '',
  });
  const [savingBot, setSavingBot] = useState(false);
  const [showApiDocs, setShowApiDocs] = useState(false);

  // Pairing Code State
  const [pairingData, setPairingData] = useState<PairingCodeData>({ pairingCode: null, expiresAt: null, isActive: false });
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingCopied, setPairingCopied] = useState(false);
  const [revokingPairing, setRevokingPairing] = useState(false);
  const [pairingCodeVisible, setPairingCodeVisible] = useState(false);
  // QR Code State
  const [connectMode, setConnectMode] = useState<'pairing' | 'qr'>('pairing');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  /* ─── Fetch API Keys ─── */
  const fetchKeys = useCallback(() => {
    if (!adminToken) return;
    fetch('/api/admin/api-keys', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setApiKeys(res.data);
      })
      .catch(() => {
        toast({ title: 'Failed to load API keys', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [adminToken]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  /* ─── Fetch Bot Config ─── */
  const fetchBotConfig = useCallback(() => {
    if (!adminToken) return;
    fetch('/api/admin/bot-config', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setBotConfig({
            bot_whatsapp_number: res.data.botWhatsappNumber || '',
            bot_admin_number: res.data.botAdminNumber || '',
            bot_notify_deposit: res.data.botNotifyDeposit !== false,
            bot_notify_withdraw: res.data.botNotifyWithdraw !== false,
            bot_notify_register: res.data.botNotifyRegister !== false,
            bot_custom_api_key: res.data.botCustomApiKey || '',
          });
        }
      })
      .catch(() => {});
  }, [adminToken]);

  useEffect(() => {
    fetchBotConfig();
  }, [fetchBotConfig]);

  /* ─── Fetch Pairing Code ─── */
  const fetchPairingCode = useCallback(() => {
    if (!adminToken) return;
    fetch('/api/admin/pairing-code', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setPairingData(res.data);
        }
      })
      .catch(() => {});
  }, [adminToken]);

  useEffect(() => {
    fetchPairingCode();
  }, [fetchPairingCode]);

  /* ─── Generate Pairing Code (request from WhatsApp via bot service) ─── */
  const handleGeneratePairingCode = async () => {
    const phone = botConfig.bot_admin_number?.replace(/[^0-9]/g, '');
    if (!phone) {
      toast({ title: 'Enter admin WhatsApp number first', description: 'Isi nomor di bagian Admin WhatsApp Number di atas', variant: 'destructive' });
      return;
    }
    setPairingLoading(true);
    try {
      const res = await fetch('/api/admin/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data = await res.json();
      if (data.success) {
        setPairingData({
          pairingCode: data.data.pairingCode,
          expiresAt: null,
          isActive: !!(data.data.pairingCode),
          botConnected: data.data.connected,
        });
        if (data.data.connected) {
          toast({ title: 'Bot Connected!', description: 'WhatsApp bot is connected.' });
        } else if (data.data.pairingCode) {
          toast({ title: '📱 Pairing Code Ready!', description: 'Masukkan kode ini di WhatsApp HP Anda: Settings {'>'} Linked Devices {'>'} Link with phone number' });
          startPolling();
        } else {
          toast({ title: 'Waiting...', description: 'Waiting for pairing code from WhatsApp.' });
        }
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    } finally {
      setPairingLoading(false);
    }
  };

  /* ─── Polling for connection status ─── */
  const startPolling = () => {
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/admin/pairing-code', {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const data = await res.json();
        if (data.success && data.data) {
          setPairingData(data.data);
          if (data.data.botConnected) {
            toast({ title: '✅ Bot Connected!', description: 'WhatsApp bot connected successfully!' });
            clearInterval(pollInterval);
          }
        }
        if (attempts >= 60) {
          clearInterval(pollInterval);
        }
      } catch {}
    }, 3000);
  };

  /* ─── Disconnect Bot ─── */
  const handleRevokePairingCode = async () => {
    setRevokingPairing(true);
    try {
      const res = await fetch('/api/admin/pairing-code', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setPairingData({ pairingCode: null, expiresAt: null, isActive: false, botConnected: false });
        toast({ title: 'Bot Disconnected', description: 'WhatsApp bot session has been cleared.' });
        fetchPairingCode();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    } finally {
      setRevokingPairing(false);
    }
  };

  /* ─── Copy Pairing Code ─── */
  const handleCopyPairingCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setPairingCopied(true);
      toast({ title: 'Pairing code copied!' });
      setTimeout(() => setPairingCopied(false), 3000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setPairingCopied(true);
      toast({ title: 'Pairing code copied!' });
      setTimeout(() => setPairingCopied(false), 3000);
    }
  };


  /* --- Fetch QR Image --- */
  const fetchQRImage = async () => {
    setQrLoading(true);
    try {
      const res = await fetch('/api/admin/whatsapp?action=qr-image', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success && data.image) {
        setQrImage(data.image);
      }
    } catch {}
    setQrLoading(false);
  };

  /* --- Connect Bot via QR --- */
  const handleConnectQR = async () => {
    setPairingLoading(true);
    setQrImage(null);
    try {
      const res = await fetch('/api/admin/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ action: 'connect', mode: 'qr' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Generating QR Code...', description: 'Please wait.' });
        let attempts = 0;
        const pollInterval = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await fetch('/api/admin/whatsapp?action=status', {
              headers: { Authorization: `Bearer ${adminToken}` },
            });
            const statusData = await statusRes.json();
            if (statusData.hasQRImage || statusData.hasQR) {
              const qrRes = await fetch('/api/admin/whatsapp?action=qr-image', {
                headers: { Authorization: `Bearer ${adminToken}` },
              });
              const qrDataRes = await qrRes.json();
              if (qrDataRes.success && qrDataRes.image) {
                setQrImage(qrDataRes.image);
                setPairingLoading(false);
                clearInterval(pollInterval);
              }
            }
            if (statusData.status === 'connected') {
              setPairingData({ pairingCode: null, expiresAt: null, isActive: false, botConnected: true });
              toast({ title: 'Bot Connected!', description: 'WhatsApp bot is now connected.' });
              setPairingLoading(false);
              clearInterval(pollInterval);
            }
            if (attempts >= 60) {
              clearInterval(pollInterval);
              setPairingLoading(false);
            }
          } catch {}
        }, 3000);
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    } finally {
      setPairingLoading(false);
    }
  };
  /* ─── Save Bot Config ─── */
  const handleSaveBotConfig = async () => {
    setSavingBot(true);
    try {
      const res = await fetch('/api/admin/bot-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(botConfig),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Bot configuration saved!' });
      } else {
        toast({ title: 'Failed to save', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    } finally {
      setSavingBot(false);
    }
  };

  /* ─── Generate New Key ─── */
  const handleGenerate = async () => {
    if (!keyName.trim()) {
      toast({ title: 'API key name is required', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ name: keyName.trim(), customKey: customApiKey.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedKey(data.data);
        setKeyCopied(false);
        setKeyVisible(false);
        setKeyName('');
        setCustomApiKey('');
        fetchKeys();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  /* ─── Toggle Active/Inactive ─── */
  const handleToggle = async (id: string, currentActive: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id, isActive: !currentActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: currentActive ? 'API key disabled' : 'API key enabled',
        });
        fetchKeys();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  /* ─── Delete Key ─── */
  const handleDelete = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!deleteId || !adminToken) return;
    setDeleting(true);
    try {
      const currentDeleteId = deleteId;
      const res = await fetch('/api/admin/api-keys', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id: currentDeleteId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'API key deleted' });
        setApiKeys((prev) => prev.filter((k) => k.id !== currentDeleteId));
        setDeleteId(null);
      } else {
        toast({ title: 'Failed menghapus', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  /* ─── Copy Key ─── */
  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setKeyCopied(true);
      toast({ title: 'API key copied!' });
      setTimeout(() => setKeyCopied(false), 3000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = key;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setKeyCopied(true);
      toast({ title: 'API key copied!' });
      setTimeout(() => setKeyCopied(false), 3000);
    }
  };

  /* ─── Format date helper ─── */
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /* ─── Loading skeleton ─── */
  if (loading) {
    return (
      <div className="p-3 sm:p-5 lg:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Skeleton className="h-8 w-48 rounded-xl mb-2" />
            <Skeleton className="h-4 w-72 rounded-lg" />
          </div>
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Bot & Pairing</h1>
          <p className="text-muted-foreground text-sm">Connect WhatsApp bot via pairing code or QR scan for full control</p>
        </div>
        <Button
          onClick={() => {
            setKeyName('');
            setCustomApiKey('');
            setGeneratedKey(null);
            setGenerateOpen(true);
          }}
          className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Generate Key
        </Button>
      </motion.div>

      {/* ═══ Bot Connection Status ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={`glass rounded-2xl p-3 sm:p-6 mb-4 sm:mb-6 border ${
          pairingData.botConnected
            ? 'border-emerald-500/20 bg-cardmerald-500/[0.02]'
            : 'border-red-500/10 bg-red-500/[0.02]'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              pairingData.botConnected ? 'bg-cardmerald-500/10' : 'bg-red-500/10'
            }`}>
              {pairingData.botConnected ? (
                <Wifi className="w-5 h-5 text-emerald-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div>
              <h2 className="text-foreground font-semibold text-base">Bot Connection Status</h2>
              <p className="text-muted-foreground text-xs">Connect WhatsApp bot for web control</p>
            </div>
          </div>
          <Badge className={`text-[10px] border-border ${
            pairingData.botConnected
              ? 'bg-cardmerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {pairingData.botConnected ? (
              <><Activity className="w-3 h-3 mr-1" /> Connected</>
            ) : (
              <><WifiOff className="w-3 h-3 mr-1" /> Disconnected</>
            )}
          </Badge>
        </div>

        {/* Bot info when connected */}
        {pairingData.botConnected && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="glass rounded-xl p-3">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Bot Number</p>
              <p className="text-foreground text-xs font-mono mt-0.5">{pairingData.botNumber || '-'}</p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Admin Number</p>
              <p className="text-foreground text-xs font-mono mt-0.5">{pairingData.adminNumber || '-'}</p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Last Active</p>
              <p className="text-foreground text-xs mt-0.5">{pairingData.lastHeartbeat ? formatDate(pairingData.lastHeartbeat) : '-'}</p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Connected Since</p>
              <p className="text-foreground text-xs mt-0.5">{pairingData.pairedAt ? formatDate(pairingData.pairedAt) : '-'}</p>
            </div>
          </div>
        )}

        {/* Disconnected notice */}
        {!pairingData.botConnected && (
          <div className="glass rounded-xl p-3 mb-4 border border-bordermber-500/10">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400 text-xs font-semibold">Bot Not Connected</p>
                <p className="text-amber-400/70 text-[10px] leading-relaxed">
                  Masukkan nomor WhatsApp admin di bawah, lalu klik Connect Bot. Bot akan request kode pairing dari WhatsApp. Masukkan kode tersebut di HP Anda: WhatsApp {'>'} Settings {'>'} Linked Devices {'>'} Link with phone number.
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* ═══ Bot Pairing Code ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass glow-gold rounded-2xl p-3 sm:p-6 mb-4 sm:mb-6 border border-primary/10"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-foreground font-semibold text-base">Pairing Code</h2>
            <p className="text-muted-foreground text-xs">Request pairing code from WhatsApp then enter it on your phone to connect</p>
          </div>
        </div>


        {/* Connection Mode Selection */}
        <div className="mb-5">
          <Label className="text-muted-foreground text-xs mb-3 block">Connection Method</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setConnectMode('pairing')}
              className={"p-4 rounded-xl border-border transition-all text-left " + (connectMode === 'pairing' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}
            >
              <Smartphone className={"w-5 h-5 mb-1.5 " + (connectMode === 'pairing' ? 'text-primary' : 'text-muted-foreground')} />
              <p className={"font-semibold text-xs " + (connectMode === 'pairing' ? 'text-primary' : 'text-foreground')}>Pairing Code</p>
              <p className="text-muted-foreground text-[9px] mt-0.5">Enter bot number, get code</p>
            </button>
            <button
              onClick={() => setConnectMode('qr')}
              className={"p-4 rounded-xl border-border transition-all text-left " + (connectMode === 'qr' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}
            >
              <QrCode className={"w-5 h-5 mb-1.5 " + (connectMode === 'qr' ? 'text-primary' : 'text-muted-foreground')} />
              <p className={"font-semibold text-xs " + (connectMode === 'qr' ? 'text-primary' : 'text-foreground')}>QR Scan Code</p>
              <p className="text-muted-foreground text-[9px] mt-0.5">Scan QR like WhatsApp Web</p>
            </button>
          </div>
        </div>

        {/* Admin Number for Pairing */}
        <div className="mb-5 p-3 rounded-xl border border-primary/10 bg-primary/[0.02]">
          <Label className="text-muted-foreground text-xs flex items-center gap-1.5 mb-2">
            <MessageSquare className="w-3 h-3" />
            Admin WhatsApp Number (Owner)
          </Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={botConfig.bot_admin_number}
                onChange={(e) => setBotConfig({ ...botConfig, bot_admin_number: e.target.value })}
                placeholder="6281234567890"
                className="pl-10 glass rounded-xl border-primary/20 bg-transparent text-foreground font-mono text-sm"
              />
            </div>
            <Button
              onClick={async () => {
                if (!botConfig.bot_admin_number) {
                  toast({ title: 'Masukkan nomor admin terlebih dahulu', variant: 'destructive' });
                  return;
                }
                setSavingBot(true);
                try {
                  const res = await fetch('/api/admin/bot-config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
                    body: JSON.stringify({ bot_admin_number: botConfig.bot_admin_number }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    toast({ title: 'Admin number saved!' });
                  } else {
                    toast({ title: 'Failed', description: data.error, variant: 'destructive' });
                  }
                } catch {
                  toast({ title: 'Network Error', variant: 'destructive' });
                } finally {
                  setSavingBot(false);
                }
              }}
              disabled={savingBot}
              size="sm"
              className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90"
            >
              {savingBot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <p className="text-muted-foreground text-[10px] mt-1.5">Bot will request pairing code from WhatsApp for this number. Enter the code on your WhatsApp. All bot notifications (deposit, withdraw, register) will be received on the admin number.</p>
        </div>

        {pairingData.isActive && pairingData.pairingCode ? (
          /* Active Pairing Code Display */
          <div className="space-y-4">
            <div className="glass rounded-xl p-4 border border-violet-500/20 bg-violet-500/[0.03]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-violet-400" />
                  <span className="text-violet-400 text-xs font-semibold uppercase tracking-wider">Active Pairing Code</span>
                </div>
                <Badge className="bg-cardmerald-500/20 text-emerald-400 border-border text-[10px]">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Active
                </Badge>
              </div>

              <div className="relative">
                <div className="glass rounded-xl p-3 pr-20 font-mono text-lg text-center tracking-[0.3em] text-foreground font-bold border border-violet-500/15">
                  {pairingCodeVisible
                    ? pairingData.pairingCode
                    : pairingData.pairingCode.substring(0, 2) + '••••••'
                  }
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={() => setPairingCodeVisible(!pairingCodeVisible)}
                    className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors"
                    title={pairingCodeVisible ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {pairingCodeVisible ? (
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => handleCopyPairingCode(pairingData.pairingCode!)}
                    className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg bg-violet-500/10 flex items-center justify-center hover:bg-violet-500/20 transition-colors"
                    title="Salin"
                  >
                    {pairingCopied ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-violet-400" />
                    )}
                  </button>
                </div>
              </div>

              {pairingData.expiresAt && (
                <div className="flex items-center gap-1.5 mt-2 text-muted-foreground text-[11px]">
                  <Clock className="w-3 h-3" />
                  <span>Berlaku hingga: {formatDate(pairingData.expiresAt)}</span>
                </div>
              )}
            </div>

            {/* Cara Menghubungkan */}
            <div className="glass rounded-xl p-3 border border-primary/10 bg-background/50">
              <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Smartphone className="w-3 h-3" />
                How to Connect to WhatsApp
              </p>
              <div className="bg-background/80 rounded-lg p-2.5 border border-primary/5 space-y-2">
                <p className="text-foreground text-xs font-medium">📱 Steps:</p>
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-[11px] flex gap-2"><span className="text-primary font-bold">1.</span> Open WhatsApp on your phone</p>
                  <p className="text-muted-foreground text-[11px] flex gap-2"><span className="text-primary font-bold">2.</span> Tap ⋮ (menu) {'>'}  Linked Devices</p>
                  <p className="text-muted-foreground text-[11px] flex gap-2"><span className="text-primary font-bold">3.</span> Tap "Link a device"</p>
                  <p className="text-muted-foreground text-[11px] flex gap-2"><span className="text-primary font-bold">4.</span> Pilih "Link with phone number"</p>
                  <p className="text-muted-foreground text-[11px] flex gap-2"><span className="text-primary font-bold">5.</span> Enter code: <span className="text-primary font-bold font-mono">{pairingData.pairingCode}</span></p>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                  {pairingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                  <p className="text-primary text-[11px]">{pairingLoading ? 'Requesting code from WhatsApp...' : 'Waiting for code to be entered on WhatsApp...'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleGeneratePairingCode}
                disabled={pairingLoading}
                variant="outline"
                size="sm"
                className="rounded-xl border-violet-500/20 text-violet-400 hover:bg-violet-500/10 text-xs"
              >
                {pairingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Reconnect
              </Button>
              <Button
                onClick={handleRevokePairingCode}
                disabled={revokingPairing}
                variant="outline"
                size="sm"
                className="rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs"
              >
                {revokingPairing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Unplug className="w-3.5 h-3.5 mr-1.5" />}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          /* No Active Pairing Code */
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center mx-auto mb-3">
              <Link2 className="w-6 h-6 text-violet-400/40" />
            </div>
            <p className="text-muted-foreground text-sm mb-3">No active pairing code</p>
            <Button
              onClick={handleGeneratePairingCode}
              disabled={pairingLoading}
              className="bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl"
            >
              {pairingLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
              Connect Bot
            </Button>
          </div>
        )}


        {/* QR Code Display Section */}
        {connectMode === 'qr' && !pairingData.botConnected && (
          <div className="space-y-4">
            {qrImage ? (
              <div className="glass rounded-xl p-4 border border-primary/20 bg-primary/[0.02]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-primary" />
                    <span className="text-primary text-xs font-semibold uppercase tracking-wider">WhatsApp QR Code</span>
                  </div>
                  <Badge className="bg-cardmber-500/20 text-amber-400 border-border text-[10px]">Ready to Scan</Badge>
                </div>
                <div className="flex justify-center">
                  <div className="bg-white rounded-xl p-3 shadow-lg">
                    <img src={qrImage} alt="WhatsApp QR Code" className="w-56 h-56 object-contain" />
                  </div>
                </div>
                <div className="glass rounded-xl p-3 mt-3 border border-primary/10 bg-background/50">
                  <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Smartphone className="w-3 h-3" />
                    How to Scan QR Code
                  </p>
                  <div className="bg-background/80 rounded-lg p-2.5 border border-primary/5 space-y-1.5">
                    <p className="text-muted-foreground text-[11px] flex gap-2"><span className="text-primary font-bold">1.</span> Open WhatsApp on your phone</p>
                    <p className="text-muted-foreground text-[11px] flex gap-2"><span className="text-primary font-bold">2.</span> Tap menu {'>'} Linked Devices</p>
                    <p className="text-muted-foreground text-[11px] flex gap-2"><span className="text-primary font-bold">3.</span> Tap &quot;Link a device&quot;</p>
                    <p className="text-muted-foreground text-[11px] flex gap-2"><span className="text-primary font-bold">4.</span> Scan the QR code above</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button onClick={fetchQRImage} variant="outline" size="sm" className="rounded-xl border-primary/20 text-primary hover:bg-primary/10 text-xs">
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh QR
                  </Button>
                  <Button onClick={handleRevokePairingCode} disabled={revokingPairing} variant="outline" size="sm" className="rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs">
                    {revokingPairing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Unplug className="w-3.5 h-3.5 mr-1.5" />}Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <QrCode className="w-6 h-6 text-primary/40" />
                </div>
                <p className="text-muted-foreground text-sm mb-3">Click below to generate a QR code</p>
                <Button onClick={handleConnectQR} disabled={pairingLoading} className="bg-primary hover:bg-[#c9a22e] text-primary-foreground font-semibold rounded-xl">
                  {pairingLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <QrCode className="w-4 h-4 mr-2" />}Generate QR Code
                </Button>
                {pairingLoading && !qrImage && (
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <p className="text-primary text-xs">Generating QR code from WhatsApp...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Security Notice */}
        <div className="mt-4 p-2.5 rounded-xl bg-cardmber-500/5 border border-bordermber-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 text-[11px] font-semibold">Security</p>
              <p className="text-amber-400/70 text-[10px] leading-relaxed">
                This pairing code is directly from WhatsApp servers. After the bot is connected, the code is automatically removed. 
                Masukkan kode di WhatsApp: Settings {'>'} Linked Devices {'>'} Link with phone number. Jangan bagikan kode ini ke pihak yang tidak berwenang.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══ WhatsApp Bot Configuration ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass glow-gold rounded-2xl p-3 sm:p-6 mb-4 sm:mb-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cardmerald-500/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-foreground font-semibold text-base">WhatsApp Bot Configuration</h2>
            <p className="text-muted-foreground text-xs">Configure WhatsApp bot for automatic OTP & deposit/withdraw notifications</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Bot WhatsApp Number */}
          <div>
            <Label className="text-muted-foreground text-xs flex items-center gap-1.5">
              <Smartphone className="w-3 h-3" />
              Bot WhatsApp Number
            </Label>
            <Input
              value={botConfig.bot_whatsapp_number}
              onChange={(e) => setBotConfig({ ...botConfig, bot_whatsapp_number: e.target.value })}
              placeholder="6281234567890"
              className="glass rounded-xl border-primary/20 bg-transparent text-foreground mt-1 font-mono text-sm"
            />
            <p className="text-muted-foreground text-[10px] mt-1">Bot number connected with API key</p>
          </div>

          {/* Admin WhatsApp Number */}
          <div>
            <Label className="text-muted-foreground text-xs flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              Admin WhatsApp Number
            </Label>
            <Input
              value={botConfig.bot_admin_number}
              onChange={(e) => setBotConfig({ ...botConfig, bot_admin_number: e.target.value })}
              placeholder="6281234567890"
              className="glass rounded-xl border-primary/20 bg-transparent text-foreground mt-1 font-mono text-sm"
            />
            <p className="text-muted-foreground text-[10px] mt-1">Admin number for receiving approval notifications</p>
          </div>
        </div>

        {/* Custom API Key */}
        <div className="mb-5 p-3 rounded-xl border border-violet-500/10 bg-violet-500/[0.02]">
          <Label className="text-muted-foreground text-xs flex items-center gap-1.5 mb-2">
            <Key className="w-3 h-3" />
            Custom API Key (untuk bot WhatsApp)
          </Label>
          <Input
            value={botConfig.bot_custom_api_key}
            onChange={(e) => setBotConfig({ ...botConfig, bot_custom_api_key: e.target.value })}
            placeholder="Masukkan API key dari layanan WhatsApp (misal: 77vVb1xBU4...)"
            className="glass rounded-xl border-violet-500/20 bg-transparent text-foreground font-mono text-sm"
          />
          <p className="text-muted-foreground text-[10px] mt-1.5">
            API key ini digunakan oleh bot WhatsApp untuk autentikasi. Bisa berupa key dari layanan pihak ketiga (Fonnte, Wablas, dll) atau key custom. Kirim via header <code className="text-violet-400">X-API-Key</code>.
          </p>
        </div>

        {/* Notification Toggles */}
        <div className="space-y-3 mb-5">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Bell className="w-3 h-3" />
            Bot Notifications
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="glass rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {botConfig.bot_notify_deposit ? (
                  <Bell className="w-4 h-4 text-emerald-400" />
                ) : (
                  <BellOff className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-foreground text-xs font-medium">New Deposit</p>
                  <p className="text-muted-foreground text-[10px]">Notify admin on new deposit</p>
                </div>
              </div>
              <Switch
                checked={botConfig.bot_notify_deposit}
                onCheckedChange={(v) => setBotConfig({ ...botConfig, bot_notify_deposit: v })}
              />
            </div>

            <div className="glass rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {botConfig.bot_notify_withdraw ? (
                  <Bell className="w-4 h-4 text-emerald-400" />
                ) : (
                  <BellOff className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-foreground text-xs font-medium">New Withdraw</p>
                  <p className="text-muted-foreground text-[10px]">Notify admin on new withdraw</p>
                </div>
              </div>
              <Switch
                checked={botConfig.bot_notify_withdraw}
                onCheckedChange={(v) => setBotConfig({ ...botConfig, bot_notify_withdraw: v })}
              />
            </div>

            <div className="glass rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {botConfig.bot_notify_register ? (
                  <Bell className="w-4 h-4 text-emerald-400" />
                ) : (
                  <BellOff className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-foreground text-xs font-medium">New Registration</p>
                  <p className="text-muted-foreground text-[10px]">Notify on new user registration</p>
                </div>
              </div>
              <Switch
                checked={botConfig.bot_notify_register}
                onCheckedChange={(v) => setBotConfig({ ...botConfig, bot_notify_register: v })}
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          <Button
            onClick={handleSaveBotConfig}
            disabled={savingBot}
            className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            {savingBot ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Bot Configuration
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowApiDocs(!showApiDocs)}
            className="rounded-xl border-primary/20 text-foreground text-xs"
          >
            <BookOpen className="w-3.5 h-3.5 mr-1.5" />
            API Docs
            {showApiDocs ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </Button>
        </div>

        {/* API Documentation */}
        {showApiDocs && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 glass rounded-xl p-4 border border-primary/10 overflow-hidden"
          >
            <h4 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Dokumentasi API Bot WhatsApp
            </h4>
            <div className="space-y-2.5 text-xs font-mono">
              {[
                { method: 'POST', endpoint: '/api/auth/bot-pair', desc: 'Hubungkan bot via pairing code {'>'}  token + kontrol web', highlight: true },
                { method: 'POST', endpoint: '/api/bot/heartbeat', desc: 'Heartbeat bot (kirim tiap 1 menit)', highlight: true },
                { method: 'POST', endpoint: '/api/bot/disconnect', desc: 'Disconnect koneksi bot' },
                { method: 'GET', endpoint: '/api/bot/pending', desc: 'Ambil semua transaksi pending' },
                { method: 'GET', endpoint: '/api/bot/notifications', desc: 'Poll notifikasi bot' },
                { method: 'GET', endpoint: '/api/bot/send-otp?whatsapp=628xxx', desc: 'Ambil OTP pending' },
                { method: 'GET', endpoint: '/api/bot/config', desc: 'Baca konfigurasi bot' },
                { method: 'PUT', endpoint: '/api/bot/deposit/approve', desc: 'Setujui deposit {'>'}  saldo otomatis masuk' },
                { method: 'PUT', endpoint: '/api/bot/deposit/reject', desc: 'Tolak deposit' },
                { method: 'PUT', endpoint: '/api/bot/withdraw/approve', desc: 'Setujui withdrawal' },
                { method: 'PUT', endpoint: '/api/bot/withdraw/reject', desc: 'Tolak withdrawal {'>'}  saldo kembali' },
                { method: 'PUT', endpoint: '/api/bot/config', desc: 'Update konfigurasi bot' },
                { method: 'POST', endpoint: '/api/bot/deposit', desc: 'Buat deposit via bot' },
                { method: 'POST', endpoint: '/api/bot/withdraw', desc: 'Buat withdrawal via bot' },
                { method: 'POST', endpoint: '/api/bot/send-otp', desc: 'Generate & simpan OTP baru' },
                { method: 'DELETE', endpoint: '/api/bot/notifications', desc: 'Delete notifikasi yang sudah dibaca' },
              ].map((api) => (
                <div key={api.endpoint} className={`flex items-start gap-2 text-[11px] ${api.highlight ? 'bg-violet-500/5 -mx-1 px-1 py-0.5 rounded' : ''}`}>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    api.method === 'GET' ? 'bg-cardmerald-500/20 text-emerald-400' :
                    api.method === 'POST' ? 'bg-blue-500/20 text-blue-400' :
                    api.method === 'PUT' ? 'bg-cardmber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {api.method}
                  </span>
                  <div className="min-w-0">
                    <code className="text-foreground">{api.endpoint}</code>
                    <span className="text-muted-foreground ml-2">{api.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 p-2.5 bg-cardmber-500/5 rounded-lg border border-bordermber-500/10">
              <p className="text-amber-400 text-[11px] font-semibold mb-1">Autentikasi</p>
              <p className="text-muted-foreground text-[10px]">
                Semua endpoint bot memerlukan header <code className="text-foreground">X-API-Key: {'<your_api_key>'}</code> atau <code className="text-foreground">Authorization: Bearer {'<token>'}</code>
              </p>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* API Keys List */}
      {apiKeys.length > 0 ? (
        <div className="space-y-4">
          {apiKeys.map((apiKey, i) => (
            <motion.div
              key={apiKey.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass glow-gold rounded-2xl p-3 sm:p-5 hover:glow-gold-strong transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Key Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Key className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-foreground font-semibold text-sm truncate">{apiKey.name}</h3>
                      <p className="text-muted-foreground text-xs font-mono">{apiKey.keyPrefix}</p>
                    </div>
                  </div>

                  {/* Meta Row */}
                  <div className="flex flex-wrap items-center gap-3 mt-3 ml-0 sm:ml-[52px]">
                    <Badge
                      className={`text-[10px] border-border ${
                        apiKey.isActive
                          ? 'bg-cardmerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {apiKey.isActive ? (
                        <ShieldCheck className="w-3 h-3 mr-1" />
                      ) : (
                        <ShieldOff className="w-3 h-3 mr-1" />
                      )}
                      {apiKey.isActive ? 'Active' : 'Inactive'}
                    </Badge>

                    <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                      <Clock className="w-3 h-3" />
                      <span>Last used: {formatDate(apiKey.lastUsedAt)}</span>
                    </div>

                    <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                      <Calendar className="w-3 h-3" />
                      <span>Created: {formatDate(apiKey.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2 glass rounded-xl p-2">
                    <Label className="text-xs text-muted-foreground hidden sm:inline">
                      {apiKey.isActive ? 'Active' : 'Inactive'}
                    </Label>
                    <Switch
                      checked={apiKey.isActive}
                      onCheckedChange={() => handleToggle(apiKey.id, apiKey.isActive)}
                      disabled={togglingId === apiKey.id}
                    />
                    {togglingId === apiKey.id && (
                      <Loader2 className="w-3 h-3 text-primary animate-spin" />
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteId(apiKey.id)}
                    className="rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 h-10 sm:h-9 text-xs px-3"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-2xl p-6 sm:p-12 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Key className="w-8 h-8 text-primary/40" />
          </div>
          <h3 className="text-foreground font-semibold mb-2">No API Keys Yet</h3>
          <p className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto">
            Buat API key baru untuk menghubungkan layanan eksternal seperti WhatsApp bot atau integrasi lainnya.
          </p>
          <Button
            onClick={() => {
              setKeyName('');
              setGeneratedKey(null);
              setGenerateOpen(true);
            }}
            className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <Plus className="w-4 h-4 mr-2" />
            Generate First Key
          </Button>
        </motion.div>
      )}

      {/* ───────── Generate Key Dialog ───────── */}
      <Dialog
        open={generateOpen}
        onOpenChange={(open) => {
          if (!open && generatedKey) {
            setGenerateOpen(false);
            setGeneratedKey(null);
          } else {
            setGenerateOpen(open);
          }
        }}
      >
        <DialogContent className="glass-strong border-primary/20 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">Generate New API Key</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {generatedKey
                ? 'Salin API key sekarang — ini satu-satunya kesempatan Anda!'
                : 'Create new API key for external integration'}
            </DialogDescription>
          </DialogHeader>

          {!generatedKey ? (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-muted-foreground text-xs">API Key Name *</Label>
                <Input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Contoh: WhatsApp Bot, CRM Integration"
                  className="glass rounded-xl border-primary/20 bg-transparent text-foreground mt-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerate();
                  }}
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Custom API Key (optional)</Label>
                <Input
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="Kosongkan untuk auto-generate, atau masukkan key custom (min 20 karakter)"
                  className="glass rounded-xl border-primary/20 bg-transparent text-foreground mt-1 font-mono text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerate();
                  }}
                />
              </div>
              <p className="text-muted-foreground text-[11px]">
                Gunakan nama yang deskriptif agar mudah mengidentifikasi penggunaan API key ini. Isi custom key jika ingin menggunakan key sendiri (misal dari layanan WhatsApp API).
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="bg-cardmber-500/10 border border-bordermber-500/20 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-400 text-xs font-semibold">Perhatian!</p>
                  <p className="text-amber-400/80 text-[11px]">
                    Kunci API ini hanya akan ditampilkan sekali. Salin sekarang karena tidak akan bisa dilihat lagi.
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">
                  API Key — <span className="text-amber-400 font-semibold">{generatedKey.name}</span>
                </Label>
                <div className="mt-1 relative">
                  <div className="glass rounded-xl border-primary/20 p-3 pr-20 font-mono text-xs text-foreground break-all">
                    {keyVisible
                      ? generatedKey.key
                      : generatedKey.key.substring(0, 16) + '•••••••••••••••••••••••••••••••••••••'}
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      onClick={() => setKeyVisible(!keyVisible)}
                      className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors"
                      title={keyVisible ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {keyVisible ? (
                        <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => handleCopyKey(generatedKey.key)}
                      className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                      title="Salin"
                    >
                      {keyCopied ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-primary" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                <Key className="w-3 h-3" />
                <span>Prefix: <code className="text-foreground">{generatedKey.keyPrefix}</code></span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!generatedKey ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setGenerateOpen(false)}
                  disabled={generating}
                  className="rounded-xl border-primary/20 text-foreground"
                >
                  Batal
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !keyName.trim()}
                  className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Generate'
                  )}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => {
                  setGenerateOpen(false);
                  setGeneratedKey(null);
                }}
                className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90"
              >
                {keyCopied ? 'Selesai' : 'Saya Sudah Menyalin'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────── Delete Confirmation ───────── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="glass-strong border-primary/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Delete API Key
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action cannot be undone. The API key will be permanently deleted and all services using it will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-xl border-primary/20 text-foreground"
              disabled={deleting}
            >
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white" forceMount
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
