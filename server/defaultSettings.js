const DEFAULT_SETTINGS = {
  league: {
    leagueId: '',
    gameKey: '',
    season: new Date().getFullYear(),
    week: 'current',
    teamNameOverrides: {}
  },
  yahoo: {
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    scope: 'fspt-r'
  },
  espn: {
    leagueId: '',
    season: new Date().getFullYear(),
    week: 'current',
    swid: '',
    espnS2: ''
  },
  sleeper: {
    leagueId: '',
    season: new Date().getFullYear(),
    week: 'current'
  },
  data: {
    provider: 'yahoo',
    refreshIntervalMs: 10000,
    scoreboardPollMs: 10000,
    tdScanIntervalMs: 10000,
    maxRetryDelayMs: 300000,
    retryJitterPct: 0.15,
    tdDedupWindowMs: 90000,
    adaptivePolling: {
      enabled: true,
      liveMs: 10000,
      mixedMs: 20000,
      idleMs: 45000
    },
    scheduleAware: {
      enabled: true,
      timezone: 'America/New_York',
      gameDays: ['thu', 'sun', 'mon'],
      gameWindowStartHour: 9,
      gameWindowEndHour: 24,
      offHoursScoreboardMs: 60000,
      offHoursTdMs: 60000
    },
    safeMode: {
      enabled: true,
      fallbackToMock: true,
      startupForceFallbackIfAuthDown: true
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 4,
      cooldownMs: 60000,
      rateLimitCooldownMs: 120000
    },
    history: {
      enabled: true,
      retentionDays: 14
    },
    rateLimitBudget: {
      enabled: true,
      perHour: 1800,
      warnThresholdPct: 0.8
    },
    useCacheOnFailure: true,
    mockMode: true,
    mockSeed: ''
  },
  overlay: {
    mode: 'carousel',
    rotationIntervalMs: 9000,
    layout: 'full',
    twoMatchupLayout: false,
    scenePreset: 'centered-card',
    showProjections: true,
    showRecords: true,
    showLogos: true,
    showTicker: true,
    showTdAlerts: true,
    tdAlertDurationMs: 8000,
    showScoreDelta: true,
    highlightClosest: true,
    highlightUpset: true,
    autoRedzone: {
      enabled: true,
      lockMs: 25000,
      focusLimit: 3,
      maxScoreDiff: 12
    },
    storyCards: {
      enabled: true,
      interval: 2
    },
    branding: {
      enabled: true,
      leagueTitle: 'Fantasy Football Live',
      watermarkEnabled: true,
      watermarkText: 'Yahoo Fantasy Overlay',
      watermarkLogoUrl: '',
      fontDisplay: 'Rajdhani',
      fontBody: 'Rajdhani'
    },
    gameOfWeekMatchupId: '',
    soundHookUrl: '',
    themePack: 'neon-grid'
  },
  theme: {
    fontScale: 1,
    darkMode: true,
    compact: false,
    primary: '#13f1b7',
    secondary: '#3d5cff',
    background: 'rgba(8, 12, 24, 0.72)',
    text: '#f6f8ff',
    mutedText: '#aab3ca'
  },
  dev: {
    showUpdatedIndicator: true,
    verboseLogs: false
  },
  security: {
    adminApiKey: '',
    overlayApiKey: '',
    reducedAnimations: false,
    useOsKeychain: false
  },
  audio: {
    enabled: false,
    endpointUrl: '',
    minDispatchIntervalMs: 1200,
    maxQueueSize: 50,
    templates: {
      touchdown: 'default-td',
      lead_change: 'default-lead',
      upset: 'default-upset',
      final: 'default-final'
    }
  },
  integrations: {
    enabled: false,
    discordWebhookUrl: '',
    slackWebhookUrl: '',
    sendTouchdowns: true,
    sendLeadChanges: true,
    sendUpsets: true,
    sendFinals: true
  },
  obs: {
    enabled: false,
    wsUrl: 'ws://127.0.0.1:4455',
    password: '',
    sceneCooldownMs: 7000,
    scenes: {
      touchdown: '',
      upset: '',
      gameOfWeek: '',
      default: ''
    }
  }
};

module.exports = {
  DEFAULT_SETTINGS
};
