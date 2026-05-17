/**
 * NEXVO i18n Type Definitions
 * Supports 20 languages for the financial platform
 */

export type LanguageCode =
  | 'id'    // Bahasa Indonesia
  | 'en'    // English
  | 'zh'    // 中文 (Chinese Simplified)
  | 'ja'    // 日本語 (Japanese)
  | 'ko'    // 한국어 (Korean)
  | 'ar'    // العربية (Arabic)
  | 'hi'    // हिन्दी (Hindi)
  | 'th'    // ไทย (Thai)
  | 'vi'    // Tiếng Việt (Vietnamese)
  | 'ms'    // Bahasa Melayu (Malay)
  | 'fil'   // Filipino
  | 'pt'    // Português (Portuguese)
  | 'es'    // Español (Spanish)
  | 'fr'    // Français (French)
  | 'de'    // Deutsch (German)
  | 'ru'    // Русский (Russian)
  | 'tr'    // Türkçe (Turkish)
  | 'it'    // Italiano (Italian)
  | 'nl'    // Nederlands (Dutch)
  | 'uk';   // Українська (Ukrainian)

export interface LanguageOption {
  code: LanguageCode;
  name: string;         // Native name
  englishName: string;  // English name
  flag: string;         // Emoji flag
  dir?: 'ltr' | 'rtl'; // Text direction
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'id', name: 'Bahasa Indonesia', englishName: 'Indonesian', flag: '🇮🇩' },
  { code: 'en', name: 'English', englishName: 'English', flag: '🇬🇧' },
  { code: 'zh', name: '简体中文', englishName: 'Chinese (Simplified)', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', englishName: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', englishName: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'العربية', englishName: 'Arabic', flag: '🇸🇦', dir: 'rtl' },
  { code: 'hi', name: 'हिन्दी', englishName: 'Hindi', flag: '🇮🇳' },
  { code: 'th', name: 'ไทย', englishName: 'Thai', flag: '🇹🇭' },
  { code: 'vi', name: 'Tiếng Việt', englishName: 'Vietnamese', flag: '🇻🇳' },
  { code: 'ms', name: 'Bahasa Melayu', englishName: 'Malay', flag: '🇲🇾' },
  { code: 'fil', name: 'Filipino', englishName: 'Filipino', flag: '🇵🇭' },
  { code: 'pt', name: 'Português', englishName: 'Portuguese', flag: '🇧🇷' },
  { code: 'es', name: 'Español', englishName: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', englishName: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', englishName: 'German', flag: '🇩🇪' },
  { code: 'ru', name: 'Русский', englishName: 'Russian', flag: '🇷🇺' },
  { code: 'tr', name: 'Türkçe', englishName: 'Turkish', flag: '🇹🇷' },
  { code: 'it', name: 'Italiano', englishName: 'Italian', flag: '🇮🇹' },
  { code: 'nl', name: 'Nederlands', englishName: 'Dutch', flag: '🇳🇱' },
  { code: 'uk', name: 'Українська', englishName: 'Ukrainian', flag: '🇺🇦' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'id';

export interface TranslationStrings {
  // ─── Common ───
  common: {
    home: string;
    login: string;
    register: string;
    logout: string;
    settings: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    search: string;
    loading: string;
    processing: string;
    success: string;
    failed: string;
    error: string;
    retry: string;
    back: string;
    next: string;
    close: string;
    confirm: string;
    yes: string;
    no: string;
    all: string;
    active: string;
    inactive: string;
    pending: string;
    approved: string;
    rejected: string;
    noData: string;
    copy: string;
    copied: string;
    language: string;
    version: string;
    change: string;
    memberSince: string;
    perDay: string;
    days: string;
    hours: string;
    fee: string;
    net: string;
    received: string;
    minimal: string;
    notYet: string;
    insufficient: string;
    page: string;
    of: string;
    total: string;
  };
  // ─── Auth ───
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    registerTitle: string;
    registerSubtitle: string;
    whatsappEmail: string;
    password: string;
    enterPassword: string;
    enterWhatsappEmail: string;
    fullName: string;
    email: string;
    whatsapp: string;
    confirmPassword: string;
    referralCode: string;
    forgotPassword: string;
    noAccount: string;
    hasAccount: string;
    registerNow: string;
    loginNow: string;
    adminPanel: string;
    welcomeBack: string;
    networkError: string;
    allFieldsRequired: string;
    otpVerification: string;
    otpSent: string;
    verifyOtp: string;
    resendOtp: string;
    passwordMin6: string;
    passwordNotMatch: string;
    passwordStrength: string;
    strengthWeak: string;
    strengthMedium: string;
    strengthStrong: string;
    enterReferralOptional: string;
    haveCode: string;
    hide: string;
    whatsappValid: string;
    emailValid: string;
    passwordMin: string;
    nameRequired: string;
    whatsappRequired: string;
    avatarMaxSize: string;
    avatarUpdated: string;
    avatarUpdateFailed: string;
    avatarUploadFailed: string;
    nameUpdated: string;
    nameUpdateFailed: string;
    whatsappUpdated: string;
    whatsappUpdateFailed: string;
    passwordUpdated: string;
    passwordUpdateFailed: string;
    oldPassword: string;
    newPassword: string;
    confirmNewPassword: string;
    enterOldPassword: string;
    enterNewPassword: string;
    repeatNewPassword: string;
    changePassword: string;
    saveName: string;
    logoutSuccess: string;
  };
  // ─── OTP Page ───
  otp: {
    backToLogin: string;
    verifyWhatsappEmail: string;
    verified: string;
    notVerified: string;
    enter6DigitOtp: string;
    verify: string;
    resendIn: string;
    resendCode: string;
    whatsappVerified: string;
    allVerified: string;
    redirectingToLogin: string;
    goToLogin: string;
    allVerificationComplete: string;
    pleaseLogin: string;
    otpCodeWrong: string;
    whatsappVerifySuccess: string;
    emailVerifySuccess: string;
    newOtpSentToWhatsapp: string;
    newOtpSentToEmail: string;
    resendFailed: string;
  };
  // ─── Navigation ───
  nav: {
    home: string;
    dashboard: string;
    products: string;
    packages: string;
    assets: string;
    deposit: string;
    withdraw: string;
    history: string;
    referral: string;
    network: string;
    bank: string;
    download: string;
    about: string;
    howItWorks: string;
    testimonials: string;
    liveActivity: string;
    profile: string;
    wallet: string;
    profit: string;
    live: string;
    paket: string;
    salaryBonus: string;
    matchingBonus: string;
    settings: string;
    logout: string;
  };
  // ─── Admin Navigation ───
  adminNav: {
    main: string;
    management: string;
    transactions: string;
    system: string;
    content: string;
    security: string;
    dashboard: string;
    users: string;
    products: string;
    packages: string;
    salary: string;
    deposits: string;
    withdrawals: string;
    asset: string;
    payment: string;
    app: string;
    appearance: string;
    banners: string;
    settings: string;
    apiKeys: string;
    live: string;
    systemOnline: string;
    panelAdmin: string;
  };
  // ─── Home Page ───
  home: {
    heroWelcome: string;
    heroSubtitle: string;
    heroDescription: string;
    heroCta: string;
    viewProducts: string;
    aboutNexvo: string;
    investmentPlatform: string;
    trustedInIndonesia: string;
    totalMembers: string;
    totalTransactions: string;
    uptime: string;
    satisfaction: string;
    howItWorks: string;
    easySteps: string;
    stepRegister: string;
    stepRegisterDesc: string;
    stepOtp: string;
    stepOtpDesc: string;
    stepDeposit: string;
    stepDepositDesc: string;
    stepChooseProduct: string;
    stepChooseProductDesc: string;
    stepMonitorProfit: string;
    stepMonitorProfitDesc: string;
    startInvesting: string;
    featuredProducts: string;
    choosePackage: string;
    choosePackageDesc: string;
    viewAllProducts: string;
    noProducts: string;
    liveActivity: string;
    recentTransactions: string;
    recentTransactionsDesc: string;
    noRecentActivity: string;
    testimonials: string;
    whatTheySay: string;
    whatTheySayDesc: string;
    highSecurity: string;
    highSecurityDesc: string;
    dailyProfit: string;
    dailyProfitDesc: string;
    fastTransaction: string;
    fastTransactionDesc: string;
    globalAccess: string;
    globalAccessDesc: string;
    trustedTransparent: string;
    trustedTransparentDesc: string;
    cuttingEdgeTech: string;
    cuttingEdgeTechDesc: string;
    serverUptime: string;
    supportOnline: string;
    sslEncryption: string;
    verificationProcess: string;
    estProfit: string;
    duration: string;
    days: string;
    quotaFilled: string;
    remaining: string;
    viewDetail: string;
    navigation: string;
    services: string;
    contact: string;
    assetManagement: string;
    commodityInvestment: string;
    dailyProfitShort: string;
    referralProgram: string;
    madeIn: string;
    allRightsReserved: string;
    narrativeP1: string;
    narrativeP2Before: string;
    narrativeP2Highlight: string;
    narrativeP2After: string;
    narrativeP3Before: string;
    narrativeP3After: string;
    narrativeP4Before: string;
    narrativeP4Highlight: string;
    investMinutes: string;
    memberNexvo: string;
    joinNow: string;
    ctaDescription: string;
    registerFree: string;
    alreadyHaveAccount: string;
    safeTrusted: string;
    support247: string;
  };
  // ─── Deposit Page ───
  deposit: {
    title: string;
    subtitle: string;
    paymentMethod: string;
    paymentAmount: string;
    minimum: string;
    importantInfo: string;
    depositHistory: string;
    noHistory: string;
    depositSuccess: string;
    depositId: string;
    processingHours: string;
    needHelp: string;
    needHelpDesc: string;
    screenshotProof: string;
    selectPaymentFirst: string;
    minDeposit: string;
    scanQr: string;
    usdtAddress: string;
    usdtWarning: string;
    usdtWarningDesc: string;
    important: string;
    depositInfo1: string;
    depositInfo2: string;
    depositInfo3: string;
    depositInfo4: string;
    payDirectly: string;
    balanceSufficient: string;
    balanceSufficientDesc: string;
    productPayment: string;
    investmentPayment: string;
    totalPayment: string;
    contract: string;
    quantity: string;
    failedToLoad: string;
    paymentNotAvailable: string;
    pay: string;
    copiedToClipboard: string;
    copyFailed: string;
    depositProcessAbout: string;
    depositUniqueId: string;
    depositNotYet: string;
    depositMustContact: string;
    depositAndTransferMatch: string;
    paymentFor: string;
    investmentPackage: string;
    product: string;
    afterApprovedCanUse: string;
    afterApprovedCanInvest: string;
    processAbout: string;
  };
  // ─── Packages Page ───
  packages: {
    title: string;
    subtitle: string;
    dailyProfitLabel: string;
    contract: string;
    capitalReturn: string;
    totalProfit: string;
    investNow: string;
    selectDuration: string;
    todayRate: string;
    canChangeTomorrow: string;
    autoProfit: string;
    autoProfitActive: string;
    solarNetwork: string;
    solarNetworkDesc: string;
    bonusStructure: string;
    bonusStructureDesc: string;
    sponsorBonus: string;
    sponsorBonusDesc: string;
    levelBonus: string;
    levelBonusDesc: string;
    rewardBonus: string;
    rewardBonusDesc: string;
    confirmInvestment: string;
    balanceWillDeduct: string;
    balanceInsufficient: string;
    modal: string;
    profitRate: string;
    yourBalance: string;
    remainingBalance: string;
    depositAndInvest: string;
    investmentSuccess: string;
    investmentSuccessDesc: string;
    noPackages: string;
    level: string;
  };
  // ─── Dashboard ───
  dashboard: {
    mainBalance: string;
    profitBalance: string;
    totalInvestment: string;
    totalProfit: string;
    activeAssets: string;
    referralCount: string;
    recentActivity: string;
    quickActions: string;
    topUp: string;
    invest: string;
    refer: string;
    totalDeposit: string;
    totalWithdraw: string;
    level: string;
    viewAll: string;
    noActivity: string;
    failedToLoad: string;
    tryAgain: string;
    productPurchased: string;
    investmentLabel: string;
    bonusLabel: string;
    matchingLabel: string;
    profitLabel: string;
    salaryLabel: string;
  };
  // ─── Withdraw ───
  withdraw: {
    title: string;
    subtitle: string;
    amount: string;
    bankAccount: string;
    withdrawHistory: string;
    noHistory: string;
    minWithdraw: string;
    processingTime: string;
    selectBankAccount: string;
    destinationAccount: string;
    chooseBank: string;
    bank: string;
    accountNo: string;
    holderName: string;
    withdrawAmount: string;
    profitBalance: string;
    adminFee: string;
    estimatedProcess: string;
    withdrawProcessInfo: string;
    withdrawNotYet: string;
    contactAdminWithdraw: string;
    withdrawWeekdayOnly: string;
    withdrawHoursOnly: string;
    outsideWorkingHours: string;
    noBankAccount: string;
    addBankFirst: string;
    addBankAccount: string;
    withdrawSubmitted: string;
    withdrawFailed: string;
    profitInsufficient: string;
  };
  // ─── Asset Page ───
  assets: {
    title: string;
    subtitle: string;
    activeAssets: string;
    completedAssets: string;
    dailyProfit: string;
    totalReturn: string;
    remainingDays: string;
    contractEnd: string;
    noAssets: string;
    totalModal: string;
    profitPerDay: string;
    totalProfitEarned: string;
    investNew: string;
    allAssets: string;
    investment: string;
    product: string;
    noAssetsYet: string;
    startInvesting: string;
    viewPackages: string;
    modal: string;
    duration: string;
    profitRate: string;
    completed: string;
    contractProgress: string;
    daysRemaining: string;
    estimatedTotalReturn: string;
    lastProfit: string;
    stopped: string;
    cancelled: string;
    failedToLoad: string;
    tryAgain: string;
  };
  // ─── History Page ───
  history: {
    title: string;
    subtitle: string;
    all: string;
    deposits: string;
    withdrawals: string;
    investments: string;
    bonuses: string;
    noHistory: string;
    transactionHistory: string;
    financialActivity: string;
    failedToLoad: string;
    tryAgain: string;
    noTransactions: string;
    wd: string;
    productLabel: string;
    investmentLabel: string;
    bonusLabel: string;
    matchingLabel: string;
    profitLabel: string;
    salaryLabel: string;
    processed: string;
    stopped: string;
  };
  // ─── Network / Referral ───
  networkPage: {
    title: string;
    subtitle: string;
    myReferralCode: string;
    shareReferral: string;
    totalReferrals: string;
    totalBonus: string;
    downlines: string;
    level: string;
    yourReferralLink: string;
    copyLink: string;
    share: string;
    bonusReferral: string;
    bonusMatching: string;
    bonusSalary: string;
    referralLevel: string;
    directInvite: string;
    inviteFromL1: string;
    inviteFromL2: string;
    inviteFromL3: string;
    inviteFromL4: string;
    matchingProfitL1: string;
    matchingProfitL2: string;
    matchingProfitL3: string;
    matchingProfitL4: string;
    matchingProfitL5: string;
    matchingBonusProfit: string;
    matchingBonusDesc: string;
    weeklySalaryBonus: string;
    weeklySalaryDesc: string;
    directReferrals10: string;
    member: string;
    missing: string;
    minOmzet1M: string;
    weeklySalary: string;
    omzetMin25: string;
    eligibleForSalary: string;
    meetRequirements: string;
    totalSalaryReceived: string;
    referralTeam: string;
    noTeam: string;
    shareCodeForBonus: string;
    failedToLoad: string;
    tryAgain: string;
    linkCopied: string;
    copyFailed: string;
    shareText: string;
  };
  // ─── Settings ───
  settingsPage: {
    title: string;
    subtitle: string;
    profile: string;
    changePassword: string;
    bankInfo: string;
    notification: string;
    languageSettings: string;
    selectLanguage: string;
    languageChanged: string;
    changeName: string;
    changeWhatsapp: string;
    saveName: string;
    notSet: string;
    bankAccount: string;
    logoutAccount: string;
    whatsapp: string;
    mainBalance: string;
    totalDeposit: string;
    totalProfit: string;
    nameUpdated: string;
    whatsappUpdated: string;
    passwordUpdated: string;
    nameEmpty: string;
    whatsappEmpty: string;
    allFieldsRequired: string;
    newPasswordMin6: string;
    confirmPasswordMismatch: string;
  };
  // ─── AI Chat ───
  aiChat: {
    assistantName: string;
    assistantStatus: string;
    placeholder: string;
    greeting: string;
    errorResponse: string;
    connectionError: string;
  };
  // ─── Statuses ───
  status: {
    success: string;
    pending: string;
    processing: string;
    failed: string;
    rejected: string;
    approved: string;
    expired: string;
    active: string;
    completed: string;
    cancelled: string;
    stopped: string;
  };
  // ─── Admin Common ───
  admin: {
    manageAssets: string;
    manageProducts: string;
    managePackages: string;
    manageUsers: string;
    manageDeposits: string;
    manageWithdrawals: string;
    managePayment: string;
    manageApp: string;
    manageBanners: string;
    manageSettings: string;
    manageApiKeys: string;
    manageLive: string;
    manageAppearance: string;
    manageSalary: string;
    totalAssets: string;
    totalValue: string;
    totalProfit: string;
    activeAssets: string;
    searchUserProduct: string;
    registeredCount: string;
    addProfit: string;
    stopAsset: string;
    completeAsset: string;
    activateAsset: string;
    addNew: string;
    updateInfo: string;
    fillDetails: string;
    amountInvalid: string;
    profitAdded: string;
    assetStopped: string;
    assetCompleted: string;
    assetActivated: string;
    saveFailed: string;
    deleteFailed: string;
    updateFailed: string;
    createFailed: string;
    loadFailed: string;
    networkError: string;
    allFieldsRequired: string;
    completeAllFields: string;
    confirmDelete: string;
    cannotUndo: string;
    activeInvestmentsExist: string;
    registered: string;
    noDataFound: string;
    statusLabel: string;
    actionLabel: string;
    userLabel: string;
    productLabel: string;
    quantityLabel: string;
    totalPriceLabel: string;
    profitLabel: string;
    dateLabel: string;
    nameLabel: string;
    emailLabel: string;
    whatsappLabel: string;
    levelLabel: string;
    amountLabel: string;
    balanceLabel: string;
    descriptionLabel: string;
    orderLabel: string;
    imageLabel: string;
    bannerLabel: string;
    activeLabel: string;
    inactiveLabel: string;
    filterAll: string;
    filterActive: string;
    filterInactive: string;
    filterCompleted: string;
    filterStopped: string;
    filterPending: string;
    filterApproved: string;
    filterRejected: string;
    filterSuspended: string;
    quickSelect: string;
    previewLabel: string;
    yesDelete: string;
    noCancel: string;
  };
  // ─── Admin Dashboard ───
  adminDashboard: {
    title: string;
    subtitle: string;
    totalUsers: string;
    activeUsers: string;
    totalDeposits: string;
    totalWithdrawals: string;
    pendingDeposits: string;
    pendingWithdrawals: string;
    totalInvestments: string;
    activeInvestments: string;
    totalProfit: string;
    totalOmzet: string;
    recentActivities: string;
    systemHealth: string;
    uptimeLabel: string;
    dbStatus: string;
    apiStatus: string;
    onlineUsers: string;
    newUsersToday: string;
    depositsToday: string;
    withdrawalsToday: string;
  };
  // ─── Admin Users ───
  adminUsers: {
    title: string;
    subtitle: string;
    searchUser: string;
    addUser: string;
    editUser: string;
    deleteUser: string;
    suspendUser: string;
    activateUser: string;
    totalUsers: string;
    activeUsersLabel: string;
    suspendedUsers: string;
    userDetails: string;
    nameRequired: string;
    whatsappRequired: string;
    emailRequired: string;
    passwordMin: string;
    userCreated: string;
    userUpdated: string;
    userDeleted: string;
    userSuspended: string;
    userActivated: string;
    cannotDeleteSelf: string;
    confirmDeleteUser: string;
    deleteUserWarning: string;
  };
  // ─── Admin Deposits ───
  adminDeposits: {
    title: string;
    subtitle: string;
    approveDeposit: string;
    rejectDeposit: string;
    processDeposit: string;
    depositAmount: string;
    paymentMethod: string;
    depositId: string;
    userDeposited: string;
    approvedBy: string;
    rejectedBy: string;
    noPendingDeposits: string;
    depositApproved: string;
    depositRejected: string;
    depositProcessed: string;
    confirmApprove: string;
    confirmReject: string;
    rejectReason: string;
  };
  // ─── Admin Withdrawals ───
  adminWithdrawals: {
    title: string;
    subtitle: string;
    approveWithdrawal: string;
    rejectWithdrawal: string;
    processWithdrawal: string;
    withdrawalAmount: string;
    bankAccount: string;
    accountHolder: string;
    adminFee: string;
    netAmount: string;
    noPendingWithdrawals: string;
    withdrawalApproved: string;
    withdrawalRejected: string;
    withdrawalProcessed: string;
    confirmApprove: string;
    confirmReject: string;
    rejectReason: string;
  };
  // ─── Admin Asset ───
  adminAsset: {
    title: string;
    subtitle: string;
    assetType: string;
    investmentType: string;
    productType: string;
    addProfitManually: string;
    enterProfitAmount: string;
    profitAmount: string;
    stopAssetConfirm: string;
    completeAssetConfirm: string;
    activateAssetConfirm: string;
    noAssetsFound: string;
    profitAddedSuccess: string;
    assetStoppedSuccess: string;
    assetCompletedSuccess: string;
    assetActivatedSuccess: string;
  };
  // ─── Admin Products ───
  adminProducts: {
    title: string;
    subtitle: string;
    addProduct: string;
    editProduct: string;
    newProduct: string;
    updateProductInfo: string;
    fillNewProduct: string;
    productName: string;
    price: string;
    duration: string;
    estProfit: string;
    profitRate: string;
    quota: string;
    description: string;
    productBanner: string;
    productActive: string;
    noProductsYet: string;
    addProductCta: string;
    productUpdated: string;
    productCreated: string;
    productDeleted: string;
    confirmDeleteProduct: string;
    deleteProductWarning: string;
    imageUploaded: string;
    imageUploadFailed: string;
  };
  // ─── Admin Packages ───
  adminPackages: {
    title: string;
    subtitle: string;
    addPackage: string;
    editPackage: string;
    newPackage: string;
    updatePackageInfo: string;
    fillNewPackage: string;
    packageName: string;
    capitalAmount: string;
    currentRate: string;
    minRate: string;
    maxRate: string;
    defaultContractDays: string;
    displayOrder: string;
    autoCreateDuration: string;
    packageActive: string;
    autoProfitEnabled: string;
    autoProfitLabel: string;
    profitPerDay: string;
    defaultLabel: string;
    investmentLabel: string;
    durationLabel: string;
    previewProfit: string;
    dailyProfitPreview: string;
    minMaxProfit: string;
    editDuration: string;
    addDuration: string;
    durationDays: string;
    durationLabelName: string;
    profitRatePerDay: string;
    quickSelectLabel: string;
    profitRateHistory: string;
    rateChangeLast30Days: string;
    noRateHistory: string;
    confirmDeletePackage: string;
    activeInvestmentsWarning: string;
    rateUpdated: string;
    packageUpdated: string;
    packageCreated: string;
    packageDeleted: string;
    durationAdded: string;
    durationUpdated: string;
    durationDeleted: string;
    autoUpdateRate: string;
    packageDeactivated: string;
    packageActivated: string;
    autoProfitDisabled: string;
    autoProfitEnabledToast: string;
    autoUpdateSuccess: string;
    durationDeactivated: string;
    noPackagesYet: string;
    addPackageCta: string;
    selectDurationDesc: string;
    autoCreateDurationDesc: string;
    rateWillChangeAuto: string;
    willChangeAuto: string;
    deactivateLabel: string;
    activateLabel: string;
    totalProfitLabel: string;
    minProfitPerDay: string;
    maxProfitPerDay: string;
    autoChangeInfo: string;
  };
  // ─── Admin Payment ───
  adminPayment: {
    title: string;
    subtitle: string;
    addPayment: string;
    editPayment: string;
    paymentType: string;
    bankType: string;
    ewalletType: string;
    qrisType: string;
    bankName: string;
    accountNo: string;
    holderName: string;
    qrImage: string;
    paymentActive: string;
    noPaymentMethods: string;
    paymentCreated: string;
    paymentUpdated: string;
    paymentDeleted: string;
    confirmDeletePayment: string;
  };
  // ─── Admin App ───
  adminApp: {
    title: string;
    subtitle: string;
    appName: string;
    appVersion: string;
    appDescription: string;
    maintenanceMode: string;
    forceUpdate: string;
    apkFile: string;
    uploadApk: string;
    currentApk: string;
    noApkFile: string;
    appSettingsSaved: string;
    apkUploaded: string;
  };
  // ─── Admin Banners ───
  adminBanners: {
    title: string;
    subtitle: string;
    addBanner: string;
    editBanner: string;
    bannerTitle: string;
    bannerSubtitle: string;
    bannerImage: string;
    ctaText: string;
    bannerOrder: string;
    bannerActive: string;
    noBanners: string;
    bannerCreated: string;
    bannerUpdated: string;
    bannerDeleted: string;
    confirmDeleteBanner: string;
    imageRequired: string;
  };
  // ─── Admin Settings ───
  adminSettings: {
    title: string;
    subtitle: string;
    systemSettings: string;
    smtpSettings: string;
    emailHost: string;
    emailPort: string;
    emailUser: string;
    emailPassword: string;
    emailFrom: string;
    testEmail: string;
    testSmtp: string;
    emailSent: string;
    emailFailed: string;
    settingsSaved: string;
    smtpConfig: string;
  };
  // ─── Admin API Keys ───
  adminApiKeys: {
    title: string;
    subtitle: string;
    addApiKey: string;
    keyName: string;
    apiKey: string;
    keyPrefix: string;
    lastUsed: string;
    createdAt: string;
    noApiKeys: string;
    keyCreated: string;
    keyDeleted: string;
    confirmDeleteKey: string;
    copyKey: string;
    keyCopied: string;
    showKey: string;
    hideKey: string;
    keyWarning: string;
  };
  // ─── Admin Live ───
  adminLive: {
    title: string;
    subtitle: string;
    addActivity: string;
    activityType: string;
    userName: string;
    amountLabel: string;
    isFake: string;
    liveActive: string;
    noActivities: string;
    activityCreated: string;
    activityUpdated: string;
    activityDeleted: string;
    confirmDeleteActivity: string;
  };
  // ─── Admin Appearance ───
  adminAppearance: {
    title: string;
    subtitle: string;
    logoUpload: string;
    faviconUpload: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    darkMode: string;
    lightMode: string;
    customCss: string;
    appearanceSaved: string;
    logoUploaded: string;
    faviconUploaded: string;
  };
  // ─── Admin Salary ───
  adminSalary: {
    title: string;
    subtitle: string;
    weekNumber: string;
    directReferrals: string;
    omzetAmount: string;
    salaryAmount: string;
    salaryStatus: string;
    paidLabel: string;
    unpaidLabel: string;
    noSalaryRecords: string;
    markAsPaid: string;
    salaryMarkedPaid: string;
    salarySettings: string;
    minDirectReferrals: string;
    minOmzet: string;
    salaryAmountSetting: string;
    salarySettingsSaved: string;
  };
  // ─── Admin Login ───
  adminLogin: {
    title: string;
    subtitle: string;
    secureLogin: string;
    encryptedConnection: string;
    identityStep: string;
    verificationStep: string;
    authorizationStep: string;
    verifyingCredentials: string;
    validatingIdentity: string;
    verifyingPassword: string;
    checkingAuthorization: string;
    superAdmin: string;
    usernameEmail: string;
    enterUsernameEmail: string;
    defaultUsernameHint: string;
    enterPassword: string;
    passwordHint: string;
    passwordStrength: string;
    strengthWeak: string;
    strengthFair: string;
    strengthStrong: string;
    strengthVeryStrong: string;
    strengthMaximum: string;
    charsLabel: string;
    accountLocked: string;
    securityWarning: string;
    attemptsRemaining: string;
    waitBeforeRetry: string;
    sslTls: string;
    antiBrute: string;
    monitoring: string;
    restrictedArea: string;
    accessLogged: string;
    orLabel: string;
    loginAsUser: string;
    accessAuthorized: string;
    welcomeAdmin: string;
    accessDenied: string;
    securityScore: string;
    loginToAdminPanel: string;
    loadingSecurityInfo: string;
    encrypted: string;
    digitalAssetManagement: string;
    usernamePasswordRequired: string;
    waitSeconds: string;
    securityNotice: string;
  };
  // ─── Products Page (User) ───
  productsPage: {
    title: string;
    subtitle: string;
    filterAll: string;
    filterGold: string;
    filterSilver: string;
    filterDiamond: string;
    durationLabel: string;
    estProfitLabel: string;
    quotaFilled: string;
    remaining: string;
    buyNow: string;
    noProducts: string;
    noProductsInCategory: string;
    noProductsAvailable: string;
  };
  // ─── Product Detail (User) ───
  productDetail: {
    notFound: string;
    loadFailed: string;
    notFoundTitle: string;
    notFoundDesc: string;
    backToProducts: string;
    backLabel: string;
    durationDays: string;
    estProfit: string;
    profitRate: string;
    quotaRemaining: string;
    quotaFilled: string;
    filledLabel: string;
    totalLabel: string;
    productDescription: string;
    noDescription: string;
    purchaseQuantity: string;
    totalPrice: string;
    totalEstProfit: string;
    yourBalance: string;
    balanceInsufficient: string;
    quotaExhausted: string;
    buyNow: string;
    depositAndBuy: string;
    balanceDeductInfo: string;
    redirectToDeposit: string;
    confirmPurchase: string;
    balanceDeductConfirm: string;
    insufficientBalance: string;
    productLabel: string;
    quantityLabel: string;
    unitPrice: string;
    totalLabel2: string;
    balanceAfterPurchase: string;
    confirmBuy: string;
    depositNow: string;
    processing: string;
    purchaseSuccess: string;
    viewHistory: string;
    totalPayment: string;
  };
  // ─── Bank Page (User) ───
  bankPage: {
    title: string;
    subtitle: string;
    addBank: string;
    primaryLabel: string;
    noBankAccount: string;
    addBankCta: string;
    editAccount: string;
    addAccount: string;
    updateInfo: string;
    enterNewInfo: string;
    bankName: string;
    bankNamePlaceholder: string;
    accountNo: string;
    accountNoPlaceholder: string;
    holderName: string;
    holderNamePlaceholder: string;
    deleteConfirm: string;
    deleteWarning: string;
    bankUpdated: string;
    bankAdded: string;
    bankDeleted: string;
    deleteFailed: string;
    allFieldsRequired: string;
  };
  // ─── Download Page ───
  downloadPage: {
    title: string;
    subtitle: string;
    secure: string;
    secureDesc: string;
    fast: string;
    fastDesc: string;
    realtime: string;
    realtimeDesc: string;
    mobileFirst: string;
    mobileFirstDesc: string;
    featuredTitle: string;
    installSteps: string;
    installStep1: string;
    installStep2: string;
    installStep3: string;
    installStep4: string;
    installStep5: string;
    requirements: string;
    reqAndroid: string;
    reqRam: string;
    reqStorage: string;
    reqInternet: string;
    downloadApk: string;
    compatibleWith: string;
  };
  // ─── Language Switcher ───
  langSwitcher: {
    searchPlaceholder: string;
    noLanguagesFound: string;
    languagesAvailable: string;
  };
}

/**
 * Helper type to get nested key paths for type-safe translation access
 */
export type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<TranslationStrings>;
