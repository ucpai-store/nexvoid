import { 
  Shield, TrendingUp, Coins, BarChart3, Wallet, Users, 
  ArrowRight, CheckCircle, Lock, Smartphone, Globe, 
  ChevronDown, Star, Zap, Award, BookOpen,
  CreditCard, Gift, RefreshCw, Play, BadgeCheck,
  Crown, Target, Rocket, CircleDollarSign, Banknote,
  LineChart, PiggyBank, Clock, ShieldCheck
} from 'lucide-react';

interface LandingPageProps {
  onLogin?: () => void;
  onRegister?: () => void;
}

export default function LandingPage({ onLogin, onRegister }: LandingPageProps) {
  const investmentTypes = [
    {
      icon: 'saham',
      title: 'Global Stocks',
      desc: 'Access world-class stocks from NYSE, NASDAQ, SGX & more. Earn dividends and capital gains from top-performing companies worldwide.',
      color: '#2563EB',
      features: ['Dividend Income', 'Capital Growth', 'Multi-Exchange'],
      stat: '15.2%',
      statLabel: 'Avg. Return',
    },
    {
      icon: 'emas',
      title: 'Gold & Precious Metals',
      desc: 'Protect your wealth with gold — the ultimate safe-haven asset. Start from as low as 1 gram with instant liquidity.',
      color: '#D4AF37',
      features: ['Wealth Protection', 'Instant Liquidity', 'Low Entry'],
      stat: '24.8%',
      statLabel: 'YTD Growth',
    },
    {
      icon: 'komoditas',
      title: 'Commodities',
      desc: 'Diversify into oil, silver, agricultural & energy commodities. Daily profits up to 10% with our expert-managed portfolios.',
      color: '#059669',
      features: ['Daily Profit', 'Expert Managed', 'Diversified'],
      stat: 'Up to 10%',
      statLabel: 'Daily Profit',
    },
    {
      icon: 'kripto',
      title: 'Cryptocurrency',
      desc: 'Trade Bitcoin, Ethereum & top altcoins on a secure, regulated platform. 24/7 market access with bank-grade security.',
      color: '#8B5CF6',
      features: ['BTC & ETH', '24/7 Trading', 'Secured'],
      stat: '$2.4T',
      statLabel: 'Market Cap',
    },
  ];

  const steps = [
    { num: '01', title: 'Create Account', desc: 'Sign up in 2 minutes — just email & phone number. Free, no credit card required.', icon: 'register' },
    { num: '02', title: 'Verify Identity', desc: 'Quick OTP verification via email & WhatsApp. Secure and instant.', icon: 'verify' },
    { num: '03', title: 'Fund Your Account', desc: 'Deposit via QRIS, bank transfer, USDT, or wire transfer. Instant processing.', icon: 'deposit' },
    { num: '04', title: 'Choose Investment', desc: 'Select from stocks, gold, commodities, or crypto packages — or diversify across all.', icon: 'package' },
    { num: '05', title: 'Earn Daily Profit', desc: 'Watch your wealth grow with automatic daily profits up to 10%. Real-time tracking.', icon: 'profit' },
    { num: '06', title: 'Withdraw Anytime', desc: 'Cash out your profits to your bank account anytime. Fast, transparent, no hidden fees.', icon: 'withdraw' },
  ];

  const features = [
    { icon: 'shield', title: 'Bank-Grade Security', desc: 'SSL 256-bit encryption protects every transaction. Same security standard used by major banks worldwide.' },
    { icon: 'smartphone', title: 'Trade Anywhere, Anytime', desc: 'Full-featured mobile platform. Manage your investments 24/7 from any device, anywhere in the world.' },
    { icon: 'zap', title: 'Daily Profit Automation', desc: 'Earn daily profits automatically — no manual monitoring needed. Set it and grow your wealth.' },
    { icon: 'creditcard', title: 'Multiple Payment Methods', desc: 'Deposit via QRIS, bank transfer, wire transfer, or USDT. Fast processing, zero hassle.' },
    { icon: 'users', title: 'Referral Bonus Program', desc: 'Earn generous commissions for every friend you invite. Multi-level rewards that grow your passive income.' },
    { icon: 'refresh', title: 'Instant Withdrawals', desc: 'Withdraw profits anytime directly to your bank. Fast processing with full transparency — no hidden fees.' },
  ];

  const earningSystems = [
    { title: 'Daily Profit', desc: 'Automatic daily returns from active investment packages. Watch your portfolio grow every single day.', icon: 'trending', value: 'Up to 10%', badge: 'MOST POPULAR' },
    { title: 'Referral Bonus', desc: 'Invite friends and earn multi-level commissions from every active referral in your network.', icon: 'gift', value: 'Multi-Level', badge: 'PASSIVE INCOME' },
    { title: 'Salary Bonus', desc: 'Weekly salary 1% of group omzet FOREVER. Invite 10 active members + active investment required. Paid every Monday.', icon: 'award', value: '1% / Week', badge: 'FOREVER' },
    { title: 'Matching Bonus', desc: 'Binary network matching bonus — earn from left and right leg growth. Unlimited depth.', icon: 'users', value: 'Unlimited', badge: 'TOP EARNER' },
  ];

  const globalStats = [
    { value: '50K+', label: 'Active Investors' },
    { value: '12+', label: 'Countries' },
    { value: '$18M+', label: 'Total Profits Paid' },
    { value: '99.9%', label: 'Uptime' },
  ];

  const trustBadges = [
    'SSL 256-bit Encrypted',
    'Two-Factor Authentication',
    '24/7 Fraud Monitoring',
    'Regulated Platform',
    'Instant Withdrawals',
    'Multi-Currency Support',
  ];

  const testimonials = [
    { name: 'David Tan', location: 'Singapore', text: 'NEXVO completely changed my investment strategy. The daily profits are real, and the platform is incredibly easy to use. Best decision I\'ve made this year!', rating: 5, profit: '$12,400+' },
    { name: 'Sarah Lim', location: 'Singapore', text: 'I was skeptical at first, but NEXVO delivered exactly what they promised. My gold investment has grown steadily, and withdrawals are always on time.', rating: 5, profit: '$8,750+' },
    { name: 'Michael Wong', location: 'Malaysia', text: 'The referral bonus system is amazing. I\'m earning passive income from my network while my own investments grow. Truly a win-win platform!', rating: 5, profit: '$23,100+' },
    { name: 'Rachel Chen', location: 'Hong Kong', text: 'Professional platform with bank-level security. The commodity packages offer returns I haven\'t found anywhere else. Highly recommended for serious investors.', rating: 5, profit: '$15,600+' },
  ];

  const faqs = [
    { q: 'What is NEXVO?', a: 'NEXVO is the world\'s leading digital investment platform offering stocks, gold, commodities, and crypto — all in one place. We help investors across 12+ countries build wealth through automated daily profits, referral bonuses, and expert-managed portfolios.' },
    { q: 'How do I get started?', a: 'Simply visit nexvo.id, click "Start Investing", enter your email and phone number, verify with OTP, and your account is instantly active. The entire process takes under 2 minutes.' },
    { q: 'What is the minimum investment?', a: 'NEXVO offers investment packages starting from very affordable amounts. Whether you\'re a beginner or experienced investor, we have packages that fit every budget and financial goal.' },
    { q: 'Is NEXVO safe and legitimate?', a: 'Absolutely. NEXVO uses SSL 256-bit encryption (bank-grade security), two-factor authentication (2FA), and 24/7 fraud monitoring. Your data and funds are protected with the highest security standards in the industry.' },
    { q: 'How does the daily profit system work?', a: 'Every active investment package generates automatic daily profits. The rate depends on the package type and amount you choose. You can monitor your profits in real-time from your dashboard and withdraw anytime.' },
    { q: 'How do I withdraw my profits?', a: 'Go to the Withdraw section, enter the amount, select your bank account, and confirm. Withdrawals are processed quickly with full transparency — no hidden fees, no delays.' },
    { q: 'What is the Referral Bonus?', a: 'When you invite someone to join NEXVO using your referral code, you earn commissions from their investment activity. The more active referrals you have, the more passive income you generate — it\'s multi-level and unlimited.' },
    { q: 'What countries does NEXVO support?', a: 'NEXVO is available in 12+ countries across Asia Pacific including Singapore, Malaysia, Indonesia, Hong Kong, and more. We accept multiple currencies and payment methods including QRIS, bank transfer, wire transfer, and USDT.' },
  ];

  const IconMap: Record<string, React.ReactNode> = {
    shield: <Shield className="w-6 h-6" />,
    smartphone: <Smartphone className="w-6 h-6" />,
    zap: <Zap className="w-6 h-6" />,
    creditcard: <CreditCard className="w-6 h-6" />,
    users: <Users className="w-6 h-6" />,
    refresh: <RefreshCw className="w-6 h-6" />,
    trending: <TrendingUp className="w-6 h-6" />,
    gift: <Gift className="w-6 h-6" />,
    award: <Award className="w-6 h-6" />,
    register: <BookOpen className="w-6 h-6" />,
    verify: <ShieldCheck className="w-6 h-6" />,
    deposit: <Wallet className="w-6 h-6" />,
    package: <BarChart3 className="w-6 h-6" />,
    profit: <TrendingUp className="w-6 h-6" />,
    withdraw: <CreditCard className="w-6 h-6" />,
    saham: <BarChart3 className="w-7 h-7" />,
    emas: <Coins className="w-7 h-7" />,
    komoditas: <Globe className="w-7 h-7" />,
    kripto: <Zap className="w-7 h-7" />,
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#070B14]">
      {/* Hidden SEO content for crawlers */}
      <div className="sr-only">
        <h1>NEXVO — World&#39;s Best Digital Investment Platform | Stocks, Gold, Commodities, Crypto</h1>
        <p>NEXVO is the world&#39;s leading digital investment platform offering stocks, gold, commodities, and cryptocurrency in one place. Earn daily profits up to 10%, deposit via QRIS, wire transfer & USDT, bank-grade SSL 256-bit security. Trusted by 50,000+ investors across 12+ countries. Build Value, Grow Future!</p>
        <p>How to start investing with NEXVO: 1) Create free account in 2 minutes, 2) Verify with OTP, 3) Deposit via QRIS, bank transfer, or USDT, 4) Choose investment package, 5) Earn daily profits automatically up to 10%, 6) Withdraw to your bank account anytime.</p>
        <p>NEXVO features: Daily profit automation up to 10%, multi-level referral bonus, weekly salary bonus 1% forever, unlimited matching bonus, SSL 256-bit encryption, 2FA protection, 24/7 fraud monitoring, instant withdrawals, multi-currency support. Available in Singapore, Malaysia, Indonesia, Hong Kong and more.</p>
        <p>Investment options at NEXVO: Global stocks with dividend income, gold and precious metals with instant liquidity, commodities with expert-managed portfolios, cryptocurrency trading including Bitcoin and Ethereum. All in one platform with real-time tracking.</p>
      </div>

      {/* ========== HERO ========== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#1a1a2e] to-[#0a0a0a]" />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #D4AF37 0%, transparent 50%), radial-gradient(circle at 80% 70%, #D4AF37 0%, transparent 50%)' }} />
        
        {/* Animated grid background */}
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(rgba(212,175,55,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.3) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 text-center">
          {/* Global Trust Badge */}
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#D4AF37]/20 to-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-full px-5 py-2 mb-6">
            <Globe className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-[#D4AF37] text-sm font-semibold tracking-wide">Trusted by 50,000+ Investors Worldwide</span>
            <Crown className="w-4 h-4 text-[#D4AF37]" />
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black text-white mb-5 leading-[1.1]">
            The World&#39;s #1<br />
            <span className="bg-gradient-to-r from-[#D4AF37] via-[#F5E6A3] to-[#D4AF37] bg-clip-text text-transparent">Investment Platform</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto mb-3">
            Invest in <strong className="text-white">Stocks · Gold · Commodities · Crypto</strong> — all in one platform.
          </p>
          <p className="text-base text-[#D4AF37] font-semibold mb-8">
            Earn daily profits up to 10% · Bank-grade security · Instant withdrawals
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
            <button 
              onClick={onRegister}
              className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-[#D4AF37] to-[#F5E6A3] hover:from-[#c4a030] hover:to-[#D4AF37] text-black font-black rounded-xl text-lg transition-all transform hover:scale-105 shadow-xl shadow-[#D4AF37]/30 flex items-center justify-center gap-2"
            >
              <Rocket className="w-5 h-5" /> Start Investing Now — It&#39;s Free
            </button>
            <button 
              onClick={onLogin}
              className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl text-lg transition-all border border-white/20 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" /> Watch How It Works
            </button>
          </div>
          
          {/* Trust indicators */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-8 text-sm text-gray-400">
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#D4AF37]" /> SSL 256-bit</div>
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-[#D4AF37]" /> Instant Withdraw</div>
            <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-[#D4AF37]" /> 12+ Countries</div>
            <div className="flex items-center gap-2"><Banknote className="w-4 h-4 text-[#D4AF37]" /> Multi-Currency</div>
          </div>
        </div>
        
        {/* Global Stats Bar */}
        <div className="relative bg-gradient-to-r from-[#D4AF37]/10 via-[#D4AF37]/20 to-[#D4AF37]/10 border-y border-[#D4AF37]/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {globalStats.map((stat) => (
                <div key={stat.label}>
                  <p className="text-2xl sm:text-3xl font-black text-[#D4AF37]">{stat.value}</p>
                  <p className="text-xs sm:text-sm text-gray-400 font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ========== INVESTMENT TYPES ========== */}
      <section className="py-16 sm:py-24 bg-white dark:bg-[#0c1220]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-[#D4AF37] font-bold text-sm uppercase tracking-widest">Investment Products</span>
            <h2 className="text-3xl sm:text-5xl font-black text-[#3C2415] dark:text-white mt-3 mb-4">
              4 World-Class Asset Classes
            </h2>
            <p className="text-[#6B5443] dark:text-gray-400 max-w-2xl mx-auto text-lg">
              Diversify your portfolio across the most profitable asset classes on the planet — all managed from a single dashboard.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {investmentTypes.map((item) => (
              <div key={item.icon} className="group bg-[#FAFAF8] dark:bg-[#111827] rounded-2xl p-6 border border-gray-100 dark:border-gray-800 hover:border-[#D4AF37]/50 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden">
                {item.badge && <div className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full bg-[#D4AF37] text-black font-bold">{item.badge}</div>}
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 text-white"
                  style={{ backgroundColor: item.color }}
                >
                  {IconMap[item.icon]}
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-xl font-black" style={{ color: item.color }}>{item.stat}</span>
                  <span className="text-xs text-gray-400">{item.statLabel}</span>
                </div>
                <h3 className="text-lg font-bold text-[#3C2415] dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-[#6B5443] dark:text-gray-400 mb-4 leading-relaxed">{item.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {item.features.map((f) => (
                    <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-[#D4AF37]/10 text-[#B8960F] dark:text-[#D4AF37] font-semibold">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="py-16 sm:py-24 bg-[#FAFAF8] dark:bg-[#070B14]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-[#D4AF37] font-bold text-sm uppercase tracking-widest">Getting Started</span>
            <h2 className="text-3xl sm:text-5xl font-black text-[#3C2415] dark:text-white mt-3 mb-4">
              Start Earning in 6 Simple Steps
            </h2>
            <p className="text-[#6B5443] dark:text-gray-400 max-w-2xl mx-auto text-lg">
              From sign-up to profit — the entire process takes less than 5 minutes.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {steps.map((step) => (
              <div key={step.num} className="relative bg-white dark:bg-[#111827] rounded-2xl p-6 border border-gray-100 dark:border-gray-800 hover:shadow-xl transition-all group">
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-3xl font-black text-[#D4AF37]/30 group-hover:text-[#D4AF37]/70 transition-colors">{step.num}</span>
                  <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
                    {IconMap[step.icon]}
                  </div>
                </div>
                <h3 className="text-base font-bold text-[#3C2415] dark:text-white mb-1.5">{step.title}</h3>
                <p className="text-sm text-[#6B5443] dark:text-gray-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <button 
              onClick={onRegister}
              className="px-10 py-4 bg-gradient-to-r from-[#D4AF37] to-[#F5E6A3] text-black font-black rounded-xl text-lg shadow-xl shadow-[#D4AF37]/20 hover:scale-105 transition-all inline-flex items-center gap-2"
            >
              Create Free Account Now <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ========== EARNING SYSTEMS ========== */}
      <section className="py-16 sm:py-24 bg-gradient-to-br from-[#0a0a0a] via-[#1a1a2e] to-[#0a0a0a] relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(rgba(212,175,55,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.3) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-[#D4AF37] font-bold text-sm uppercase tracking-widest">Earning System</span>
            <h2 className="text-3xl sm:text-5xl font-black text-white mt-3 mb-4">
              4 Streams of Income
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">
              Beyond investment returns — unlock multiple passive income streams that grow while you sleep.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {earningSystems.map((item) => (
              <div key={item.title} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-[#D4AF37]/30 transition-all group relative">
                {item.badge && (
                  <div className="absolute -top-3 right-4 text-[10px] px-3 py-1 rounded-full bg-[#D4AF37] text-black font-bold">{item.badge}</div>
                )}
                <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] mb-4">
                  {IconMap[item.icon]}
                </div>
                <div className="text-[#D4AF37] font-black text-xl mb-1">{item.value}</div>
                <h3 className="text-white font-bold text-lg mb-1.5">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FEATURES ========== */}
      <section className="py-16 sm:py-24 bg-white dark:bg-[#0c1220]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-[#D4AF37] font-bold text-sm uppercase tracking-widest">Why NEXVO</span>
            <h2 className="text-3xl sm:text-5xl font-black text-[#3C2415] dark:text-white mt-3 mb-4">
              The Platform Investors Trust
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((item) => (
              <div key={item.title} className="flex gap-4 p-6 bg-[#FAFAF8] dark:bg-[#111827] rounded-xl border border-gray-100 dark:border-gray-800 hover:shadow-lg hover:border-[#D4AF37]/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/10 flex-shrink-0 flex items-center justify-center text-[#D4AF37]">
                  {IconMap[item.icon]}
                </div>
                <div>
                  <h3 className="font-bold text-[#3C2415] dark:text-white text-base mb-1">{item.title}</h3>
                  <p className="text-[#6B5443] dark:text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== TESTIMONIALS ========== */}
      <section className="py-16 sm:py-24 bg-[#FAFAF8] dark:bg-[#070B14]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-[#D4AF37] font-bold text-sm uppercase tracking-widest">Testimonials</span>
            <h2 className="text-3xl sm:text-5xl font-black text-[#3C2415] dark:text-white mt-3 mb-4">
              What Our Investors Say
            </h2>
            <p className="text-[#6B5443] dark:text-gray-400 max-w-2xl mx-auto text-lg">
              Join thousands of successful investors who are building wealth with NEXVO.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-white dark:bg-[#111827] rounded-2xl p-6 border border-gray-100 dark:border-gray-800 hover:shadow-xl transition-all">
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-[#D4AF37] text-[#D4AF37]" />
                  ))}
                </div>
                <p className="text-sm text-[#6B5443] dark:text-gray-300 leading-relaxed mb-4 italic">&ldquo;{t.text}&rdquo;</p>
                <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#3C2415] dark:text-white text-sm">{t.name}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1"><Globe className="w-3 h-3" /> {t.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#D4AF37] font-black text-sm">{t.profit}</p>
                      <p className="text-[10px] text-gray-400">Total Profit</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== SECURITY ========== */}
      <section className="py-16 sm:py-24 bg-white dark:bg-[#0c1220]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-[#D4AF37] font-bold text-sm uppercase tracking-widest">Security First</span>
              <h2 className="text-3xl sm:text-5xl font-black text-[#3C2415] dark:text-white mt-3 mb-5">
                Your Assets Are<br />Protected 24/7
              </h2>
              <p className="text-[#6B5443] dark:text-gray-400 mb-8 text-lg leading-relaxed">
                We implement the same security standards used by the world&#39;s largest banks. Your data, funds, and transactions are always protected.
              </p>
              <div className="space-y-5">
                {[
                  { title: 'SSL 256-bit Encryption', desc: 'All data encrypted end-to-end — the gold standard in digital security' },
                  { title: 'Two-Factor Authentication (2FA)', desc: 'Extra security layer on every login and transaction' },
                  { title: '24/7 Fraud Detection System', desc: 'AI-powered real-time monitoring for suspicious activity' },
                  { title: 'Automated Backup & Recovery', desc: 'Your data is always safe with continuous backup systems' },
                ].map((s) => (
                  <div key={s.title} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-[#D4AF37] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-bold text-[#3C2415] dark:text-white text-sm">{s.title}</p>
                      <p className="text-[#6B5443] dark:text-gray-400 text-xs">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-[#0a0a0a] via-[#1a1a2e] to-[#0a0a0a] rounded-3xl p-8 text-center border border-[#D4AF37]/20">
                <div className="w-24 h-24 rounded-full bg-[#D4AF37]/20 flex items-center justify-center mx-auto mb-6">
                  <Lock className="w-12 h-12 text-[#D4AF37]" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">Bank-Level Security</h3>
                <p className="text-gray-400 text-sm mb-8">Same encryption used by global banks</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[#D4AF37] font-black text-3xl">256</p>
                    <p className="text-gray-400 text-xs">Bit Encryption</p>
                  </div>
                  <div>
                    <p className="text-[#D4AF37] font-black text-3xl">24/7</p>
                    <p className="text-gray-400 text-xs">Monitoring</p>
                  </div>
                  <div>
                    <p className="text-[#D4AF37] font-black text-3xl">2FA</p>
                    <p className="text-gray-400 text-xs">Protection</p>
                  </div>
                </div>
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  {trustBadges.map((badge) => (
                    <span key={badge} className="text-[10px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-300 font-medium">
                      <BadgeCheck className="w-3 h-3 inline mr-1 text-[#D4AF37]" />{badge}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== SALDO SYSTEM ========== */}
      <section className="py-16 sm:py-24 bg-[#FAFAF8] dark:bg-[#070B14]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-[#D4AF37] font-bold text-sm uppercase tracking-widest">Account Management</span>
            <h2 className="text-3xl sm:text-5xl font-black text-[#3C2415] dark:text-white mt-3 mb-4">
              3 Separate Balance Types
            </h2>
            <p className="text-[#6B5443] dark:text-gray-400 max-w-2xl mx-auto text-lg">
              Manage your finances with clarity. Each balance serves a specific purpose.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { title: 'Deposit Balance', desc: 'Your main balance for purchasing investment packages. Top up via QRIS, bank transfer, wire transfer, or USDT.', color: '#2563EB', icon: <Wallet className="w-8 h-8" /> },
              { title: 'Profit Balance', desc: 'Accumulated daily profits from your active investment packages. Withdraw to your bank account anytime.', color: '#059669', icon: <TrendingUp className="w-8 h-8" /> },
              { title: 'Bonus Balance', desc: 'Earnings from referral, salary, and matching bonuses. Available for instant withdrawal.', color: '#D4AF37', icon: <Gift className="w-8 h-8" /> },
            ].map((item) => (
              <div key={item.title} className="bg-white dark:bg-[#111827] rounded-2xl p-6 border border-gray-100 dark:border-gray-800 text-center hover:shadow-xl transition-all hover:-translate-y-1">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white" style={{ backgroundColor: item.color }}>
                  {item.icon}
                </div>
                <h3 className="font-bold text-[#3C2415] dark:text-white text-lg mb-2">{item.title}</h3>
                <p className="text-[#6B5443] dark:text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FAQ ========== */}
      <section className="py-16 sm:py-24 bg-white dark:bg-[#0c1220]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-[#D4AF37] font-bold text-sm uppercase tracking-widest">FAQ</span>
            <h2 className="text-3xl sm:text-5xl font-black text-[#3C2415] dark:text-white mt-3 mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <details key={idx} className="group bg-[#FAFAF8] dark:bg-[#111827] rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <summary className="flex items-center justify-between cursor-pointer p-5 font-bold text-[#3C2415] dark:text-white text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <span>{faq.q}</span>
                  <ChevronDown className="w-4 h-4 text-[#D4AF37] group-open:rotate-180 transition-transform flex-shrink-0 ml-3" />
                </summary>
                <div className="px-5 pb-5 text-[#6B5443] dark:text-gray-400 text-sm leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-3">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CTA ========== */}
      <section className="py-16 sm:py-24 bg-gradient-to-br from-[#0a0a0a] via-[#1a1a2e] to-[#0a0a0a] relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 30% 40%, #D4AF37 0%, transparent 50%), radial-gradient(circle at 70% 60%, #D4AF37 0%, transparent 50%)' }} />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-[#D4AF37]/20 flex items-center justify-center mx-auto mb-8">
            <Rocket className="w-10 h-10 text-[#D4AF37]" />
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-5">
            Start Building Your Wealth Today
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-4 text-lg">
            Join 50,000+ smart investors across 12+ countries who trust NEXVO to grow their wealth.
          </p>
          <p className="text-[#D4AF37] font-bold text-lg mb-8">
            Build Value, Grow Future!
          </p>
          <button 
            onClick={onRegister}
            className="px-12 py-5 bg-gradient-to-r from-[#D4AF37] to-[#F5E6A3] hover:from-[#c4a030] hover:to-[#D4AF37] text-black font-black rounded-xl text-xl transition-all transform hover:scale-105 shadow-2xl shadow-[#D4AF37]/30 inline-flex items-center gap-3"
          >
            Create Free Account <ArrowRight className="w-6 h-6" />
          </button>
          <p className="text-gray-500 text-sm mt-6">Free • No credit card required • Start from any amount</p>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer className="bg-[#050505] py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-[#D4AF37] font-black text-2xl mb-3">NEXVO</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-3">The world&#39;s #1 digital investment platform. Stocks, gold, commodities, crypto — all in one place.</p>
              <p className="text-[#D4AF37] font-bold text-sm">Build Value, Grow Future!</p>
            </div>
            <div>
              <h4 className="text-white font-bold text-sm mb-3">Investments</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>Global Stocks</li>
                <li>Gold & Precious Metals</li>
                <li>Commodities</li>
                <li>Cryptocurrency</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold text-sm mb-3">Resources</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>Getting Started Guide</li>
                <li>How to Deposit</li>
                <li>Withdrawal Guide</li>
                <li>Bonus System Explained</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold text-sm mb-3">Security</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>SSL 256-bit Encryption</li>
                <li>Two-Factor Auth (2FA)</li>
                <li>24/7 Fraud Monitoring</li>
                <li>Data Protection</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-gray-500 text-xs">&copy; 2025 NEXVO Investment Platform. All rights reserved.</p>
            <p className="text-gray-500 text-xs">nexvo.id · The World&#39;s #1 Investment Platform</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
