import { useCallback } from 'react';
import { useLangStore } from '@/stores/lang-store';
import type { Language } from '@/stores/lang-store';

type TranslationKeys = {
  common: {
    loading: string;
    error: string;
    success: string;
    retry: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    add: string;
    search: string;
    noData: string;
    confirm: string;
    back: string;
    next: string;
    submit: string;
    close: string;
    copy: string;
    copied: string;
    share: string;
    download: string;
    upload: string;
    viewAll: string;
    processing: string;
    allFieldsRequired: string;
    networkError: string;
    operationFailed: string;
  };
  auth: {
    login: string;
    register: string;
    logout: string;
    whatsapp: string;
    email: string;
    password: string;
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
    forgotPassword: string;
    noAccount: string;
    hasAccount: string;
    loginSuccess: string;
    registerSuccess: string;
    otpVerification: string;
    enterOtp: string;
    resendOtp: string;
    referralCode: string;
    referralCodeOptional: string;
    loginSubtitle: string;
    registerSubtitle: string;
    whatsappOrEmail: string;
    enterWhatsappOrEmail: string;
    enterPassword: string;
    minChars: string;
    passwordMismatch: string;
    passwordNotMatch: string;
    registerNow: string;
    signIn: string;
    adminPanel: string;
    strengthWeak: string;
    strengthMedium: string;
    strengthStrong: string;
    passwordStrength: string;
    haveCode: string;
    hide: string;
    registering: string;
    whatsappNumber: string;
    emailAddress: string;
    validWhatsApp: string;
    validEmail: string;
  };
  dashboard: {
    title: string;
    mainBalance: string;
    profitBalance: string;
    totalDeposit: string;
    totalWithdraw: string;
    totalProfit: string;
    level: string;
    activeAssets: string;
    recentActivity: string;
    memberSince: string;
    quickNav: string;
    noActivity: string;
    depositBtn: string;
    withdrawBtn: string;
    buyProduct: string;
    investment: string;
    bonus: string;
    profit: string;
    success: string;
    completed: string;
    pending: string;
    failed: string;
    loadFailed: string;
    tryAgain: string;
    active: string;
    perDay: string;
    viewAll: string;
  };
  products: {
    title: string;
    investmentProducts: string;
    filter: string;
    all: string;
    gold: string;
    silver: string;
    diamond: string;
    duration: string;
    estProfit: string;
    quota: string;
    quotaFilled: string;
    remaining: string;
    buyNow: string;
    viewDetail: string;
    noProducts: string;
    noCategory: string;
    selectProduct: string;
    perDay: string;
    days: string;
  };
  paket: {
    title: string;
    investmentPackages: string;
    dailyProfit: string;
    contract: string;
    contractDays: string;
    capitalReturn: string;
    investNow: string;
    confirmInvest: string;
    investSuccess: string;
    totalProfit: string;
    bonusStructure: string;
    sponsorBonus: string;
    levelBonus: string;
    rewardBonus: string;
    solarNetwork: string;
    selectPackage: string;
    confirmInvestTitle: string;
    balanceDeduct: string;
    insufficientBalance: string;
    packageLabel: string;
    modal: string;
    contractLabel: string;
    yourBalance: string;
    remainingBalance: string;
    cancel: string;
    depositInvest: string;
    investSuccessTitle: string;
    investSuccessDesc: string;
    viewMyAssets: string;
    noPackages: string;
    totalProfitDays: string;
    fromReferral: string;
    basedOnGroupOmzet: string;
    basedOnGroupOmzet2: string;
    networkBonus: string;
  };
  assets: {
    title: string;
    myAssets: string;
    investNew: string;
    activeAsset: string;
    totalCapital: string;
    profitPerDay: string;
    totalProfit: string;
    modal: string;
    contractProgress: string;
    daysRemaining: string;
    estimatedReturn: string;
    lastProfit: string;
    statusActive: string;
    statusCompleted: string;
    statusStopped: string;
    statusCancelled: string;
    noAssets: string;
    investmentPackage: string;
    product: string;
    contract: string;
    profitRate: string;
    endDate: string;
    daysLeft: string;
    all: string;
    investment: string;
    products: string;
    viewPackages: string;
    startInvesting: string;
    loadFailed: string;
    tryAgain: string;
  };
  deposit: {
    title: string;
    topUpBalance: string;
    paymentMethod: string;
    bankTransfer: string;
    eWallet: string;
    qris: string;
    crypto: string;
    usdt: string;
    amount: string;
    minDeposit: string;
    uploadProof: string;
    proofOptional: string;
    submitDeposit: string;
    depositHistory: string;
    accountNo: string;
    holderName: string;
    scanQR: string;
    balanceSufficient: string;
    payFromBalance: string;
    productPayment: string;
    investmentPayment: string;
    back: string;
    totalPayment: string;
    sufficientBalance: string;
    sufficientBalanceDesc: string;
    paymentAmount: string;
    uploadTransfer: string;
    maxFileSize: string;
    depositSuccess: string;
    depositProductSuccess: string;
    depositInvestSuccess: string;
    depositPending: string;
    minDepositAmount: string;
    selectPayment: string;
    uploadFailed: string;
    noPaymentMethods: string;
    noDepositHistory: string;
    uploadProofLabel: string;
    bankAccountNo: string;
    eWalletAccount: string;
    atName: string;
    scanQRDesc: string;
    pay: string;
    deposit: string;
    quantity: string;
    contractDays: string;
    buyProduct: string;
    invest: string;
    loadFailed: string;
    tryAgain: string;
  };
  withdraw: {
    title: string;
    withdrawFunds: string;
    bankAccount: string;
    addBank: string;
    noBankAccount: string;
    fee: string;
    netAmount: string;
    minWithdraw: string;
    outsideHours: string;
    workingHours: string;
    withdrawHistory: string;
    selectBank: string;
    withdrawAmount: string;
    profitBalance: string;
    amount: string;
    adminFee: string;
    received: string;
    noBankYet: string;
    addBankFirst: string;
    addBankBtn: string;
    selectBankAccount: string;
    minWithFee: string;
    insufficientProfit: string;
    withdrawSuccess: string;
    noWithdrawHistory: string;
    weekdaysOnly: string;
    hoursOnly: string;
    loadFailed: string;
    tryAgain: string;
  };
  history: {
    title: string;
    transactionHistory: string;
    all: string;
    deposit: string;
    withdrawal: string;
    purchase: string;
    investment: string;
    bonus: string;
    profit: string;
    noTransactions: string;
    loadFailed: string;
    tryAgain: string;
    product: string;
    wd: string;
    allActivity: string;
    success: string;
    completed: string;
    pending: string;
    failed: string;
    cancelled: string;
    stopped: string;
    buyProduct: string;
  };
  referral: {
    title: string;
    inviteFriends: string;
    yourCode: string;
    yourLink: string;
    copyLink: string;
    shareVia: string;
    totalReferrals: string;
    bonusEarned: string;
    teamList: string;
    level: string;
    noTeam: string;
    shareCode: string;
    copied: string;
    copyFailed: string;
    directInvite: string;
    level1Invite: string;
    level2Invite: string;
    level3Invite: string;
    level4Invite: string;
    referralLevel: string;
    bonusReferral: string;
    shareViaWhatsApp: string;
    loadFailed: string;
    tryAgain: string;
    oneReferralLimit: string;
    referralSlotUsed: string;
    referralSlotAvailable: string;
  };
  network: {
    title: string;
    solarNetwork: string;
    groupOmzet: string;
    directReferrals: string;
    totalNetwork: string;
    levelDetail: string;
    bonusSummary: string;
    totalSponsorBonus: string;
    totalLevelBonus: string;
    totalRewardBonus: string;
    milestone: string;
    referralList: string;
    networkVisualization: string;
    atCenter: string;
    totalMembers: string;
    detailPerLevel: string;
    infoOmzetBonus: string;
    bonusSummaryDesc: string;
    fromInvestmentReferral: string;
    basedOnOmzet: string;
    milestoneAchievement: string;
    milestoneDesc: string;
    achieveTarget: string;
    noMilestone: string;
    clickToView: string;
    noMembers: string;
    inviteFriendsNow: string;
    members: string;
    omzetGroup: string;
    sponsorBonusRate: string;
    levelBonusRate: string;
    achieved: string;
    bonusReceived: string;
    referral: string;
    loadFailed: string;
    tryAgain: string;
    copyCode: string;
    codeCopied: string;
    copyFailed: string;
    networkUnavailable: string;
    omzet: string;
  };
  bank: {
    title: string;
    addBank: string;
    editBank: string;
    bankName: string;
    accountNo: string;
    holderName: string;
    primary: string;
    noBanks: string;
    bankExample: string;
    enterAccountNo: string;
    namePerBook: string;
    saveBank: string;
    addBtn: string;
    deleteBank: string;
    deleteConfirm: string;
    deleted: string;
    updated: string;
    added: string;
    allFieldsRequired: string;
    loadFailed: string;
    tryAgain: string;
  };
  settings: {
    title: string;
    changeName: string;
    changeWhatsapp: string;
    changePassword: string;
    saveName: string;
    saveWhatsapp: string;
    changePasswordBtn: string;
    logoutAccount: string;
    profileInfo: string;
    whatsapp: string;
    mainBalance: string;
    totalDeposit: string;
    totalProfit: string;
    nameRequired: string;
    nameUpdated: string;
    whatsappRequired: string;
    whatsappUpdated: string;
    avatarUpdated: string;
    avatarUploadFailed: string;
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
    passwordMin6: string;
    passwordMismatch: string;
    passwordUpdated: string;
    bankAccount: string;
    referral: string;
    notSet: string;
    nameEmpty: string;
    loadFailed: string;
  };
  nav: {
    home: string;
    dashboard: string;
    products: string;
    paket: string;
    assets: string;
    deposit: string;
    withdraw: string;
    history: string;
    referral: string;
    network: string;
    bank: string;
    settings: string;
    download: string;
    wallet: string;
    profile: string;
    logout: string;
    salaryBonus: string;
    matchingBonus: string;
  };
  landing: {
    welcome: string;
    subtitle: string;
    aboutTitle: string;
    aboutSubtitle: string;
    howItWorks: string;
    easySteps: string;
    statistics: string;
    liveActivity: string;
    testimonials: string;
    startNow: string;
    viewProducts: string;
    security: string;
    dailyProfit: string;
    fastTransaction: string;
    globalAccess: string;
    trusted: string;
    cuttingEdge: string;
    registerStep: string;
    verifyStep: string;
    depositStep: string;
    selectProduct: string;
    monitorProfit: string;
    totalMembers: string;
    totalTransactions: string;
    uptime: string;
    satisfaction: string;
    aboutNexvo: string;
    digitalPlatform: string;
    trustedWorldwide: string;
    startInvestNow: string;
    viewAllProducts: string;
    noProductsAvailable: string;
    recentTransactions: string;
    monitorRealTime: string;
    noRecentActivity: string;
    whatTheySay: string;
    realTestimonials: string;
    featuredProducts: string;
    choosePackage: string;
    choosePackageDesc: string;
    minutesToStart: string;
    serverUptime: string;
    onlineSupport: string;
    sslEncryption: string;
    verificationProcess: string;
    quotaFilled: string;
    remaining: string;
    days: string;
    estProfit: string;
    viewDetail: string;
    duration: string;
  };
  admin: {
    mainGroup: string;
    managementGroup: string;
    transactionGroup: string;
    systemGroup: string;
    contentGroup: string;
    securityGroup: string;
    otherGroup: string;
    systemOnline: string;
    adminPanel: string;
    logout: string;
  };
  otp: {
    title: string;
    subtitle: string;
    verifyBtn: string;
    resendOtp: string;
    sentTo: string;
  };
  salary: {
    title: string;
    subtitle: string;
    eligibility: string;
    eligible: string;
    notEligible: string;
    directRefs: string;
    groupOmzet: string;
    required: string;
    current: string;
    salaryAmount: string;
    perWeek: string;
    claimSalary: string;
    claimSuccess: string;
    alreadyClaimed: string;
    notEligibleMsg: string;
    salaryHistory: string;
    weekNumber: string;
    year: string;
    amount: string;
    status: string;
    paid: string;
    noHistory: string;
    totalEarned: string;
    lastClaimed: string;
    neverClaimed: string;
    loadFailed: string;
    tryAgain: string;
    claiming: string;
  };
  matching: {
    title: string;
    subtitle: string;
    members: string;
    potentialBonus: string;
    levelRates: string;
    level: string;
    rate: string;
    bonus: string;
    claimMatching: string;
    claimSuccess: string;
    noBonus: string;
    matchingHistory: string;
    noHistory: string;
    totalEarned: string;
    loadFailed: string;
    tryAgain: string;
    claiming: string;
    profitOverview: string;
    profitOverviewDesc: string;
    downlineProfit: string;
    downlineMembers: string;
    profitDownline: string;
    totalProfitMatched: string;
  };
};

const translations: Record<Language, TranslationKeys> = {
  id: {
    common: {
      loading: 'Memuat...',
      error: 'Terjadi kesalahan',
      success: 'Berhasil',
      retry: 'Coba Lagi',
      save: 'Simpan',
      cancel: 'Batal',
      delete: 'Hapus',
      edit: 'Edit',
      add: 'Tambah',
      search: 'Cari',
      noData: 'Tidak ada data',
      confirm: 'Konfirmasi',
      back: 'Kembali',
      next: 'Selanjutnya',
      submit: 'Kirim',
      close: 'Tutup',
      copy: 'Salin',
      copied: 'Disalin',
      share: 'Bagikan',
      download: 'Unduh',
      upload: 'Unggah',
      viewAll: 'Lihat Semua',
      processing: 'Memproses...',
      allFieldsRequired: 'Semua field harus diisi',
      networkError: 'Terjadi kesalahan jaringan',
      operationFailed: 'Operasi gagal',
    },
    auth: {
      login: 'Masuk',
      register: 'Daftar',
      logout: 'Keluar',
      whatsapp: 'WhatsApp',
      email: 'Email',
      password: 'Password',
      oldPassword: 'Password Lama',
      newPassword: 'Password Baru',
      confirmPassword: 'Konfirmasi Password',
      forgotPassword: 'Lupa Password',
      noAccount: 'Belum punya akun?',
      hasAccount: 'Sudah punya akun?',
      loginSuccess: 'Selamat datang kembali!',
      registerSuccess: 'Akun berhasil dibuat! Selamat datang di NEXVO.',
      otpVerification: 'Verifikasi OTP',
      enterOtp: 'Masukkan kode OTP',
      resendOtp: 'Kirim ulang OTP',
      referralCode: 'Kode Referral',
      referralCodeOptional: 'Masukkan kode referral (opsional)',
      loginSubtitle: 'Masuk untuk mengakses platform NEXVO',
      registerSubtitle: 'Daftar akun baru di platform NEXVO',
      whatsappOrEmail: 'WhatsApp / Email',
      enterWhatsappOrEmail: 'Nomor WhatsApp atau Email',
      enterPassword: 'Masukkan password',
      minChars: 'Minimal 6 karakter',
      passwordMismatch: 'Password tidak cocok',
      passwordNotMatch: 'Konfirmasi password tidak cocok',
      registerNow: 'Daftar Sekarang',
      signIn: 'Masuk',
      adminPanel: 'Admin Panel',
      strengthWeak: 'Lemah',
      strengthMedium: 'Sedang',
      strengthStrong: 'Kuat',
      passwordStrength: 'Kekuatan',
      haveCode: 'Punya kode?',
      hide: 'Sembunyikan',
      registering: 'Mendaftar...',
      whatsappNumber: 'Nomor WhatsApp',
      emailAddress: 'Alamat Email',
      validWhatsApp: 'Masukkan nomor WhatsApp yang valid',
      validEmail: 'Masukkan email yang valid',
    },
    dashboard: {
      title: 'Dashboard',
      mainBalance: 'Saldo Utama',
      profitBalance: 'Saldo Profit',
      totalDeposit: 'Total Deposit',
      totalWithdraw: 'Total Withdraw',
      totalProfit: 'Total Profit',
      level: 'Level',
      activeAssets: 'Aset Aktif',
      recentActivity: 'Aktivitas Terbaru',
      memberSince: 'Member sejak',
      quickNav: 'Navigasi Cepat',
      noActivity: 'Belum ada aktivitas',
      depositBtn: 'Deposit',
      withdrawBtn: 'Withdraw',
      buyProduct: 'Beli Produk',
      investment: 'Investasi',
      bonus: 'Bonus',
      profit: 'Profit',
      success: 'Berhasil',
      completed: 'Selesai',
      pending: 'Pending',
      failed: 'Gagal',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
      active: 'Aktif',
      perDay: '/hari',
      viewAll: 'Lihat Semua',
    },
    products: {
      title: 'Produk',
      investmentProducts: 'Produk Investasi',
      filter: 'Filter',
      all: 'Semua',
      gold: 'Emas',
      silver: 'Perak',
      diamond: 'Berlian',
      duration: 'Durasi',
      estProfit: 'Est. Profit',
      quota: 'Kuota',
      quotaFilled: 'Kuota Terisi',
      remaining: 'Tersisa',
      buyNow: 'Beli Sekarang',
      viewDetail: 'Lihat Detail',
      noProducts: 'Belum Ada Produk',
      noCategory: 'Tidak ada produk dalam kategori',
      selectProduct: 'Pilih paket yang sesuai dengan tujuan investasi Anda',
      perDay: '/ hari',
      days: 'Hari',
    },
    paket: {
      title: 'Paket',
      investmentPackages: 'Paket Investasi',
      dailyProfit: 'Profit Harian',
      contract: 'Kontrak',
      contractDays: 'Hari',
      capitalReturn: 'Modal Kembali',
      investNow: 'Invest Sekarang',
      confirmInvest: 'Invest Sekarang',
      investSuccess: 'Investasi Berhasil!',
      totalProfit: 'Total Profit',
      bonusStructure: 'Struktur Bonus',
      sponsorBonus: 'Bonus Sponsor',
      levelBonus: 'Bonus Level',
      rewardBonus: 'Bonus Reward',
      solarNetwork: 'Matching Profit',
      selectPackage: 'Pilih paket investasi yang sesuai dengan kebutuhan Anda',
      confirmInvestTitle: 'Konfirmasi Investasi',
      balanceDeduct: 'Saldo akan dipotong dari saldo utama Anda',
      insufficientBalance: 'Saldo tidak mencukupi, Anda akan diarahkan ke deposit',
      packageLabel: 'Paket',
      modal: 'Modal',
      contractLabel: 'Kontrak',
      yourBalance: 'Saldo Anda',
      remainingBalance: 'Sisa Saldo',
      cancel: 'Batal',
      depositInvest: 'Deposit & Invest',
      investSuccessTitle: 'Investasi Berhasil!',
      investSuccessDesc: 'berhasil diaktifkan',
      viewMyAssets: 'Lihat Aset Saya',
      noPackages: 'Belum ada paket investasi tersedia',
      totalProfitDays: 'Total profit {days} hari',
      fromReferral: 'Dari deposit referral',
      basedOnGroupOmzet: 'Berdasarkan omzet grup',
      basedOnGroupOmzet2: 'Berdasarkan omzet grup',
      networkBonus: 'Sistem bonus Matching Profit 5 level dari profit downline Anda',
    },
    assets: {
      title: 'Aset',
      myAssets: 'Aset Saya',
      investNew: 'Invest Baru',
      activeAsset: 'Aset Aktif',
      totalCapital: 'Total Modal',
      profitPerDay: 'Profit/Hari',
      totalProfit: 'Total Profit',
      modal: 'Modal',
      contractProgress: 'Progress Kontrak',
      daysRemaining: 'hari tersisa',
      estimatedReturn: 'Estimasi Total Return',
      lastProfit: 'Profit terakhir',
      statusActive: 'Aktif',
      statusCompleted: 'Selesai',
      statusStopped: 'Dihentikan',
      statusCancelled: 'Dibatalkan',
      noAssets: 'Belum Ada Aset',
      investmentPackage: 'Paket Investasi',
      product: 'Produk',
      contract: 'Kontrak',
      profitRate: 'Profit Rate',
      endDate: 'Selesai',
      daysLeft: 'hari tersisa',
      all: 'Semua',
      investment: 'Investasi',
      products: 'Produk',
      viewPackages: 'Lihat Paket Investasi',
      startInvesting: 'Mulai investasi untuk menambah aset Anda',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
    },
    deposit: {
      title: 'Deposit',
      topUpBalance: 'Top up saldo akun Anda',
      paymentMethod: 'Metode Pembayaran',
      bankTransfer: 'Bank Transfer',
      eWallet: 'E-Wallet',
      qris: 'QRIS',
      crypto: 'USDT (BEP20)',
      usdt: 'USDT (BEP20)',
      amount: 'Jumlah Pembayaran',
      minDeposit: 'Minimal deposit Rp100.000',
      uploadProof: 'Bukti Transfer (Opsional)',
      proofOptional: 'Bukti Transfer (Opsional)',
      submitDeposit: 'Deposit',
      depositHistory: 'Riwayat Deposit',
      accountNo: 'Nomor Rekening',
      holderName: 'Atas Nama',
      scanQR: 'Scan QR',
      balanceSufficient: 'Saldo Mencukupi!',
      payFromBalance: 'Bayar Langsung dari Saldo',
      productPayment: 'Pembayaran Produk',
      investmentPayment: 'Pembayaran Investasi',
      back: 'Kembali',
      totalPayment: 'Total Pembayaran',
      sufficientBalance: 'Saldo Mencukupi!',
      sufficientBalanceDesc: 'Saldo utama Anda cukup untuk',
      paymentAmount: 'Jumlah Pembayaran',
      uploadTransfer: 'Upload Bukti Transfer',
      maxFileSize: 'PNG, JPG maks. 5MB',
      depositSuccess: 'Deposit berhasil diajukan. Menunggu konfirmasi admin.',
      depositProductSuccess: 'Deposit berhasil diajukan. Setelah disetujui, saldo bisa langsung digunakan untuk membeli produk.',
      depositInvestSuccess: 'Deposit berhasil diajukan. Setelah disetujui, saldo bisa langsung digunakan untuk investasi.',
      depositPending: 'Deposit berhasil diajukan. Menunggu konfirmasi admin.',
      minDepositAmount: 'Minimal deposit Rp100.000',
      selectPayment: 'Pilih metode pembayaran terlebih dahulu',
      uploadFailed: 'Gagal mengupload bukti transfer',
      noPaymentMethods: 'Metode pembayaran belum tersedia',
      noDepositHistory: 'Belum ada riwayat deposit',
      uploadProofLabel: 'Bukti Transfer (Opsional)',
      bankAccountNo: 'Nomor Rekening',
      eWalletAccount: 'Nomor Akun',
      atName: 'Atas Nama',
      scanQRDesc: 'Scan kode QR di atas menggunakan aplikasi e-wallet atau mobile banking Anda',
      pay: 'Bayar',
      deposit: 'Deposit',
      quantity: 'Jumlah',
      contractDays: 'Kontrak',
      buyProduct: 'membeli produk',
      invest: 'berinvestasi',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
    },
    withdraw: {
      title: 'Withdraw',
      withdrawFunds: 'Tarik saldo dari akun Anda',
      bankAccount: 'Rekening Tujuan',
      addBank: 'Tambah Rekening',
      noBankAccount: 'Belum Ada Rekening',
      fee: 'Biaya Admin',
      netAmount: 'Diterima',
      minWithdraw: 'Minimal Withdraw',
      outsideHours: 'Di Luar Jam Operasional',
      workingHours: 'Withdraw hanya tersedia Senin - Jumat, jam 08:00 - 17:00',
      withdrawHistory: 'Riwayat Withdraw',
      selectBank: 'Pilih rekening bank',
      withdrawAmount: 'Jumlah Withdraw',
      profitBalance: 'Saldo Profit',
      amount: 'Jumlah',
      adminFee: 'Biaya Admin',
      received: 'Diterima',
      noBankYet: 'Belum Ada Rekening',
      addBankFirst: 'Tambahkan rekening bank terlebih dahulu untuk melakukan withdrawal',
      addBankBtn: 'Tambah Rekening',
      selectBankAccount: 'Pilih rekening bank',
      minWithFee: 'Minimal',
      insufficientProfit: 'Saldo profit tidak mencukupi',
      withdrawSuccess: 'Withdraw berhasil diajukan',
      noWithdrawHistory: 'Belum ada riwayat withdraw',
      weekdaysOnly: 'Withdraw hanya tersedia Senin - Jumat',
      hoursOnly: 'Withdraw hanya tersedia jam 08:00 - 17:00',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
    },
    history: {
      title: 'Riwayat',
      transactionHistory: 'Riwayat Transaksi',
      all: 'Semua',
      deposit: 'Deposit',
      withdrawal: 'Withdraw',
      purchase: 'Produk',
      investment: 'Investasi',
      bonus: 'Bonus',
      profit: 'Profit',
      noTransactions: 'Belum ada transaksi',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
      product: 'Produk',
      wd: 'WD',
      allActivity: 'Semua riwayat aktivitas keuangan Anda',
      success: 'Berhasil',
      completed: 'Selesai',
      pending: 'Pending',
      failed: 'Gagal',
      cancelled: 'Dibatalkan',
      stopped: 'Dihentikan',
      buyProduct: 'Beli Produk',
    },
    referral: {
      title: 'Referral',
      inviteFriends: 'Ajak teman dan dapatkan bonus',
      yourCode: 'Kode Referral Anda',
      yourLink: 'Link Referral Anda',
      copyLink: 'Salin Link',
      shareVia: 'Bagikan',
      totalReferrals: 'Total Referral',
      bonusEarned: 'Bonus Earned',
      teamList: 'Tim Referral',
      level: 'Level',
      noTeam: 'Belum ada tim referral',
      shareCode: 'Bagikan kode Anda untuk mulai mendapatkan bonus',
      copied: 'Link referral disalin!',
      copyFailed: 'Gagal menyalin link',
      directInvite: 'Undangan langsung',
      level1Invite: 'Undangan dari Level 1',
      level2Invite: 'Undangan dari Level 2',
      level3Invite: 'Undangan dari Level 3',
      level4Invite: 'Undangan dari Level 4',
      referralLevel: 'Level Bonus Referral',
      bonusReferral: 'Bonus Referral',
      shareViaWhatsApp: 'WhatsApp',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
      oneReferralLimit: 'Maksimal 1 referral langsung',
      referralSlotUsed: 'Slot referral sudah terpakai',
      referralSlotAvailable: 'Slot referral tersedia',
    },
    network: {
      title: 'Jaringan',
      solarNetwork: 'Matching Profit',
      groupOmzet: 'Total Group Omzet',
      directReferrals: 'Referral Langsung',
      totalNetwork: 'Total Network',
      levelDetail: 'Detail Per Level',
      bonusSummary: 'Ringkasan Bonus',
      totalSponsorBonus: 'Total Bonus Sponsor',
      totalLevelBonus: 'Total Bonus Level',
      totalRewardBonus: 'Total Bonus Reward',
      milestone: 'Reward Milestone',
      referralList: 'Daftar Referral',
      networkVisualization: 'Visualisasi Jaringan',
      atCenter: 'Anda berada di pusat jaringan',
      totalMembers: 'total anggota jaringan',
      detailPerLevel: 'Detail Per Level',
      infoOmzetBonus: 'Informasi omzet dan bonus di setiap level jaringan',
      bonusSummaryDesc: 'Total bonus yang telah Anda terima dari berbagai sumber',
      fromInvestmentReferral: 'Dari investasi referral',
      basedOnOmzet: 'Berdasarkan omzet grup',
      milestoneAchievement: 'Pencapaian milestone',
      milestoneDesc: 'Capai target omzet grup untuk mendapatkan bonus reward',
      achieveTarget: 'Capai target omzet grup untuk mendapatkan bonus reward',
      noMilestone: 'Belum ada data milestone',
      clickToView: 'Klik level untuk melihat daftar anggota',
      noMembers: 'Belum ada anggota di jaringan Anda',
      inviteFriendsNow: 'Ajak Teman Sekarang',
      members: 'anggota',
      omzetGroup: 'Omzet Grup',
      sponsorBonusRate: 'Bonus Sponsor',
      levelBonusRate: 'Bonus Level',
      achieved: 'Tercapai!',
      bonusReceived: 'Bonus diterima',
      referral: 'referral',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
      copyCode: 'Salin kode',
      codeCopied: 'Kode Referral Disalin!',
      copyFailed: 'Gagal Menyalin',
      networkUnavailable: 'Data jaringan tidak tersedia',
      omzet: 'Omzet',
    },
    bank: {
      title: 'Rekening Bank',
      addBank: 'Tambah Rekening',
      editBank: 'Edit Rekening',
      bankName: 'Nama Bank',
      accountNo: 'Nomor Rekening',
      holderName: 'Nama Pemilik',
      primary: 'Utama',
      noBanks: 'Belum Ada Rekening',
      bankExample: 'Contoh: BCA, Mandiri, BNI',
      enterAccountNo: 'Masukkan nomor rekening',
      namePerBook: 'Nama sesuai buku rekening',
      saveBank: 'Simpan',
      addBtn: 'Tambah',
      deleteBank: 'Hapus Rekening?',
      deleteConfirm: 'akan dihapus secara permanen.',
      deleted: 'Rekening dihapus',
      updated: 'Rekening diperbarui',
      added: 'Rekening ditambahkan',
      allFieldsRequired: 'Semua field harus diisi',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
    },
    settings: {
      title: 'Pengaturan',
      changeName: 'Ubah Nama',
      changeWhatsapp: 'Ubah WhatsApp',
      changePassword: 'Ubah Password',
      saveName: 'Simpan Nama',
      saveWhatsapp: 'Simpan',
      changePasswordBtn: 'Ubah Password',
      logoutAccount: 'Keluar dari Akun',
      profileInfo: 'Kelola akun dan profil Anda',
      whatsapp: 'WhatsApp',
      mainBalance: 'Saldo Utama',
      totalDeposit: 'Total Deposit',
      totalProfit: 'Total Profit',
      nameRequired: 'Nama tidak boleh kosong',
      nameUpdated: 'Nama berhasil diperbarui',
      whatsappRequired: 'Nomor WhatsApp tidak boleh kosong',
      whatsappUpdated: 'Nomor WhatsApp berhasil diperbarui',
      avatarUpdated: 'Avatar berhasil diperbarui',
      avatarUploadFailed: 'Gagal mengupload avatar',
      oldPassword: 'Password Lama',
      newPassword: 'Password Baru',
      confirmPassword: 'Konfirmasi Password Baru',
      passwordMin6: 'Password baru minimal 6 karakter',
      passwordMismatch: 'Password tidak cocok',
      passwordUpdated: 'Password berhasil diperbarui',
      bankAccount: 'Rekening Bank',
      referral: 'Referral',
      notSet: 'Belum diatur',
      nameEmpty: 'Nama tidak boleh kosong',
      loadFailed: 'Terjadi kesalahan',
    },
    nav: {
      home: 'Beranda',
      dashboard: 'Dashboard',
      products: 'Produk',
      paket: 'Paket',
      assets: 'Aset',
      deposit: 'Deposit',
      withdraw: 'Withdraw',
      history: 'Riwayat',
      referral: 'Referral',
      network: 'Jaringan',
      bank: 'Bank',
      settings: 'Pengaturan',
      download: 'Unduh',
      wallet: 'Wallet',
      profile: 'Profil',
      logout: 'Keluar',
      salaryBonus: 'Gaji',
      matchingBonus: 'M.Profit',
    },
    landing: {
      welcome: 'Selamat Datang di NEXVO',
      subtitle: 'Platform Manajemen Aset Digital #1',
      aboutTitle: 'Tentang NEXVO',
      aboutSubtitle: 'Platform Investasi Digital',
      howItWorks: 'Cara Kerja',
      easySteps: '5 Langkah Mudah',
      statistics: 'Statistik',
      liveActivity: 'Aktivitas Live',
      testimonials: 'Testimoni',
      startNow: 'Mulai Sekarang',
      viewProducts: 'Lihat Produk',
      security: 'Keamanan Tingkat Tinggi',
      dailyProfit: 'Profit Harian Terukur',
      fastTransaction: 'Transaksi Cepat & Mudah',
      globalAccess: 'Akses Global 24/7',
      trusted: 'Terpercaya & Transparan',
      cuttingEdge: 'Teknologi Terdepan',
      registerStep: 'Daftar Akun',
      verifyStep: 'Verifikasi OTP',
      depositStep: 'Deposit Saldo',
      selectProduct: 'Pilih Produk',
      monitorProfit: 'Pantau Profit',
      totalMembers: 'Total Member',
      totalTransactions: 'Total Transaksi',
      uptime: 'Uptime',
      satisfaction: 'Kepuasan',
      aboutNexvo: 'Tentang NEXVO',
      digitalPlatform: 'Platform Investasi Digital',
      trustedWorldwide: 'Terpercaya di Seluruh Dunia',
      startInvestNow: 'Mulai Investasi Sekarang',
      viewAllProducts: 'Lihat Semua Produk',
      noProductsAvailable: 'Belum ada produk tersedia',
      recentTransactions: 'Transaksi Terkini',
      monitorRealTime: 'Pantau aktivitas terbaru dari seluruh pengguna NEXVO secara real-time',
      noRecentActivity: 'Belum ada aktivitas terbaru',
      whatTheySay: 'Apa Kata Mereka',
      realTestimonials: 'Testimoni nyata dari pengguna NEXVO yang telah merasakan manfaatnya',
      featuredProducts: 'Produk Unggulan',
      choosePackage: 'Pilih Paket Investasi',
      choosePackageDesc: 'Pilih paket yang sesuai dengan kemampuan dan tujuan investasi Anda',
      minutesToStart: 'Mulai perjalanan investasi digital Anda dalam hitungan menit',
      serverUptime: 'Uptime Server',
      onlineSupport: 'Support Online',
      sslEncryption: 'Enkripsi SSL',
      verificationProcess: 'Proses Verifikasi',
      quotaFilled: 'Kuota Terisi',
      remaining: 'Tersisa',
      days: 'Hari',
      estProfit: 'Est. profit',
      viewDetail: 'Lihat Detail',
      duration: 'Durasi',
    },
    admin: {
      mainGroup: 'Utama',
      managementGroup: 'Manajemen',
      transactionGroup: 'Transaksi',
      systemGroup: 'Sistem',
      contentGroup: 'Konten',
      securityGroup: 'Keamanan',
      otherGroup: 'Lainnya',
      systemOnline: 'System Online',
      adminPanel: 'Panel Admin NEXVO',
      logout: 'Keluar',
    },
    otp: {
      title: 'Verifikasi OTP',
      subtitle: 'Masukkan kode OTP yang dikirim ke WhatsApp/Email Anda',
      verifyBtn: 'Verifikasi',
      resendOtp: 'Kirim Ulang OTP',
      sentTo: 'Kode dikirim ke',
    },
    salary: {
      title: 'Gaji Mingguan',
      subtitle: 'Dapatkan gaji mingguan dengan memenuhi syarat',
      eligibility: 'Syarat Kelayakan',
      eligible: 'Memenuhi Syarat',
      notEligible: 'Belum Memenuhi',
      directRefs: 'Referral Langsung',
      groupOmzet: 'Omzet Grup',
      required: 'Dibutuhkan',
      current: 'Saat ini',
      salaryAmount: 'Jumlah Gaji',
      perWeek: '/minggu',
      claimSalary: 'Klaim Gaji Mingguan',
      claimSuccess: 'Gaji mingguan berhasil diklaim!',
      alreadyClaimed: 'Sudah diklaim minggu ini',
      notEligibleMsg: 'Anda belum memenuhi syarat untuk mendapatkan gaji mingguan',
      salaryHistory: 'Riwayat Gaji',
      weekNumber: 'Minggu',
      year: 'Tahun',
      amount: 'Jumlah',
      status: 'Status',
      paid: 'Dibayar',
      noHistory: 'Belum ada riwayat gaji',
      totalEarned: 'Total Gaji Diterima',
      lastClaimed: 'Terakhir Diklaim',
      neverClaimed: 'Belum pernah diklaim',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
      claiming: 'Mengklaim...',
    },
    matching: {
      title: 'Bonus Matching Profit',
      subtitle: 'Dapatkan bonus dari profit downline Anda',
      members: 'anggota',
      potentialBonus: 'Bonus Potensial',
      levelRates: 'Tarif Per Level',
      level: 'Level',
      rate: 'Tarif',
      bonus: 'Bonus',
      claimMatching: 'Klaim Bonus Matching Profit',
      claimSuccess: 'Bonus matching profit berhasil diklaim!',
      noBonus: 'Tidak ada bonus matching profit yang bisa diklaim saat ini',
      matchingHistory: 'Riwayat Matching Profit',
      noHistory: 'Belum ada riwayat matching profit',
      totalEarned: 'Total Matching Diterima',
      loadFailed: 'Gagal Memuat Data',
      tryAgain: 'Coba Lagi',
      claiming: 'Mengklaim...',
      profitOverview: 'Ringkasan Matching Profit',
      profitOverviewDesc: 'Bonus dari profit yang dihasilkan downline Anda',
      downlineProfit: 'Profit Downline',
      downlineMembers: 'Anggota Downline',
      profitDownline: 'Profit Downline',
      totalProfitMatched: 'Total Profit Dimatching',
    },
  },
  en: {
    common: {
      loading: 'Loading...',
      error: 'An error occurred',
      success: 'Success',
      retry: 'Try Again',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      add: 'Add',
      search: 'Search',
      noData: 'No data',
      confirm: 'Confirm',
      back: 'Back',
      next: 'Next',
      submit: 'Submit',
      close: 'Close',
      copy: 'Copy',
      copied: 'Copied',
      share: 'Share',
      download: 'Download',
      upload: 'Upload',
      viewAll: 'View All',
      processing: 'Processing...',
      allFieldsRequired: 'All fields are required',
      networkError: 'Network error occurred',
      operationFailed: 'Operation failed',
    },
    auth: {
      login: 'Login',
      register: 'Register',
      logout: 'Logout',
      whatsapp: 'WhatsApp',
      email: 'Email',
      password: 'Password',
      oldPassword: 'Old Password',
      newPassword: 'New Password',
      confirmPassword: 'Confirm Password',
      forgotPassword: 'Forgot Password',
      noAccount: "Don't have an account?",
      hasAccount: 'Already have an account?',
      loginSuccess: 'Welcome back!',
      registerSuccess: 'Account created! Welcome to NEXVO.',
      otpVerification: 'OTP Verification',
      enterOtp: 'Enter OTP code',
      resendOtp: 'Resend OTP',
      referralCode: 'Referral Code',
      referralCodeOptional: 'Enter referral code (optional)',
      loginSubtitle: 'Sign in to access the NEXVO platform',
      registerSubtitle: 'Create a new account on NEXVO platform',
      whatsappOrEmail: 'WhatsApp / Email',
      enterWhatsappOrEmail: 'WhatsApp number or Email',
      enterPassword: 'Enter password',
      minChars: 'Minimum 6 characters',
      passwordMismatch: 'Passwords do not match',
      passwordNotMatch: 'Password confirmation does not match',
      registerNow: 'Register Now',
      signIn: 'Sign In',
      adminPanel: 'Admin Panel',
      strengthWeak: 'Weak',
      strengthMedium: 'Medium',
      strengthStrong: 'Strong',
      passwordStrength: 'Strength',
      haveCode: 'Have a code?',
      hide: 'Hide',
      registering: 'Registering...',
      whatsappNumber: 'WhatsApp Number',
      emailAddress: 'Email Address',
      validWhatsApp: 'Enter a valid WhatsApp number',
      validEmail: 'Enter a valid email address',
    },
    dashboard: {
      title: 'Dashboard',
      mainBalance: 'Main Balance',
      profitBalance: 'Profit Balance',
      totalDeposit: 'Total Deposit',
      totalWithdraw: 'Total Withdraw',
      totalProfit: 'Total Profit',
      level: 'Level',
      activeAssets: 'Active Assets',
      recentActivity: 'Recent Activity',
      memberSince: 'Member since',
      quickNav: 'Quick Navigation',
      noActivity: 'No activity yet',
      depositBtn: 'Deposit',
      withdrawBtn: 'Withdraw',
      buyProduct: 'Buy Product',
      investment: 'Investment',
      bonus: 'Bonus',
      profit: 'Profit',
      success: 'Success',
      completed: 'Completed',
      pending: 'Pending',
      failed: 'Failed',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
      active: 'Active',
      perDay: '/day',
      viewAll: 'View All',
    },
    products: {
      title: 'Products',
      investmentProducts: 'Investment Products',
      filter: 'Filter',
      all: 'All',
      gold: 'Gold',
      silver: 'Silver',
      diamond: 'Diamond',
      duration: 'Duration',
      estProfit: 'Est. Profit',
      quota: 'Quota',
      quotaFilled: 'Quota Filled',
      remaining: 'Remaining',
      buyNow: 'Buy Now',
      viewDetail: 'View Detail',
      noProducts: 'No Products Available',
      noCategory: 'No products in category',
      selectProduct: 'Choose a package that suits your investment goals',
      perDay: ' / day',
      days: 'Days',
    },
    paket: {
      title: 'Packages',
      investmentPackages: 'Investment Packages',
      dailyProfit: 'Daily Profit',
      contract: 'Contract',
      contractDays: 'Days',
      capitalReturn: 'Capital Return',
      investNow: 'Invest Now',
      confirmInvest: 'Invest Now',
      investSuccess: 'Investment Successful!',
      totalProfit: 'Total Profit',
      bonusStructure: 'Bonus Structure',
      sponsorBonus: 'Sponsor Bonus',
      levelBonus: 'Level Bonus',
      rewardBonus: 'Reward Bonus',
      solarNetwork: 'Matching Profit',
      selectPackage: 'Choose an investment package that suits your needs',
      confirmInvestTitle: 'Confirm Investment',
      balanceDeduct: 'Balance will be deducted from your main balance',
      insufficientBalance: 'Insufficient balance, you will be redirected to deposit',
      packageLabel: 'Package',
      modal: 'Capital',
      contractLabel: 'Contract',
      yourBalance: 'Your Balance',
      remainingBalance: 'Remaining Balance',
      cancel: 'Cancel',
      depositInvest: 'Deposit & Invest',
      investSuccessTitle: 'Investment Successful!',
      investSuccessDesc: 'successfully activated',
      viewMyAssets: 'View My Assets',
      noPackages: 'No investment packages available yet',
      totalProfitDays: 'Total profit {days} days',
      fromReferral: 'From referral deposits',
      basedOnGroupOmzet: 'Based on group omzet',
      basedOnGroupOmzet2: 'Based on group omzet',
      networkBonus: '5-level Matching Profit bonus system from your downline profit',
    },
    assets: {
      title: 'Assets',
      myAssets: 'My Assets',
      investNew: 'New Investment',
      activeAsset: 'Active Assets',
      totalCapital: 'Total Capital',
      profitPerDay: 'Profit/Day',
      totalProfit: 'Total Profit',
      modal: 'Capital',
      contractProgress: 'Contract Progress',
      daysRemaining: 'days remaining',
      estimatedReturn: 'Estimated Total Return',
      lastProfit: 'Last profit',
      statusActive: 'Active',
      statusCompleted: 'Completed',
      statusStopped: 'Stopped',
      statusCancelled: 'Cancelled',
      noAssets: 'No Assets Yet',
      investmentPackage: 'Investment Package',
      product: 'Product',
      contract: 'Contract',
      profitRate: 'Profit Rate',
      endDate: 'End Date',
      daysLeft: 'days left',
      all: 'All',
      investment: 'Investment',
      products: 'Products',
      viewPackages: 'View Investment Packages',
      startInvesting: 'Start investing to add to your assets',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
    },
    deposit: {
      title: 'Deposit',
      topUpBalance: 'Top up your account balance',
      paymentMethod: 'Payment Method',
      bankTransfer: 'Bank Transfer',
      eWallet: 'E-Wallet',
      qris: 'QRIS',
      crypto: 'USDT (BEP20)',
      usdt: 'USDT (BEP20)',
      amount: 'Payment Amount',
      minDeposit: 'Minimum deposit Rp100,000',
      uploadProof: 'Transfer Proof (Optional)',
      proofOptional: 'Transfer Proof (Optional)',
      submitDeposit: 'Deposit',
      depositHistory: 'Deposit History',
      accountNo: 'Account Number',
      holderName: 'Account Holder',
      scanQR: 'Scan QR',
      balanceSufficient: 'Balance Sufficient!',
      payFromBalance: 'Pay Directly from Balance',
      productPayment: 'Product Payment',
      investmentPayment: 'Investment Payment',
      back: 'Back',
      totalPayment: 'Total Payment',
      sufficientBalance: 'Balance Sufficient!',
      sufficientBalanceDesc: 'Your main balance is sufficient for',
      paymentAmount: 'Payment Amount',
      uploadTransfer: 'Upload Transfer Proof',
      maxFileSize: 'PNG, JPG max. 5MB',
      depositSuccess: 'Deposit submitted successfully. Awaiting admin confirmation.',
      depositProductSuccess: 'Deposit submitted. Once approved, balance can be used to purchase products.',
      depositInvestSuccess: 'Deposit submitted. Once approved, balance can be used for investment.',
      depositPending: 'Deposit submitted. Awaiting admin confirmation.',
      minDepositAmount: 'Minimum deposit Rp100,000',
      selectPayment: 'Please select a payment method first',
      uploadFailed: 'Failed to upload transfer proof',
      noPaymentMethods: 'No payment methods available',
      noDepositHistory: 'No deposit history yet',
      uploadProofLabel: 'Transfer Proof (Optional)',
      bankAccountNo: 'Account Number',
      eWalletAccount: 'Account Number',
      atName: 'Account Holder',
      scanQRDesc: 'Scan the QR code above using your e-wallet or mobile banking app',
      pay: 'Pay',
      deposit: 'Deposit',
      quantity: 'Qty',
      contractDays: 'Contract',
      buyProduct: 'purchase this product',
      invest: 'invest',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
    },
    withdraw: {
      title: 'Withdraw',
      withdrawFunds: 'Withdraw funds from your account',
      bankAccount: 'Destination Account',
      addBank: 'Add Account',
      noBankAccount: 'No Bank Account',
      fee: 'Admin Fee',
      netAmount: 'Received',
      minWithdraw: 'Minimum Withdraw',
      outsideHours: 'Outside Operating Hours',
      workingHours: 'Withdrawal is only available Monday - Friday, 08:00 - 17:00',
      withdrawHistory: 'Withdrawal History',
      selectBank: 'Select bank account',
      withdrawAmount: 'Withdrawal Amount',
      profitBalance: 'Profit Balance',
      amount: 'Amount',
      adminFee: 'Admin Fee',
      received: 'Received',
      noBankYet: 'No Bank Account Yet',
      addBankFirst: 'Add a bank account first to make a withdrawal',
      addBankBtn: 'Add Account',
      selectBankAccount: 'Select bank account',
      minWithFee: 'Minimum',
      insufficientProfit: 'Insufficient profit balance',
      withdrawSuccess: 'Withdrawal submitted successfully',
      noWithdrawHistory: 'No withdrawal history yet',
      weekdaysOnly: 'Withdrawal only available Monday - Friday',
      hoursOnly: 'Withdrawal only available 08:00 - 17:00',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
    },
    history: {
      title: 'History',
      transactionHistory: 'Transaction History',
      all: 'All',
      deposit: 'Deposit',
      withdrawal: 'Withdraw',
      purchase: 'Product',
      investment: 'Investment',
      bonus: 'Bonus',
      profit: 'Profit',
      noTransactions: 'No transactions yet',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
      product: 'Product',
      wd: 'WD',
      allActivity: 'All your financial activity history',
      success: 'Success',
      completed: 'Completed',
      pending: 'Pending',
      failed: 'Failed',
      cancelled: 'Cancelled',
      stopped: 'Stopped',
      buyProduct: 'Buy Product',
    },
    referral: {
      title: 'Referral',
      inviteFriends: 'Invite friends and earn bonuses',
      yourCode: 'Your Referral Code',
      yourLink: 'Your Referral Link',
      copyLink: 'Copy Link',
      shareVia: 'Share',
      totalReferrals: 'Total Referrals',
      bonusEarned: 'Bonus Earned',
      teamList: 'Referral Team',
      level: 'Level',
      noTeam: 'No referral team yet',
      shareCode: 'Share your code to start earning bonuses',
      copied: 'Referral link copied!',
      copyFailed: 'Failed to copy link',
      directInvite: 'Direct invite',
      level1Invite: 'Invite from Level 1',
      level2Invite: 'Invite from Level 2',
      level3Invite: 'Invite from Level 3',
      level4Invite: 'Invite from Level 4',
      referralLevel: 'Referral Bonus Levels',
      bonusReferral: 'Referral Bonus',
      shareViaWhatsApp: 'WhatsApp',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
      oneReferralLimit: 'Maximum 1 direct referral',
      referralSlotUsed: 'Referral slot used',
      referralSlotAvailable: 'Referral slot available',
    },
    network: {
      title: 'Network',
      solarNetwork: 'Matching Profit',
      groupOmzet: 'Total Group Omzet',
      directReferrals: 'Direct Referrals',
      totalNetwork: 'Total Network',
      levelDetail: 'Detail Per Level',
      bonusSummary: 'Bonus Summary',
      totalSponsorBonus: 'Total Sponsor Bonus',
      totalLevelBonus: 'Total Level Bonus',
      totalRewardBonus: 'Total Reward Bonus',
      milestone: 'Reward Milestone',
      referralList: 'Referral List',
      networkVisualization: 'Network Visualization',
      atCenter: 'You are at the center of your network',
      totalMembers: 'total network members',
      detailPerLevel: 'Detail Per Level',
      infoOmzetBonus: 'Omzet and bonus info at each network level',
      bonusSummaryDesc: 'Total bonuses you have received from various sources',
      fromInvestmentReferral: 'From referral investments',
      basedOnOmzet: 'Based on group omzet',
      milestoneAchievement: 'Milestone achievement',
      milestoneDesc: 'Achieve group omzet targets to earn reward bonuses',
      achieveTarget: 'Achieve group omzet targets to earn reward bonuses',
      noMilestone: 'No milestone data yet',
      clickToView: 'Click level to view member list',
      noMembers: 'No members in your network yet',
      inviteFriendsNow: 'Invite Friends Now',
      members: 'members',
      omzetGroup: 'Group Omzet',
      sponsorBonusRate: 'Sponsor Bonus',
      levelBonusRate: 'Level Bonus',
      achieved: 'Achieved!',
      bonusReceived: 'Bonus received',
      referral: 'referral',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
      copyCode: 'Copy code',
      codeCopied: 'Referral Code Copied!',
      copyFailed: 'Failed to Copy',
      networkUnavailable: 'Network data unavailable',
      omzet: 'Omzet',
    },
    bank: {
      title: 'Bank Accounts',
      addBank: 'Add Account',
      editBank: 'Edit Account',
      bankName: 'Bank Name',
      accountNo: 'Account Number',
      holderName: 'Account Holder',
      primary: 'Primary',
      noBanks: 'No Bank Accounts',
      bankExample: 'e.g. BCA, Mandiri, BNI',
      enterAccountNo: 'Enter account number',
      namePerBook: 'Name as per bank book',
      saveBank: 'Save',
      addBtn: 'Add',
      deleteBank: 'Delete Account?',
      deleteConfirm: 'will be permanently deleted.',
      deleted: 'Account deleted',
      updated: 'Account updated',
      added: 'Account added',
      allFieldsRequired: 'All fields are required',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
    },
    settings: {
      title: 'Settings',
      changeName: 'Change Name',
      changeWhatsapp: 'Change WhatsApp',
      changePassword: 'Change Password',
      saveName: 'Save Name',
      saveWhatsapp: 'Save',
      changePasswordBtn: 'Change Password',
      logoutAccount: 'Logout',
      profileInfo: 'Manage your account and profile',
      whatsapp: 'WhatsApp',
      mainBalance: 'Main Balance',
      totalDeposit: 'Total Deposit',
      totalProfit: 'Total Profit',
      nameRequired: 'Name cannot be empty',
      nameUpdated: 'Name updated successfully',
      whatsappRequired: 'WhatsApp number cannot be empty',
      whatsappUpdated: 'WhatsApp number updated successfully',
      avatarUpdated: 'Avatar updated successfully',
      avatarUploadFailed: 'Failed to upload avatar',
      oldPassword: 'Old Password',
      newPassword: 'New Password',
      confirmPassword: 'Confirm New Password',
      passwordMin6: 'New password must be at least 6 characters',
      passwordMismatch: 'Passwords do not match',
      passwordUpdated: 'Password updated successfully',
      bankAccount: 'Bank Account',
      referral: 'Referral',
      notSet: 'Not set',
      nameEmpty: 'Name cannot be empty',
      loadFailed: 'An error occurred',
    },
    nav: {
      home: 'Home',
      dashboard: 'Dashboard',
      products: 'Products',
      paket: 'Packages',
      assets: 'Assets',
      deposit: 'Deposit',
      withdraw: 'Withdraw',
      history: 'History',
      referral: 'Referral',
      network: 'Network',
      bank: 'Bank',
      settings: 'Settings',
      download: 'Download',
      wallet: 'Wallet',
      profile: 'Profile',
      logout: 'Logout',
      salaryBonus: 'Salary',
      matchingBonus: 'M.Profit',
    },
    landing: {
      welcome: 'Welcome to NEXVO',
      subtitle: '#1 Digital Asset Management Platform',
      aboutTitle: 'About NEXVO',
      aboutSubtitle: 'Digital Investment Platform',
      howItWorks: 'How It Works',
      easySteps: '5 Easy Steps',
      statistics: 'Statistics',
      liveActivity: 'Live Activity',
      testimonials: 'Testimonials',
      startNow: 'Start Now',
      viewProducts: 'View Products',
      security: 'Enterprise-Grade Security',
      dailyProfit: 'Measurable Daily Profit',
      fastTransaction: 'Fast & Easy Transactions',
      globalAccess: '24/7 Global Access',
      trusted: 'Trusted & Transparent',
      cuttingEdge: 'Cutting-Edge Technology',
      registerStep: 'Register Account',
      verifyStep: 'OTP Verification',
      depositStep: 'Deposit Funds',
      selectProduct: 'Select Product',
      monitorProfit: 'Monitor Profit',
      totalMembers: 'Total Members',
      totalTransactions: 'Total Transactions',
      uptime: 'Uptime',
      satisfaction: 'Satisfaction',
      aboutNexvo: 'About NEXVO',
      digitalPlatform: 'Digital Investment Platform',
      trustedWorldwide: 'Trusted Worldwide',
      startInvestNow: 'Start Investing Now',
      viewAllProducts: 'View All Products',
      noProductsAvailable: 'No products available yet',
      recentTransactions: 'Recent Transactions',
      monitorRealTime: 'Monitor the latest activity from all NEXVO users in real-time',
      noRecentActivity: 'No recent activity',
      whatTheySay: 'What They Say',
      realTestimonials: 'Real testimonials from NEXVO users who have experienced the benefits',
      featuredProducts: 'Featured Products',
      choosePackage: 'Choose Investment Package',
      choosePackageDesc: 'Choose a package that suits your capabilities and investment goals',
      minutesToStart: 'Start your digital investment journey in minutes',
      serverUptime: 'Server Uptime',
      onlineSupport: 'Online Support',
      sslEncryption: 'SSL Encryption',
      verificationProcess: 'Verification Process',
      quotaFilled: 'Quota Filled',
      remaining: 'Remaining',
      days: 'Days',
      estProfit: 'Est. profit',
      viewDetail: 'View Detail',
      duration: 'Duration',
    },
    admin: {
      mainGroup: 'Main',
      managementGroup: 'Management',
      transactionGroup: 'Transactions',
      systemGroup: 'System',
      contentGroup: 'Content',
      securityGroup: 'Security',
      otherGroup: 'Other',
      systemOnline: 'System Online',
      adminPanel: 'NEXVO Admin Panel',
      logout: 'Logout',
    },
    otp: {
      title: 'OTP Verification',
      subtitle: 'Enter the OTP code sent to your WhatsApp/Email',
      verifyBtn: 'Verify',
      resendOtp: 'Resend OTP',
      sentTo: 'Code sent to',
    },
    salary: {
      title: 'Weekly Salary',
      subtitle: 'Earn weekly salary by meeting requirements',
      eligibility: 'Eligibility',
      eligible: 'Eligible',
      notEligible: 'Not Eligible',
      directRefs: 'Direct Referrals',
      groupOmzet: 'Group Omzet',
      required: 'Required',
      current: 'Current',
      salaryAmount: 'Salary Amount',
      perWeek: '/week',
      claimSalary: 'Claim Weekly Salary',
      claimSuccess: 'Weekly salary claimed successfully!',
      alreadyClaimed: 'Already claimed this week',
      notEligibleMsg: 'You do not meet the requirements for weekly salary yet',
      salaryHistory: 'Salary History',
      weekNumber: 'Week',
      year: 'Year',
      amount: 'Amount',
      status: 'Status',
      paid: 'Paid',
      noHistory: 'No salary history yet',
      totalEarned: 'Total Salary Earned',
      lastClaimed: 'Last Claimed',
      neverClaimed: 'Never claimed',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
      claiming: 'Claiming...',
    },
    matching: {
      title: 'Matching Profit Bonus',
      subtitle: 'Earn bonuses from your downline profits',
      members: 'members',
      potentialBonus: 'Potential Bonus',
      levelRates: 'Level Rates',
      level: 'Level',
      rate: 'Rate',
      bonus: 'Bonus',
      claimMatching: 'Claim Matching Profit',
      claimSuccess: 'Matching profit bonus claimed successfully!',
      noBonus: 'No matching profit bonus available to claim at this time',
      matchingHistory: 'Matching Profit History',
      noHistory: 'No matching profit history yet',
      totalEarned: 'Total Matching Earned',
      loadFailed: 'Failed to Load Data',
      tryAgain: 'Try Again',
      claiming: 'Claiming...',
      profitOverview: 'Matching Profit Overview',
      profitOverviewDesc: 'Bonuses from profits generated by your downline',
      downlineProfit: 'Downline Profit',
      downlineMembers: 'Downline Members',
      profitDownline: 'Downline Profit',
      totalProfitMatched: 'Total Profit Matched',
    },
  },
  zh: {
    common: {
      loading: '加载中...',
      error: '发生错误',
      success: '成功',
      retry: '重试',
      save: '保存',
      cancel: '取消',
      delete: '删除',
      edit: '编辑',
      add: '添加',
      search: '搜索',
      noData: '暂无数据',
      confirm: '确认',
      back: '返回',
      next: '下一步',
      submit: '提交',
      close: '关闭',
      copy: '复制',
      copied: '已复制',
      share: '分享',
      download: '下载',
      upload: '上传',
      viewAll: '查看全部',
      processing: '处理中...',
      allFieldsRequired: '所有字段均为必填',
      networkError: '网络错误',
      operationFailed: '操作失败',
    },
    auth: {
      login: '登录',
      register: '注册',
      logout: '退出',
      whatsapp: 'WhatsApp',
      email: '邮箱',
      password: '密码',
      oldPassword: '旧密码',
      newPassword: '新密码',
      confirmPassword: '确认密码',
      forgotPassword: '忘记密码',
      noAccount: '还没有账号？',
      hasAccount: '已有账号？',
      loginSuccess: '欢迎回来！',
      registerSuccess: '账号创建成功！欢迎来到 NEXVO。',
      otpVerification: 'OTP 验证',
      enterOtp: '输入 OTP 验证码',
      resendOtp: '重新发送 OTP',
      referralCode: '推荐码',
      referralCodeOptional: '输入推荐码（可选）',
      loginSubtitle: '登录以访问 NEXVO 平台',
      registerSubtitle: '在 NEXVO 平台注册新账号',
      whatsappOrEmail: 'WhatsApp / 邮箱',
      enterWhatsappOrEmail: 'WhatsApp 号码或邮箱',
      enterPassword: '输入密码',
      minChars: '最少 6 个字符',
      passwordMismatch: '密码不匹配',
      passwordNotMatch: '确认密码不匹配',
      registerNow: '立即注册',
      signIn: '登录',
      adminPanel: '管理面板',
      strengthWeak: '弱',
      strengthMedium: '中',
      strengthStrong: '强',
      passwordStrength: '强度',
      haveCode: '有推荐码？',
      hide: '隐藏',
      registering: '注册中...',
      whatsappNumber: 'WhatsApp 号码',
      emailAddress: '邮箱地址',
      validWhatsApp: '请输入有效的 WhatsApp 号码',
      validEmail: '请输入有效的邮箱地址',
    },
    dashboard: {
      title: '仪表盘',
      mainBalance: '主余额',
      profitBalance: '收益余额',
      totalDeposit: '总充值',
      totalWithdraw: '总提现',
      totalProfit: '总收益',
      level: '等级',
      activeAssets: '活跃资产',
      recentActivity: '最近活动',
      memberSince: '加入时间',
      quickNav: '快捷导航',
      noActivity: '暂无活动',
      depositBtn: '充值',
      withdrawBtn: '提现',
      buyProduct: '购买产品',
      investment: '投资',
      bonus: '奖金',
      profit: '收益',
      success: '成功',
      completed: '已完成',
      pending: '待处理',
      failed: '失败',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
      active: '活跃',
      perDay: '/天',
      viewAll: '查看全部',
    },
    products: {
      title: '产品',
      investmentProducts: '投资产品',
      filter: '筛选',
      all: '全部',
      gold: '黄金',
      silver: '白银',
      diamond: '钻石',
      duration: '期限',
      estProfit: '预计收益',
      quota: '配额',
      quotaFilled: '已认购配额',
      remaining: '剩余',
      buyNow: '立即购买',
      viewDetail: '查看详情',
      noProducts: '暂无产品',
      noCategory: '该分类下暂无产品',
      selectProduct: '选择适合您投资目标的产品',
      perDay: ' / 天',
      days: '天',
    },
    paket: {
      title: '套餐',
      investmentPackages: '投资套餐',
      dailyProfit: '每日收益',
      contract: '合约',
      contractDays: '天',
      capitalReturn: '本金返还',
      investNow: '立即投资',
      confirmInvest: '立即投资',
      investSuccess: '投资成功！',
      totalProfit: '总收益',
      bonusStructure: '奖金结构',
      sponsorBonus: '推荐奖金',
      levelBonus: '级差奖金',
      rewardBonus: '奖励奖金',
      solarNetwork: '匹配利润',
      selectPackage: '选择适合您需求的投资套餐',
      confirmInvestTitle: '确认投资',
      balanceDeduct: '将从您的主余额中扣除',
      insufficientBalance: '余额不足，将跳转到充值页面',
      packageLabel: '套餐',
      modal: '本金',
      contractLabel: '合约',
      yourBalance: '您的余额',
      remainingBalance: '剩余余额',
      cancel: '取消',
      depositInvest: '充值并投资',
      investSuccessTitle: '投资成功！',
      investSuccessDesc: '已成功激活',
      viewMyAssets: '查看我的资产',
      noPackages: '暂无可用投资套餐',
      totalProfitDays: '{days}天总收益',
      fromReferral: '来自推荐充值',
      basedOnGroupOmzet: '基于团队业绩',
      basedOnGroupOmzet2: '基于团队业绩',
      networkBonus: '来自下线利润的5级匹配利润奖金体系',
    },
    assets: {
      title: '资产',
      myAssets: '我的资产',
      investNew: '新投资',
      activeAsset: '活跃资产',
      totalCapital: '总本金',
      profitPerDay: '每日收益',
      totalProfit: '总收益',
      modal: '本金',
      contractProgress: '合约进度',
      daysRemaining: '天剩余',
      estimatedReturn: '预计总回报',
      lastProfit: '最近收益',
      statusActive: '活跃',
      statusCompleted: '已完成',
      statusStopped: '已停止',
      statusCancelled: '已取消',
      noAssets: '暂无资产',
      investmentPackage: '投资套餐',
      product: '产品',
      contract: '合约',
      profitRate: '收益率',
      endDate: '到期日',
      daysLeft: '天剩余',
      all: '全部',
      investment: '投资',
      products: '产品',
      viewPackages: '查看投资套餐',
      startInvesting: '开始投资以增加您的资产',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
    },
    deposit: {
      title: '充值',
      topUpBalance: '为您的账户余额充值',
      paymentMethod: '支付方式',
      bankTransfer: '银行转账',
      eWallet: '电子钱包',
      qris: 'QRIS',
      crypto: 'USDT (BEP20)',
      usdt: 'USDT (BEP20)',
      amount: '支付金额',
      minDeposit: '最低充值 100,000 印尼盾',
      uploadProof: '转账凭证（可选）',
      proofOptional: '转账凭证（可选）',
      submitDeposit: '充值',
      depositHistory: '充值记录',
      accountNo: '账号',
      holderName: '账户持有人',
      scanQR: '扫码支付',
      balanceSufficient: '余额充足！',
      payFromBalance: '从余额直接支付',
      productPayment: '产品付款',
      investmentPayment: '投资付款',
      back: '返回',
      totalPayment: '应付总额',
      sufficientBalance: '余额充足！',
      sufficientBalanceDesc: '您的主余额足以支付',
      paymentAmount: '支付金额',
      uploadTransfer: '上传转账凭证',
      maxFileSize: 'PNG, JPG 最大 5MB',
      depositSuccess: '充值已提交，等待管理员确认。',
      depositProductSuccess: '充值已提交，批准后余额可直接用于购买产品。',
      depositInvestSuccess: '充值已提交，批准后余额可直接用于投资。',
      depositPending: '充值已提交，等待管理员确认。',
      minDepositAmount: '最低充值 100,000 印尼盾',
      selectPayment: '请先选择支付方式',
      uploadFailed: '上传转账凭证失败',
      noPaymentMethods: '暂无可用支付方式',
      noDepositHistory: '暂无充值记录',
      uploadProofLabel: '转账凭证（可选）',
      bankAccountNo: '银行账号',
      eWalletAccount: '电子钱包账号',
      atName: '持有人姓名',
      scanQRDesc: '使用您的电子钱包或手机银行应用扫描上方二维码',
      pay: '支付',
      deposit: '充值',
      quantity: '数量',
      contractDays: '合约',
      buyProduct: '购买此产品',
      invest: '投资',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
    },
    withdraw: {
      title: '提现',
      withdrawFunds: '从您的账户提现',
      bankAccount: '收款账户',
      addBank: '添加账户',
      noBankAccount: '暂无银行账户',
      fee: '手续费',
      netAmount: '到账金额',
      minWithdraw: '最低提现',
      outsideHours: '非工作时间',
      workingHours: '提现仅限周一至周五 08:00 - 17:00',
      withdrawHistory: '提现记录',
      selectBank: '选择银行账户',
      withdrawAmount: '提现金额',
      profitBalance: '收益余额',
      amount: '金额',
      adminFee: '手续费',
      received: '到账',
      noBankYet: '暂无银行账户',
      addBankFirst: '请先添加银行账户以进行提现',
      addBankBtn: '添加账户',
      selectBankAccount: '选择银行账户',
      minWithFee: '最低',
      insufficientProfit: '收益余额不足',
      withdrawSuccess: '提现已成功提交',
      noWithdrawHistory: '暂无提现记录',
      weekdaysOnly: '提现仅限周一至周五',
      hoursOnly: '提现仅限 08:00 - 17:00',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
    },
    history: {
      title: '记录',
      transactionHistory: '交易记录',
      all: '全部',
      deposit: '充值',
      withdrawal: '提现',
      purchase: '产品',
      investment: '投资',
      bonus: '奖金',
      profit: '收益',
      noTransactions: '暂无交易记录',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
      product: '产品',
      wd: '提现',
      allActivity: '您的所有财务活动记录',
      success: '成功',
      completed: '已完成',
      pending: '待处理',
      failed: '失败',
      cancelled: '已取消',
      stopped: '已停止',
      buyProduct: '购买产品',
    },
    referral: {
      title: '推荐',
      inviteFriends: '邀请好友获取奖金',
      yourCode: '您的推荐码',
      yourLink: '您的推荐链接',
      copyLink: '复制链接',
      shareVia: '分享',
      totalReferrals: '推荐总数',
      bonusEarned: '已获奖金',
      teamList: '推荐团队',
      level: '等级',
      noTeam: '暂无推荐团队',
      shareCode: '分享您的推荐码开始获取奖金',
      copied: '推荐链接已复制！',
      copyFailed: '复制链接失败',
      directInvite: '直接推荐',
      level1Invite: '一级推荐',
      level2Invite: '二级推荐',
      level3Invite: '三级推荐',
      level4Invite: '四级推荐',
      referralLevel: '推荐奖金等级',
      bonusReferral: '推荐奖金',
      shareViaWhatsApp: 'WhatsApp',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
      oneReferralLimit: '最多1个直接推荐',
      referralSlotUsed: '推荐名额已使用',
      referralSlotAvailable: '推荐名额可用',
    },
    network: {
      title: '网络',
      solarNetwork: '匹配利润',
      groupOmzet: '团队总业绩',
      directReferrals: '直接推荐',
      totalNetwork: '网络总数',
      levelDetail: '各级详情',
      bonusSummary: '奖金概览',
      totalSponsorBonus: '推荐奖金总计',
      totalLevelBonus: '级差奖金总计',
      totalRewardBonus: '奖励奖金总计',
      milestone: '里程碑奖励',
      referralList: '推荐列表',
      networkVisualization: '网络可视化',
      atCenter: '您位于太阳中心',
      totalMembers: '网络成员总数',
      detailPerLevel: '各级详情',
      infoOmzetBonus: '各级网络业绩和奖金信息',
      bonusSummaryDesc: '您从各种来源获得的奖金总额',
      fromInvestmentReferral: '来自推荐投资',
      basedOnOmzet: '基于团队业绩',
      milestoneAchievement: '里程碑成就',
      milestoneDesc: '达成团队业绩目标以获得奖励奖金',
      achieveTarget: '达成团队业绩目标以获得奖励奖金',
      noMilestone: '暂无里程碑数据',
      clickToView: '点击等级查看成员列表',
      noMembers: '您的网络中暂无成员',
      inviteFriendsNow: '立即邀请好友',
      members: '成员',
      omzetGroup: '团队业绩',
      sponsorBonusRate: '推荐奖金',
      levelBonusRate: '级差奖金',
      achieved: '已达成！',
      bonusReceived: '已获奖金',
      referral: '推荐',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
      copyCode: '复制推荐码',
      codeCopied: '推荐码已复制！',
      copyFailed: '复制失败',
      networkUnavailable: '网络数据不可用',
      omzet: '业绩',
    },
    bank: {
      title: '银行账户',
      addBank: '添加账户',
      editBank: '编辑账户',
      bankName: '银行名称',
      accountNo: '账号',
      holderName: '持有人姓名',
      primary: '默认',
      noBanks: '暂无银行账户',
      bankExample: '例如：BCA, Mandiri, BNI',
      enterAccountNo: '输入账号',
      namePerBook: '存折上的姓名',
      saveBank: '保存',
      addBtn: '添加',
      deleteBank: '删除账户？',
      deleteConfirm: '将被永久删除。',
      deleted: '账户已删除',
      updated: '账户已更新',
      added: '账户已添加',
      allFieldsRequired: '所有字段均为必填',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
    },
    settings: {
      title: '设置',
      changeName: '修改姓名',
      changeWhatsapp: '修改 WhatsApp',
      changePassword: '修改密码',
      saveName: '保存姓名',
      saveWhatsapp: '保存',
      changePasswordBtn: '修改密码',
      logoutAccount: '退出账号',
      profileInfo: '管理您的账号和资料',
      whatsapp: 'WhatsApp',
      mainBalance: '主余额',
      totalDeposit: '总充值',
      totalProfit: '总收益',
      nameRequired: '姓名不能为空',
      nameUpdated: '姓名修改成功',
      whatsappRequired: 'WhatsApp 号码不能为空',
      whatsappUpdated: 'WhatsApp 号码修改成功',
      avatarUpdated: '头像修改成功',
      avatarUploadFailed: '头像上传失败',
      oldPassword: '旧密码',
      newPassword: '新密码',
      confirmPassword: '确认新密码',
      passwordMin6: '新密码至少 6 个字符',
      passwordMismatch: '密码不匹配',
      passwordUpdated: '密码修改成功',
      bankAccount: '银行账户',
      referral: '推荐',
      notSet: '未设置',
      nameEmpty: '姓名不能为空',
      loadFailed: '发生错误',
    },
    nav: {
      home: '首页',
      dashboard: '仪表盘',
      products: '产品',
      paket: '套餐',
      assets: '资产',
      deposit: '充值',
      withdraw: '提现',
      history: '记录',
      referral: '推荐',
      network: '网络',
      bank: '银行',
      settings: '设置',
      download: '下载',
      wallet: '钱包',
      profile: '个人资料',
      logout: '退出',
      salaryBonus: '薪资',
      matchingBonus: '对碰利润',
    },
    landing: {
      welcome: '欢迎来到 NEXVO',
      subtitle: '#1 数字资产管理平台',
      aboutTitle: '关于 NEXVO',
      aboutSubtitle: '数字投资平台',
      howItWorks: '运作方式',
      easySteps: '5 个简单步骤',
      statistics: '统计数据',
      liveActivity: '实时活动',
      testimonials: '用户评价',
      startNow: '立即开始',
      viewProducts: '查看产品',
      security: '企业级安全',
      dailyProfit: '可衡量的每日收益',
      fastTransaction: '快速便捷的交易',
      globalAccess: '7×24 小时全球访问',
      trusted: '值得信赖与透明',
      cuttingEdge: '尖端技术',
      registerStep: '注册账号',
      verifyStep: 'OTP 验证',
      depositStep: '充值资金',
      selectProduct: '选择产品',
      monitorProfit: '监控收益',
      totalMembers: '总会员数',
      totalTransactions: '总交易量',
      uptime: '正常运行时间',
      satisfaction: '满意度',
      aboutNexvo: '关于 NEXVO',
      digitalPlatform: '数字投资平台',
      trustedWorldwide: '全球值得信赖',
      startInvestNow: '立即开始投资',
      viewAllProducts: '查看所有产品',
      noProductsAvailable: '暂无可用产品',
      recentTransactions: '最近交易',
      monitorRealTime: '实时监控所有 NEXVO 用户的最新活动',
      noRecentActivity: '暂无最新活动',
      whatTheySay: '用户心声',
      realTestimonials: '来自 NEXVO 用户的真实评价',
      featuredProducts: '精选产品',
      choosePackage: '选择投资套餐',
      choosePackageDesc: '选择适合您能力和投资目标的套餐',
      minutesToStart: '几分钟内开始您的数字投资之旅',
      serverUptime: '服务器正常运行',
      onlineSupport: '在线客服',
      sslEncryption: 'SSL 加密',
      verificationProcess: '验证流程',
      quotaFilled: '已认购配额',
      remaining: '剩余',
      days: '天',
      estProfit: '预计收益',
      viewDetail: '查看详情',
      duration: '期限',
    },
    admin: {
      mainGroup: '主要',
      managementGroup: '管理',
      transactionGroup: '交易',
      systemGroup: '系统',
      contentGroup: '内容',
      securityGroup: '安全',
      otherGroup: '其他',
      systemOnline: '系统在线',
      adminPanel: 'NEXVO 管理面板',
      logout: '退出',
    },
    otp: {
      title: 'OTP 验证',
      subtitle: '输入发送到您 WhatsApp/邮箱的 OTP 验证码',
      verifyBtn: '验证',
      resendOtp: '重新发送 OTP',
      sentTo: '验证码发送至',
    },
    salary: {
      title: '周薪',
      subtitle: '满足条件即可获得周薪',
      eligibility: '资格要求',
      eligible: '符合条件',
      notEligible: '不符合条件',
      directRefs: '直接推荐',
      groupOmzet: '团队业绩',
      required: '要求',
      current: '当前',
      salaryAmount: '工资金额',
      perWeek: '/周',
      claimSalary: '领取周薪',
      claimSuccess: '周薪领取成功！',
      alreadyClaimed: '本周已领取',
      notEligibleMsg: '您尚未满足领取周薪的条件',
      salaryHistory: '薪资记录',
      weekNumber: '周',
      year: '年',
      amount: '金额',
      status: '状态',
      paid: '已支付',
      noHistory: '暂无薪资记录',
      totalEarned: '总薪资收入',
      lastClaimed: '上次领取',
      neverClaimed: '从未领取',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
      claiming: '领取中...',
    },
    matching: {
      title: '对碰利润奖金',
      subtitle: '从下线利润中获得奖金',
      members: '成员',
      potentialBonus: '潜在奖金',
      levelRates: '等级费率',
      level: '等级',
      rate: '费率',
      bonus: '奖金',
      claimMatching: '领取对碰利润奖金',
      claimSuccess: '对碰利润奖金领取成功！',
      noBonus: '当前无可领取的对碰利润奖金',
      matchingHistory: '对碰利润记录',
      noHistory: '暂无对碰利润记录',
      totalEarned: '对碰奖金总收入',
      loadFailed: '加载数据失败',
      tryAgain: '重试',
      claiming: '领取中...',
      profitOverview: '对碰利润概览',
      profitOverviewDesc: '从下线产生的利润中获得奖金',
      downlineProfit: '下线利润',
      downlineMembers: '下线成员',
      profitDownline: '下线利润',
      totalProfitMatched: '总对碰利润',
    },
  },
};

export function t(lang: Language, key: string): string {
  const keys = key.split('.');
  let result: unknown = translations[lang];
  for (const k of keys) {
    result = (result as Record<string, unknown>)?.[k];
  }
  return (typeof result === 'string' ? result : key);
}

export function useT() {
  const { language } = useLangStore();
  return useCallback((key: string) => t(language, key), [language]);
}
