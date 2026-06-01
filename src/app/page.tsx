'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, Shield, TrendingUp, Globe, Award, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function NexvoLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed. Please try again.');
        return;
      }

      // Store token and redirect to dashboard
      localStorage.setItem('nexvo_token', data.token);
      localStorage.setItem('nexvo_user', JSON.stringify(data.user));
      window.location.href = data.user.role === 'admin' ? '/admin' : '/dashboard';
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0D0B09' }}>
      {/* Hidden SEO content for Google crawlers */}
      <div className="sr-only">
        <h1>NEXVO - World&apos;s Best Investment Platform | Smart Digital Investing for Singapore &amp; Global Investors</h1>
        <p>NEXVO is the world&apos;s leading smart investment platform trusted by investors across Singapore, Southeast Asia, and globally. Earn daily profits up to 3.5% with AI-powered multi-asset investment strategies covering stocks, gold, commodities, and cryptocurrency. Start investing from just $50 with guaranteed returns and institutional-grade security.</p>
        <h2>Why NEXVO is the Best Investment Platform in Singapore &amp; Worldwide</h2>
        <p>NEXVO combines cutting-edge AI technology with proven investment strategies to deliver consistent daily profits. Our platform offers multi-asset investment portfolios including blue-chip stocks, gold trading, commodity futures, and cryptocurrency - all managed by advanced algorithms that maximize returns while minimizing risk. Join over 50,000+ investors from Singapore, Malaysia, Indonesia, and across the globe who trust NEXVO for their financial growth.</p>
        <h2>Investment Products Available on NEXVO Platform</h2>
        <p>NEXVO offers four premium investment categories: Stock Investment with daily profits up to 2.8%, Gold Investment with stable returns up to 2.2%, Commodity Trading with yields up to 3.0%, and Crypto Investment with potential returns up to 3.5%. Each product is backed by AI-driven market analysis and professional risk management. Minimum investment starts from just $50, making it accessible for all investor levels.</p>
        <h2>How to Start Investing with NEXVO - Simple 4 Steps</h2>
        <p>Getting started with NEXVO is simple: 1) Create your free account in under 60 seconds, 2) Fund your wallet via bank transfer, credit card, or cryptocurrency, 3) Choose your preferred investment product, 4) Earn daily profits automatically deposited to your balance. No trading experience required - our AI handles everything for you.</p>
        <h2>NEXVO Referral Program - Earn While You Invite</h2>
        <p>NEXVO&apos;s industry-leading referral program offers 3-tier commission structure: Level 1 earns 8% direct referral bonus, Level 2 earns 3% indirect bonus, and Level 3 earns 1% network bonus. Additionally, qualify for our exclusive Salary Program where active referrers can earn weekly salary payments up to $5,000 per week for 12 consecutive weeks.</p>
        <h2>NEXVO Security &amp; Trust - Your Investment is Safe</h2>
        <p>NEXVO employs bank-grade 256-bit SSL encryption, two-factor authentication (2FA), and cold storage for digital assets. Our platform is audited quarterly by independent security firms. All user funds are segregated and protected. NEXVO maintains 99.99% uptime with servers distributed across Singapore, Tokyo, and London for maximum reliability.</p>
        <h2>NEXVO Investment Platform Features</h2>
        <ul>
          <li>AI-Powered Daily Profit Generation - Earn up to 3.5% daily returns automatically</li>
          <li>Multi-Asset Investment Portfolio - Stocks, Gold, Commodities, Crypto in one platform</li>
          <li>3-Tier Referral Commission System - Up to 12% total referral earnings across 3 levels</li>
          <li>Weekly Salary Program - Qualify for weekly salary payments up to $5,000</li>
          <li>Instant Deposit &amp; Fast Withdrawal - Multiple payment methods supported</li>
          <li>Real-Time Portfolio Tracking - Monitor your investments 24/7</li>
          <li>Institutional-Grade Security - 256-bit encryption, 2FA, cold storage</li>
          <li>24/7 Customer Support - Dedicated support team via WhatsApp and live chat</li>
          <li>Mobile Responsive Platform - Trade and invest from any device</li>
          <li>Low Minimum Investment - Start from just $50</li>
        </ul>
        <h2>NEXVO Investment Returns &amp; Profit Calculator</h2>
        <p>With NEXVO&apos;s smart investment system, a $1,000 investment in our Stock Portfolio generates approximately $28 daily profit. Our Gold Portfolio yields approximately $22 daily, Commodity Portfolio approximately $30 daily, and Crypto Portfolio approximately $35 daily. Profits are credited automatically every 24 hours and can be withdrawn anytime. Compound your earnings for exponential growth.</p>
        <h2>Countries Where NEXVO is Available</h2>
        <p>NEXVO is available to investors in Singapore, Malaysia, Indonesia, Thailand, Philippines, Vietnam, Brunei, Myanmar, Cambodia, Laos, India, China, Japan, South Korea, Australia, New Zealand, United Arab Emirates, Saudi Arabia, United Kingdom, United States, and over 100+ countries worldwide. Join the fastest-growing investment community in the Asia-Pacific region.</p>
        <h2>Frequently Asked Questions About NEXVO Investment Platform</h2>
        <h3>Is NEXVO a legitimate investment platform?</h3>
        <p>Yes, NEXVO is a fully registered and legitimate digital investment platform operating under strict regulatory compliance. We use institutional-grade security measures and maintain transparent operations with real-time reporting.</p>
        <h3>How much can I earn with NEXVO?</h3>
        <p>Earnings depend on your investment amount and chosen product. Daily profits range from 2.2% to 3.5% depending on the investment category. Combined with our referral program and salary system, top investors earn over $10,000 monthly.</p>
        <h3>What is the minimum investment on NEXVO?</h3>
        <p>The minimum investment on NEXVO starts from just $50, making it accessible for beginners and experienced investors alike.</p>
        <h3>How do I withdraw my profits from NEXVO?</h3>
        <p>Withdrawals are processed within 24 hours. You can withdraw via bank transfer, cryptocurrency, or digital wallet. NEXVO supports multiple withdrawal methods for your convenience.</p>
        <h3>Is my investment safe with NEXVO?</h3>
        <p>Absolutely. NEXVO uses 256-bit SSL encryption, two-factor authentication, and cold storage for all digital assets. Your funds are segregated and protected with institutional-grade security protocols.</p>
      </div>

      {/* Background Pattern */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #C09E30 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #C09E30 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-3" style={{ background: 'radial-gradient(circle, #C09E30 0%, transparent 70%)' }} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          {/* Logo & Branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg" style={{ backgroundColor: '#C09E30' }}>
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#F5F2F0' }}>NEXVO</h1>
            <p className="text-sm mt-1" style={{ color: '#8B7355' }}>Smart Investment Platform</p>
          </div>

          {/* Login Card */}
          <Card className="border-0 shadow-2xl" style={{ backgroundColor: '#1A1714' }}>
            <CardHeader className="pb-4 pt-6 px-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold" style={{ color: '#F5F2F0' }}>Welcome Back</h2>
                <p className="text-sm mt-1" style={{ color: '#8B7355' }}>Sign in to your investment account</p>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <form onSubmit={handleLogin} className="space-y-4">
                {error && (
                  <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'rgba(220,38,38,0.1)', color: '#EF4444', border: '1px solid rgba(220,38,38,0.2)' }}>
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="username" style={{ color: '#CEBFB5' }}>Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="h-11"
                    style={{
                      backgroundColor: '#0D0B09',
                      borderColor: '#3C2415',
                      color: '#F5F2F0',
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" style={{ color: '#CEBFB5' }}>Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 pr-10"
                      style={{
                        backgroundColor: '#0D0B09',
                        borderColor: '#3C2415',
                        color: '#F5F2F0',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: '#8B7355' }}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 text-white font-semibold border-0 mt-2"
                  style={{ backgroundColor: '#C09E30' }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </>
                  )}
                </Button>
              </form>

              {/* Trust Badges */}
              <div className="mt-6 pt-4" style={{ borderTop: '1px solid #2A2520' }}>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" style={{ color: '#C09E30' }} />
                    <span className="text-xs" style={{ color: '#8B7355' }}>Bank-Grade Security</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" style={{ color: '#C09E30' }} />
                    <span className="text-xs" style={{ color: '#8B7355' }}>100+ Countries</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5" style={{ color: '#C09E30' }} />
                    <span className="text-xs" style={{ color: '#8B7355' }}>Trusted Platform</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bottom Info */}
          <div className="text-center mt-6 space-y-2">
            <p className="text-xs" style={{ color: '#6B5443' }}>
              Daily profits up to 3.5% • Multi-asset portfolio • AI-powered returns
            </p>
            <p className="text-xs" style={{ color: '#4A3F35' }}>
              © 2025 NEXVO Investment Platform. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
