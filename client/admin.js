const $ = (id) => document.getElementById(id);

const ADMIN_KEY_STORAGE = 'obs_overlay_admin_key';

const THEME_PACKS = {
  'neon-grid': {
    overlay: {
      scenePreset: 'centered-card',
      themePack: 'neon-grid'
    },
    theme: {
      primary: '#13f1b7',
      secondary: '#3d5cff',
      background: 'rgba(8, 12, 24, 0.72)',
      text: '#f6f8ff',
      mutedText: '#aab3ca'
    }
  },
  'classic-gold': {
    overlay: {
      scenePreset: 'lower-third',
      themePack: 'classic-gold'
    },
    theme: {
      primary: '#f3b341',
      secondary: '#cb8e2b',
      background: 'rgba(27, 19, 6, 0.82)',
      text: '#fff2d2',
      mutedText: '#d2bf95'
    }
  },
  'ice-night': {
    overlay: {
      scenePreset: 'sidebar-widget',
      themePack: 'ice-night'
    },
    theme: {
      primary: '#6dd9ff',
      secondary: '#8f9dff',
      background: 'rgba(10, 18, 34, 0.8)',
      text: '#eef6ff',
      mutedText: '#9eb5cb'
    }
  }
};

const SCENE_SETUP_PRESETS = [
  {
    id: 'centered-card',
    label: 'Main Matchup - Centered Card',
    route: '/overlay/centered-card',
    purpose: 'Primary head-to-head coverage',
    placement: 'Center screen',
    size: '1920x1080',
    notes: 'Best for full-screen matchup reads and rotation focus.'
  },
  {
    id: 'lower-third',
    label: 'Scoreboard - Lower Third',
    route: '/overlay/lower-third',
    purpose: 'In-game score strip',
    placement: 'Bottom third',
    size: '1920x420',
    notes: 'Ideal while showing gameplay or host camera above.'
  },
  {
    id: 'sidebar-widget',
    label: 'Sidebar - Two Up Ready',
    route: '/overlay/sidebar-widget',
    purpose: 'Persistent side panel',
    placement: 'Right side',
    size: '640x1080',
    notes: 'Use with two-up mode when comparing two matchups.'
  },
  {
    id: 'bottom-ticker',
    label: 'Ticker Bar - Footer',
    route: '/overlay/bottom-ticker',
    purpose: 'Continuous matchup crawl',
    placement: 'Bottom edge',
    size: '1920x220',
    notes: 'Great for always-on context with minimal screen usage.'
  },
  {
    id: 'ticker',
    label: 'Ticker-Only Mode',
    route: '/overlay/ticker',
    purpose: 'Dedicated horizontal ticker scene',
    placement: 'Bottom edge',
    size: '1920x140',
    notes: 'Use between segments or for pregame waiting scenes.'
  }
];

const state = {
  settings: null,
  status: null,
  auth: null,
  profiles: [],
  activeProfileId: null,
  focusTeamChoices: [],
  diagnostics: null,
  diagnosticsTimer: null,
  statusTimer: null
};

function bool(input) {
  return Boolean(input?.checked);
}

function numberValue(input, fallback = null) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function getAdminKey() {
  return ($('adminApiKeyInput')?.value || localStorage.getItem(ADMIN_KEY_STORAGE) || '').trim();
}

function withAdminHeaders(headers = {}) {
  const key = getAdminKey();
  if (!key) {
    return headers;
  }

  return {
    ...headers,
    'x-admin-key': key
  };
}

function getOverlayReadKey() {
  const raw = ($('overlayApiKeyInput')?.value || '').trim();
  if (raw === '********') {
    return '';
  }
  return raw;
}

function appendOverlayKey(url) {
  const key = getOverlayReadKey();
  if (!key) {
    return url;
  }

  const hasQuery = url.includes('?');
  return `${url}${hasQuery ? '&' : '?'}overlayKey=${encodeURIComponent(key)}`;
}

function setPill(id, label, ok) {
  const node = $(id);
  node.textContent = label;
  node.classList.remove('good', 'bad');
  node.classList.add(ok ? 'good' : 'bad');
}

function updateStatusLine() {
  const statusLine = $('statusLine');
  const banner = $('degradedBanner');

  if (!state.status) {
    statusLine.textContent = 'Status unavailable.';
    banner.classList.add('hidden');
    return;
  }

  const last = state.status.lastSuccessAt
    ? new Date(state.status.lastSuccessAt).toLocaleString()
    : 'never';

  if (state.status.lastError) {
    statusLine.textContent = `Last sync failed at ${new Date(state.status.lastError.at).toLocaleTimeString()} (${state.status.lastError.phase || 'unknown'}): ${state.status.lastError.message}`;
  } else {
    statusLine.textContent = `Running in ${state.status.mode || 'unknown'} mode. Last successful sync: ${last}.`;
  }

  if (state.status.degradedMode) {
    const circuit = state.status.circuitOpenUntil
      ? ` Circuit open until ${new Date(state.status.circuitOpenUntil).toLocaleTimeString()} (${state.status.circuitReason || 'unknown reason'}).`
      : '';
    banner.textContent = `Degraded Mode Active: scoreboard failures ${state.status.scoreboardFailureCount}, TD failures ${state.status.tdFailureCount}.${circuit}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function applyThemePreview() {
  const preview = $('themePreview');
  const card = preview.querySelector('.preview-card');

  card.style.background = $('bgColor').value || 'rgba(8, 12, 24, 0.72)';
  card.style.color = $('textColor').value;
  card.style.borderColor = `${$('secondaryColor').value}80`;

  preview.style.setProperty('--accent', $('primaryColor').value);
  preview.style.setProperty('--accent-2', $('secondaryColor').value);
}

function setScopedWeekMode(modeInputId, weekInputId, mode, weekNumber, fallbackWeek = 1) {
  const modeNode = $(modeInputId);
  const weekNode = $(weekInputId);
  if (!modeNode || !weekNode) {
    return;
  }

  modeNode.value = mode;
  weekNode.disabled = mode === 'current';
  if (mode === 'current') {
    weekNode.value = Number.isFinite(weekNumber) ? String(weekNumber) : String(fallbackWeek);
  }
}

function setWeekMode(mode, weekNumber) {
  setScopedWeekMode('weekMode', 'weekNumber', mode, weekNumber, 1);
}

function normalizeLookup(value) {
  return String(value || '').trim().toLowerCase();
}

function extractFocusTeamsFromPayload(payload) {
  const byKey = new Map();
  const matchups = payload?.matchups || [];

  for (const matchup of matchups) {
    for (const team of [matchup?.teamA, matchup?.teamB]) {
      const key = String(team?.key || '').trim();
      if (!key || byKey.has(key)) {
        continue;
      }
      byKey.set(key, {
        key,
        name: String(team?.name || key).trim(),
        manager: String(team?.manager || '').trim()
      });
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderFocusTeamSuggestions(choices, selectedValue = '') {
  const datalist = $('focusTeamList');
  datalist.innerHTML = '';

  for (const choice of choices) {
    const option = document.createElement('option');
    option.value = choice.key;
    const detail = [choice.name, choice.manager].filter(Boolean).join(' - ');
    option.label = detail || choice.key;
    datalist.appendChild(option);
  }

  const normalizedSelected = normalizeLookup(selectedValue);
  const known = choices.some((choice) => (
    normalizeLookup(choice.key) === normalizedSelected
    || normalizeLookup(choice.name) === normalizedSelected
  ));

  if (normalizedSelected && !known) {
    const manual = document.createElement('option');
    manual.value = selectedValue;
    manual.label = 'Manual value';
    datalist.appendChild(manual);
  }
}

function syncMatchupScopeControls() {
  const scope = $('matchupScope').value === 'team' ? 'team' : 'league';
  const isTeamScope = scope === 'team';

  $('focusTeam').disabled = !isTeamScope;
  $('refreshFocusTeamsBtn').disabled = !isTeamScope;

  if (!isTeamScope) {
    $('focusTeamHint').textContent = 'League scope active: overlay rotates all matchups.';
  }
}

function appendScopeParams(url) {
  const scope = $('matchupScope')?.value === 'team' ? 'team' : 'league';
  const focusTeam = ($('focusTeam')?.value || '').trim();
  const parsed = new URL(url, window.location.origin);

  if (scope === 'team') {
    parsed.searchParams.set('scope', 'team');
    if (focusTeam) {
      parsed.searchParams.set('team', focusTeam);
    } else {
      parsed.searchParams.delete('team');
    }
  } else {
    parsed.searchParams.delete('scope');
    parsed.searchParams.delete('team');
  }

  return parsed.toString();
}

function buildOverlayUrl(baseUrl) {
  return appendScopeParams(appendOverlayKey(baseUrl));
}

function refreshOverlayLinks() {
  const base = `${window.location.origin}/overlay`;
  const overlayUrl = buildOverlayUrl(base);
  $('overlayUrl').value = overlayUrl;
  $('openOverlayPreviewLink').href = overlayUrl;
  renderPresetLinks(base);
  renderSceneSetupCards(base);
}

function renderProfiles() {
  const select = $('profileSelect');

  if (!state.profiles.length) {
    select.innerHTML = '<option value="">No profiles yet</option>';
    return;
  }

  select.innerHTML = state.profiles
    .map((profile) => {
      const active = profile.id === state.activeProfileId ? ' (Active)' : '';
      return `<option value="${profile.id}">${profile.name}${active}</option>`;
    })
    .join('');

  if (state.activeProfileId) {
    select.value = state.activeProfileId;
  }
}

function fillForm(settings) {
  state.settings = settings;

  $('yahooClientId').value = settings.yahoo.clientId || '';
  $('yahooClientSecret').value = settings.yahoo.clientSecret || '';
  $('yahooRedirectUri').value = settings.yahoo.redirectUri || '';
  $('yahooScope').value = settings.yahoo.scope || 'fspt-r';

  $('leagueId').value = settings.league.leagueId || '';
  $('providerSelect').value = settings.data.provider || 'yahoo';
  $('gameKey').value = settings.league.gameKey || '';
  $('season').value = settings.league.season || '';

  $('espnLeagueId').value = settings.espn?.leagueId || '';
  $('espnSeason').value = settings.espn?.season || settings.league.season || '';
  if (settings.espn?.week === 'current' || settings.espn?.week === undefined || settings.espn?.week === null) {
    setScopedWeekMode('espnWeekMode', 'espnWeekNumber', 'current', 1, 1);
  } else {
    setScopedWeekMode('espnWeekMode', 'espnWeekNumber', 'custom', Number(settings.espn.week || 1), 1);
    $('espnWeekNumber').value = settings.espn.week;
  }
  $('espnSwid').value = settings.espn?.swid || '';
  $('espnS2').value = settings.espn?.espnS2 || '';

  $('sleeperLeagueId').value = settings.sleeper?.leagueId || '';
  $('sleeperSeason').value = settings.sleeper?.season || settings.league.season || '';
  if (settings.sleeper?.week === 'current' || settings.sleeper?.week === undefined || settings.sleeper?.week === null) {
    setScopedWeekMode('sleeperWeekMode', 'sleeperWeekNumber', 'current', 1, 1);
  } else {
    setScopedWeekMode('sleeperWeekMode', 'sleeperWeekNumber', 'custom', Number(settings.sleeper.week || 1), 1);
    $('sleeperWeekNumber').value = settings.sleeper.week;
  }

  if (settings.league.week === 'current') {
    setWeekMode('current', 1);
  } else {
    setWeekMode('custom', Number(settings.league.week || 1));
    $('weekNumber').value = settings.league.week;
  }

  $('refreshIntervalMs').value = settings.data.refreshIntervalMs;
  $('scoreboardPollMs').value = settings.data.scoreboardPollMs || settings.data.refreshIntervalMs || 10000;
  $('tdScanIntervalMs').value = settings.data.tdScanIntervalMs || settings.data.refreshIntervalMs || 10000;
  $('maxRetryDelayMs').value = settings.data.maxRetryDelayMs;
  $('retryJitterPct').value = settings.data.retryJitterPct ?? 0.15;
  $('tdDedupWindowMs').value = settings.data.tdDedupWindowMs ?? 90000;

  $('adaptiveEnabled').checked = Boolean(settings.data.adaptivePolling?.enabled);
  $('adaptiveLiveMs').value = settings.data.adaptivePolling?.liveMs ?? 10000;
  $('adaptiveMixedMs').value = settings.data.adaptivePolling?.mixedMs ?? 20000;
  $('adaptiveIdleMs').value = settings.data.adaptivePolling?.idleMs ?? 45000;
  $('scheduleAwareEnabled').checked = Boolean(settings.data.scheduleAware?.enabled);
  $('scheduleTimezone').value = settings.data.scheduleAware?.timezone || 'America/New_York';
  $('scheduleStartHour').value = settings.data.scheduleAware?.gameWindowStartHour ?? 9;
  $('scheduleEndHour').value = settings.data.scheduleAware?.gameWindowEndHour ?? 24;
  $('scheduleOffHoursScoreboardMs').value = settings.data.scheduleAware?.offHoursScoreboardMs ?? 60000;
  $('scheduleOffHoursTdMs').value = settings.data.scheduleAware?.offHoursTdMs ?? 60000;

  $('circuitEnabled').checked = Boolean(settings.data.circuitBreaker?.enabled);
  $('circuitFailureThreshold').value = settings.data.circuitBreaker?.failureThreshold ?? 4;
  $('circuitCooldownMs').value = settings.data.circuitBreaker?.cooldownMs ?? 60000;
  $('circuitRateLimitCooldownMs').value = settings.data.circuitBreaker?.rateLimitCooldownMs ?? 120000;

  $('historyEnabled').checked = Boolean(settings.data.history?.enabled);
  $('historyRetentionDays').value = settings.data.history?.retentionDays ?? 14;
  $('safeModeEnabled').checked = Boolean(settings.data.safeMode?.enabled);
  $('safeModeFallbackToMock').checked = Boolean(settings.data.safeMode?.fallbackToMock);
  $('safeModeStartupForceFallback').checked = Boolean(settings.data.safeMode?.startupForceFallbackIfAuthDown);
  $('rateBudgetEnabled').checked = Boolean(settings.data.rateLimitBudget?.enabled);
  $('rateBudgetPerHour').value = settings.data.rateLimitBudget?.perHour ?? 1800;
  $('rateBudgetWarnThreshold').value = settings.data.rateLimitBudget?.warnThresholdPct ?? 0.8;

  $('mockMode').checked = Boolean(settings.data.mockMode);
  $('mockSeed').value = settings.data.mockSeed || '';
  $('teamOverrides').value = JSON.stringify(settings.league.teamNameOverrides || {}, null, 2);

  $('overlayMode').value = settings.overlay.mode;
  $('matchupScope').value = settings.overlay.matchupScope === 'team' ? 'team' : 'league';
  $('focusTeam').value = settings.overlay.focusTeam || '';
  $('scenePreset').value = settings.overlay.scenePreset;
  $('rotationIntervalMs').value = settings.overlay.rotationIntervalMs;
  $('fontScale').value = settings.theme.fontScale;
  $('themePack').value = settings.overlay.themePack || 'neon-grid';
  syncMatchupScopeControls();
  renderFocusTeamSuggestions(state.focusTeamChoices, $('focusTeam').value);

  $('twoMatchupLayout').checked = Boolean(settings.overlay.twoMatchupLayout);
  $('compactLayout').checked = settings.overlay.layout === 'compact';
  $('darkMode').checked = Boolean(settings.theme.darkMode);
  $('showUpdatedIndicator').checked = Boolean(settings.dev.showUpdatedIndicator);
  $('showProjections').checked = Boolean(settings.overlay.showProjections);
  $('showRecords').checked = Boolean(settings.overlay.showRecords);
  $('showLogos').checked = Boolean(settings.overlay.showLogos);
  $('showTicker').checked = Boolean(settings.overlay.showTicker);
  $('showTdAlerts').checked = Boolean(settings.overlay.showTdAlerts);
  $('showScoreDelta').checked = Boolean(settings.overlay.showScoreDelta);
  $('autoRedzoneEnabled').checked = Boolean(settings.overlay.autoRedzone?.enabled);
  $('autoRedzoneLockMs').value = settings.overlay.autoRedzone?.lockMs ?? 25000;
  $('autoRedzoneFocusLimit').value = settings.overlay.autoRedzone?.focusLimit ?? 3;
  $('autoRedzoneMaxScoreDiff').value = settings.overlay.autoRedzone?.maxScoreDiff ?? 12;
  $('storyCardsEnabled').checked = Boolean(settings.overlay.storyCards?.enabled);
  $('storyCardsInterval').value = settings.overlay.storyCards?.interval ?? 2;
  $('tdAlertDurationMs').value = settings.overlay.tdAlertDurationMs || 8000;
  $('highlightClosest').checked = Boolean(settings.overlay.highlightClosest);
  $('highlightUpset').checked = Boolean(settings.overlay.highlightUpset);
  $('brandingEnabled').checked = Boolean(settings.overlay.branding?.enabled);
  $('brandingWatermarkEnabled').checked = Boolean(settings.overlay.branding?.watermarkEnabled);
  $('leagueTitleInput').value = settings.overlay.branding?.leagueTitle || 'Fantasy Football Live';
  $('watermarkTextInput').value = settings.overlay.branding?.watermarkText || 'Yahoo Fantasy Overlay';
  $('watermarkLogoUrlInput').value = settings.overlay.branding?.watermarkLogoUrl || '';
  $('fontDisplaySelect').value = settings.overlay.branding?.fontDisplay || 'Rajdhani';
  $('fontBodySelect').value = settings.overlay.branding?.fontBody || 'Rajdhani';

  if (!$('adminApiKeyInput').value.trim() && settings.security?.adminApiKey) {
    $('adminApiKeyInput').value = settings.security.adminApiKey;
  }
  if (!$('overlayApiKeyInput').value.trim() && settings.security?.overlayApiKey) {
    $('overlayApiKeyInput').value = settings.security.overlayApiKey;
  }

  $('gameOfWeekMatchupId').value = settings.overlay.gameOfWeekMatchupId || '';
  $('soundHookUrl').value = settings.overlay.soundHookUrl || '';

  $('primaryColor').value = settings.theme.primary || '#13f1b7';
  $('secondaryColor').value = settings.theme.secondary || '#3d5cff';
  $('textColor').value = settings.theme.text || '#f6f8ff';
  $('mutedTextColor').value = settings.theme.mutedText || '#aab3ca';
  $('bgColor').value = settings.theme.background || 'rgba(8, 12, 24, 0.72)';

  $('reducedAnimations').value = String(Boolean(settings.security?.reducedAnimations));
  $('useOsKeychain').checked = Boolean(settings.security?.useOsKeychain);

  $('audioEnabled').checked = Boolean(settings.audio?.enabled);
  $('audioEndpointUrl').value = settings.audio?.endpointUrl || '';
  $('audioMinDispatchIntervalMs').value = settings.audio?.minDispatchIntervalMs ?? 1200;
  $('audioMaxQueueSize').value = settings.audio?.maxQueueSize ?? 50;
  $('audioTemplateTouchdown').value = settings.audio?.templates?.touchdown || 'default-td';
  $('audioTemplateLeadChange').value = settings.audio?.templates?.lead_change || 'default-lead';
  $('audioTemplateUpset').value = settings.audio?.templates?.upset || 'default-upset';
  $('audioTemplateFinal').value = settings.audio?.templates?.final || 'default-final';

  $('integrationsEnabled').checked = Boolean(settings.integrations?.enabled);
  $('discordWebhookUrl').value = settings.integrations?.discordWebhookUrl || '';
  $('slackWebhookUrl').value = settings.integrations?.slackWebhookUrl || '';
  $('sendTouchdowns').checked = settings.integrations?.sendTouchdowns ?? true;
  $('sendLeadChanges').checked = settings.integrations?.sendLeadChanges ?? true;
  $('sendUpsets').checked = settings.integrations?.sendUpsets ?? true;
  $('sendFinals').checked = settings.integrations?.sendFinals ?? true;

  $('obsEnabled').checked = Boolean(settings.obs?.enabled);
  $('obsWsUrl').value = settings.obs?.wsUrl || 'ws://127.0.0.1:4455';
  $('obsPassword').value = settings.obs?.password || '';
  $('obsSceneCooldownMs').value = settings.obs?.sceneCooldownMs ?? 7000;
  $('obsSceneTouchdown').value = settings.obs?.scenes?.touchdown || '';
  $('obsSceneUpset').value = settings.obs?.scenes?.upset || '';
  $('obsSceneGameOfWeek').value = settings.obs?.scenes?.gameOfWeek || '';
  $('obsSceneDefault').value = settings.obs?.scenes?.default || '';

  applyThemePreview();

  refreshOverlayLinks();
}

function collectForm() {
  let overrides;
  try {
    overrides = JSON.parse($('teamOverrides').value || '{}');
  } catch {
    throw new Error('Team overrides must be valid JSON.');
  }

  const weekMode = $('weekMode').value;
  const week = weekMode === 'current' ? 'current' : numberValue($('weekNumber'), 1);
  const espnWeekMode = $('espnWeekMode').value;
  const espnWeek = espnWeekMode === 'current' ? 'current' : numberValue($('espnWeekNumber'), 1);
  const sleeperWeekMode = $('sleeperWeekMode').value;
  const sleeperWeek = sleeperWeekMode === 'current' ? 'current' : numberValue($('sleeperWeekNumber'), 1);

  return {
    yahoo: {
      clientId: $('yahooClientId').value.trim(),
      clientSecret: $('yahooClientSecret').value,
      redirectUri: $('yahooRedirectUri').value.trim(),
      scope: $('yahooScope').value.trim() || 'fspt-r'
    },
    espn: {
      leagueId: $('espnLeagueId').value.trim(),
      season: numberValue($('espnSeason'), numberValue($('season'), new Date().getFullYear())),
      week: espnWeek,
      swid: $('espnSwid').value.trim(),
      espnS2: $('espnS2').value.trim()
    },
    sleeper: {
      leagueId: $('sleeperLeagueId').value.trim(),
      season: numberValue($('sleeperSeason'), numberValue($('season'), new Date().getFullYear())),
      week: sleeperWeek
    },
    league: {
      leagueId: $('leagueId').value.trim(),
      gameKey: $('gameKey').value.trim(),
      season: numberValue($('season'), new Date().getFullYear()),
      week,
      teamNameOverrides: overrides
    },
    data: {
      provider: $('providerSelect').value,
      refreshIntervalMs: numberValue($('refreshIntervalMs'), 10000),
      scoreboardPollMs: numberValue($('scoreboardPollMs'), 10000),
      tdScanIntervalMs: numberValue($('tdScanIntervalMs'), 10000),
      maxRetryDelayMs: numberValue($('maxRetryDelayMs'), 300000),
      retryJitterPct: numberValue($('retryJitterPct'), 0.15),
      tdDedupWindowMs: numberValue($('tdDedupWindowMs'), 90000),
      adaptivePolling: {
        enabled: bool($('adaptiveEnabled')),
        liveMs: numberValue($('adaptiveLiveMs'), 10000),
        mixedMs: numberValue($('adaptiveMixedMs'), 20000),
        idleMs: numberValue($('adaptiveIdleMs'), 45000)
      },
      scheduleAware: {
        enabled: bool($('scheduleAwareEnabled')),
        timezone: $('scheduleTimezone').value.trim() || 'America/New_York',
        gameWindowStartHour: numberValue($('scheduleStartHour'), 9),
        gameWindowEndHour: numberValue($('scheduleEndHour'), 24),
        offHoursScoreboardMs: numberValue($('scheduleOffHoursScoreboardMs'), 60000),
        offHoursTdMs: numberValue($('scheduleOffHoursTdMs'), 60000)
      },
      circuitBreaker: {
        enabled: bool($('circuitEnabled')),
        failureThreshold: numberValue($('circuitFailureThreshold'), 4),
        cooldownMs: numberValue($('circuitCooldownMs'), 60000),
        rateLimitCooldownMs: numberValue($('circuitRateLimitCooldownMs'), 120000)
      },
      history: {
        enabled: bool($('historyEnabled')),
        retentionDays: numberValue($('historyRetentionDays'), 14)
      },
      safeMode: {
        enabled: bool($('safeModeEnabled')),
        fallbackToMock: bool($('safeModeFallbackToMock')),
        startupForceFallbackIfAuthDown: bool($('safeModeStartupForceFallback'))
      },
      rateLimitBudget: {
        enabled: bool($('rateBudgetEnabled')),
        perHour: numberValue($('rateBudgetPerHour'), 1800),
        warnThresholdPct: numberValue($('rateBudgetWarnThreshold'), 0.8)
      },
      mockMode: bool($('mockMode')),
      mockSeed: $('mockSeed').value.trim()
    },
    overlay: {
      mode: $('overlayMode').value,
      matchupScope: $('matchupScope').value === 'team' ? 'team' : 'league',
      focusTeam: $('focusTeam').value.trim(),
      scenePreset: $('scenePreset').value,
      rotationIntervalMs: numberValue($('rotationIntervalMs'), 9000),
      twoMatchupLayout: bool($('twoMatchupLayout')),
      layout: bool($('compactLayout')) ? 'compact' : 'full',
      showProjections: bool($('showProjections')),
      showRecords: bool($('showRecords')),
      showLogos: bool($('showLogos')),
      showTicker: bool($('showTicker')),
      showTdAlerts: bool($('showTdAlerts')),
      showScoreDelta: bool($('showScoreDelta')),
      autoRedzone: {
        enabled: bool($('autoRedzoneEnabled')),
        lockMs: numberValue($('autoRedzoneLockMs'), 25000),
        focusLimit: numberValue($('autoRedzoneFocusLimit'), 3),
        maxScoreDiff: numberValue($('autoRedzoneMaxScoreDiff'), 12)
      },
      storyCards: {
        enabled: bool($('storyCardsEnabled')),
        interval: numberValue($('storyCardsInterval'), 2)
      },
      tdAlertDurationMs: numberValue($('tdAlertDurationMs'), 8000),
      highlightClosest: bool($('highlightClosest')),
      highlightUpset: bool($('highlightUpset')),
      branding: {
        enabled: bool($('brandingEnabled')),
        leagueTitle: $('leagueTitleInput').value.trim(),
        watermarkEnabled: bool($('brandingWatermarkEnabled')),
        watermarkText: $('watermarkTextInput').value.trim(),
        watermarkLogoUrl: $('watermarkLogoUrlInput').value.trim(),
        fontDisplay: $('fontDisplaySelect').value,
        fontBody: $('fontBodySelect').value
      },
      gameOfWeekMatchupId: $('gameOfWeekMatchupId').value.trim(),
      soundHookUrl: $('soundHookUrl').value.trim(),
      themePack: $('themePack').value
    },
    theme: {
      fontScale: numberValue($('fontScale'), 1),
      darkMode: bool($('darkMode')),
      compact: bool($('compactLayout')),
      primary: $('primaryColor').value,
      secondary: $('secondaryColor').value,
      background: $('bgColor').value.trim(),
      text: $('textColor').value,
      mutedText: $('mutedTextColor').value
    },
    dev: {
      showUpdatedIndicator: bool($('showUpdatedIndicator'))
    },
    security: {
      adminApiKey: $('adminApiKeyInput').value.trim(),
      overlayApiKey: $('overlayApiKeyInput').value.trim(),
      reducedAnimations: $('reducedAnimations').value === 'true',
      useOsKeychain: bool($('useOsKeychain'))
    },
    audio: {
      enabled: bool($('audioEnabled')),
      endpointUrl: $('audioEndpointUrl').value.trim(),
      minDispatchIntervalMs: numberValue($('audioMinDispatchIntervalMs'), 1200),
      maxQueueSize: numberValue($('audioMaxQueueSize'), 50),
      templates: {
        touchdown: $('audioTemplateTouchdown').value.trim() || 'default-td',
        lead_change: $('audioTemplateLeadChange').value.trim() || 'default-lead',
        upset: $('audioTemplateUpset').value.trim() || 'default-upset',
        final: $('audioTemplateFinal').value.trim() || 'default-final'
      }
    },
    integrations: {
      enabled: bool($('integrationsEnabled')),
      discordWebhookUrl: $('discordWebhookUrl').value.trim(),
      slackWebhookUrl: $('slackWebhookUrl').value.trim(),
      sendTouchdowns: bool($('sendTouchdowns')),
      sendLeadChanges: bool($('sendLeadChanges')),
      sendUpsets: bool($('sendUpsets')),
      sendFinals: bool($('sendFinals'))
    },
    obs: {
      enabled: bool($('obsEnabled')),
      wsUrl: $('obsWsUrl').value.trim(),
      password: $('obsPassword').value,
      sceneCooldownMs: numberValue($('obsSceneCooldownMs'), 7000),
      scenes: {
        touchdown: $('obsSceneTouchdown').value.trim(),
        upset: $('obsSceneUpset').value.trim(),
        gameOfWeek: $('obsSceneGameOfWeek').value.trim(),
        default: $('obsSceneDefault').value.trim()
      }
    }
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: withAdminHeaders(options.headers || {})
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.detail || `Request failed (${response.status})`);
  }

  return body;
}

function notify(nodeId, message, ok = true) {
  const node = $(nodeId);
  node.textContent = message;
  node.style.color = ok ? '#88ffe0' : '#ff9cad';
}

async function refreshProfiles() {
  const payload = await fetchJson('/api/profiles');
  state.profiles = payload.profiles || [];
  state.activeProfileId = payload.activeProfileId || null;
  renderProfiles();
}

async function refreshFocusTeams({ silent = false } = {}) {
  try {
    const snapshot = await fetchJson('/api/data');
    const choices = extractFocusTeamsFromPayload(snapshot.payload || {});
    state.focusTeamChoices = choices;
    renderFocusTeamSuggestions(choices, $('focusTeam').value || '');
    syncMatchupScopeControls();

    const source = String(snapshot?.payload?.league?.source || '').toUpperCase();
    if (choices.length) {
      $('focusTeamHint').textContent = `Loaded ${choices.length} teams from ${source || 'LATEST'} snapshot.`;
    } else {
      $('focusTeamHint').textContent = 'No teams in snapshot yet. Run Test API Connection or Force Refresh.';
    }
    return choices;
  } catch (error) {
    if (!silent) {
      notify('testResult', `Unable to refresh focus-team list: ${error.message}`, false);
    }
    syncMatchupScopeControls();
    $('focusTeamHint').textContent = 'Team list unavailable. Save settings and test the provider first.';
    return [];
  }
}

async function load() {
  const rememberedKey = localStorage.getItem(ADMIN_KEY_STORAGE) || '';
  if (rememberedKey) {
    $('adminApiKeyInput').value = rememberedKey;
  }

  const [{ settings }, statusPayload] = await Promise.all([
    fetchJson('/api/config'),
    fetchJson('/api/status')
  ]);

  state.status = statusPayload.status;
  state.auth = statusPayload.auth;

  fillForm(settings);
  await refreshFocusTeams({ silent: true });
  refreshAuthPills();
  updateStatusLine();

  await refreshProfiles();
  await refreshDiagnostics();
}

function renderPresetLinks(base) {
  const node = $('presetLinks');
  const origin = window.location.origin;
  const normalizedBase = base || `${origin}/overlay`;
  const links = [
    { label: 'Centered Card', url: buildOverlayUrl(`${origin}/overlay/centered-card`) },
    { label: 'Lower Third', url: buildOverlayUrl(`${origin}/overlay/lower-third`) },
    { label: 'Sidebar Widget', url: buildOverlayUrl(`${origin}/overlay/sidebar-widget`) },
    { label: 'Bottom Ticker', url: buildOverlayUrl(`${origin}/overlay/bottom-ticker`) },
    { label: 'Ticker Mode', url: buildOverlayUrl(`${origin}/overlay/ticker`) },
    { label: 'Two-Up Sidebar', url: buildOverlayUrl(`${normalizedBase}?preset=sidebar-widget&twoUp=1&scale=0.95`) }
  ];

  node.innerHTML = links
    .map((link) => `<div><strong>${link.label}:</strong> <a href="${link.url}" target="_blank" rel="noreferrer">${link.url}</a></div>`)
    .join('');
}

function createSceneMetaLine(label, value) {
  const row = document.createElement('p');
  row.innerHTML = `<strong>${label}:</strong> ${value}`;
  return row;
}

function renderSceneSetupCards(base) {
  const node = $('sceneSetupCards');
  if (!node) {
    return;
  }

  const origin = window.location.origin;
  const normalizedBase = base || `${origin}/overlay`;
  node.innerHTML = '';

  for (const preset of SCENE_SETUP_PRESETS) {
    const route = preset.route.startsWith('/overlay/')
      ? `${origin}${preset.route}`
      : normalizedBase;
    const url = buildOverlayUrl(route);

    const card = document.createElement('article');
    card.className = 'scene-card';

    const title = document.createElement('h3');
    title.textContent = preset.label;
    card.appendChild(title);

    const kicker = document.createElement('p');
    kicker.className = 'scene-kicker';
    kicker.textContent = `Preset route: ${preset.route}`;
    card.appendChild(kicker);

    const meta = document.createElement('div');
    meta.className = 'scene-meta';
    meta.appendChild(createSceneMetaLine('Use Case', preset.purpose));
    meta.appendChild(createSceneMetaLine('Placement', preset.placement));
    meta.appendChild(createSceneMetaLine('Source Size', preset.size));
    meta.appendChild(createSceneMetaLine('Notes', preset.notes));
    card.appendChild(meta);

    const urlInput = document.createElement('input');
    urlInput.className = 'scene-url';
    urlInput.type = 'text';
    urlInput.readOnly = true;
    urlInput.value = url;
    card.appendChild(urlInput);

    const actions = document.createElement('div');
    actions.className = 'scene-actions';

    const preview = document.createElement('a');
    preview.className = 'btn ghost';
    preview.href = url;
    preview.target = '_blank';
    preview.rel = 'noreferrer';
    preview.textContent = 'Preview';
    actions.appendChild(preview);

    const copyUrl = document.createElement('button');
    copyUrl.className = 'btn ghost';
    copyUrl.type = 'button';
    copyUrl.textContent = 'Copy URL';
    copyUrl.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        notify('testResult', `Copied URL for "${preset.label}".`, true);
      } catch {
        notify('testResult', `Clipboard copy failed for "${preset.label}".`, false);
      }
    });
    actions.appendChild(copyUrl);

    const copyLabel = document.createElement('button');
    copyLabel.className = 'btn ghost';
    copyLabel.type = 'button';
    copyLabel.textContent = 'Copy Scene Label';
    copyLabel.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(preset.label);
        notify('testResult', `Copied scene label "${preset.label}".`, true);
      } catch {
        notify('testResult', `Clipboard copy failed for "${preset.label}".`, false);
      }
    });
    actions.appendChild(copyLabel);

    card.appendChild(actions);
    node.appendChild(card);
  }
}

function formatMsCompact(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) {
    return '--';
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }

  const minutes = seconds / 60;
  return `${minutes.toFixed(1)} m`;
}

function renderHealthTiles(diagnostics) {
  const counters = diagnostics?.metrics?.counters || {};
  const gauges = diagnostics?.metrics?.gauges || {};
  const status = diagnostics?.status || {};
  const budget = diagnostics?.yahooBudget || null;

  $('healthApiLatency').textContent = formatMsCompact(gauges.yahoo_last_request_duration_ms);
  $('healthYahooErrors').textContent = String(counters.yahoo_requests_failed_total || 0);
  $('healthCircuitTrips').textContent = String(status.circuitTripCount || counters.circuit_breaker_open_total || 0);
  $('healthSseClients').textContent = String(gauges.sse_clients_connected || 0);
  $('healthNextScorePoll').textContent = formatMsCompact(status.nextScoreboardDelayMs);
  $('healthNextTdPoll').textContent = formatMsCompact(status.nextTdDelayMs);
  $('healthProvider').textContent = String(status.provider || status.mode || '--');
  $('healthRateBudget').textContent = budget
    ? `${Math.round(Number(budget.usagePct || 0) * 100)}%`
    : '--';
  $('healthCircuitState').textContent = status.circuitOpenUntil
    ? `OPEN (${status.circuitReason || 'unknown'})`
    : 'Closed';
}

function refreshAuthPills() {
  if (!state.auth) {
    return;
  }

  setPill('oauthConfigured', `Configured: ${state.auth.configured ? 'Yes' : 'No'}`, state.auth.configured);
  setPill('oauthAuthorized', `Authorized: ${state.auth.authorized ? 'Yes' : 'No'}`, state.auth.authorized);

  const expiryText = state.auth.expiresAt
    ? new Date(state.auth.expiresAt).toLocaleString()
    : 'N/A';

  const expiryNode = $('oauthExpiry');
  expiryNode.textContent = `Token Expiry: ${expiryText}`;
  expiryNode.classList.remove('good', 'bad');
  expiryNode.classList.add(state.auth.accessTokenValid ? 'good' : 'bad');
}

async function saveSettings() {
  const payload = collectForm();

  const result = await fetchJson('/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  fillForm(result.settings);
  await refreshFocusTeams({ silent: true });
  await refreshStatus();
  await refreshDiagnostics();
}

async function refreshStatus() {
  const statusPayload = await fetchJson('/api/status');
  state.status = statusPayload.status;
  state.auth = statusPayload.auth;
  if (typeof state.status?.controlState?.pinnedMatchupId === 'string') {
    $('pinnedMatchupId').value = state.status.controlState.pinnedMatchupId;
  }
  refreshAuthPills();
  updateStatusLine();
}

async function refreshDiagnostics() {
  const payload = await fetchJson('/api/diagnostics?hours=24');
  state.diagnostics = payload.diagnostics;
  renderHealthTiles(payload.diagnostics);

  const output = {
    status: payload.diagnostics.status,
    yahooBudget: payload.diagnostics.yahooBudget,
    metrics: payload.diagnostics.metrics,
    recentPolls: (payload.diagnostics.pollRecords || []).slice(0, 12),
    recentLeadChanges: (payload.diagnostics.recentLeadChanges || []).slice(0, 8),
    recentUpsetEvents: (payload.diagnostics.recentUpsetEvents || []).slice(0, 8),
    recentFinalEvents: (payload.diagnostics.recentFinalEvents || []).slice(0, 8),
    recentTdEvents: (payload.diagnostics.recentTdEvents || []).slice(0, 8),
    recentPlayerScoreChanges: (payload.diagnostics.recentPlayerScoreChanges || []).slice(0, 8)
  };

  $('diagnosticsOutput').textContent = JSON.stringify(output, null, 2);
}

async function testConnection() {
  notify('testResult', 'Testing API connection...');

  try {
    const result = await fetchJson('/api/test-connection', {
      method: 'POST'
    });

    if (result.mode === 'mock') {
      notify('testResult', result.message, true);
    } else {
      notify(
        'testResult',
        `OK: ${result.league.name} | Week ${result.league.week} | Matchups ${result.matchupCount}`,
        true
      );
    }

    await Promise.all([
      refreshStatus(),
      refreshFocusTeams({ silent: true })
    ]);
  } catch (error) {
    notify('testResult', error.message, false);
  }
}

async function forceRefresh() {
  await fetchJson('/api/refresh', { method: 'POST' });
  await Promise.all([
    refreshStatus(),
    refreshFocusTeams({ silent: true })
  ]);
  await refreshDiagnostics();
}

async function forceNext() {
  await fetchJson('/api/control/next', { method: 'POST' });
}

async function setRotationPaused(paused) {
  await fetchJson('/api/control/pause', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ paused: Boolean(paused) })
  });
}

async function triggerStoryCard() {
  await fetchJson('/api/control/story', { method: 'POST' });
}

async function pinMatchup(matchupId) {
  await fetchJson('/api/control/pin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ matchupId: String(matchupId || '').trim() })
  });
}

async function replaySnapshotById(snapshotId) {
  const numericId = Number(snapshotId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error('Enter a valid snapshot id first.');
  }

  await fetchJson('/api/history/replay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ snapshotId: numericId })
  });
}

async function logoutTokens() {
  await fetchJson('/api/auth/logout', { method: 'POST' });
  await refreshStatus();
}

async function exportConfig() {
  const response = await fetch('/api/config/export', {
    headers: withAdminHeaders({})
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Export failed (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'overlay-config.export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportHistory(format = 'json') {
  const week = numberValue($('historyWeekFilter'), null);
  const weekQuery = Number.isFinite(week) && week > 0 ? `&week=${encodeURIComponent(String(week))}` : '';
  const response = await fetch(`/api/history/export?format=${encodeURIComponent(format)}&hours=168${weekQuery}`, {
    headers: withAdminHeaders({})
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `History export failed (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = format === 'csv' ? 'matchup-timeline.csv' : 'matchup-timeline.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importConfigFromFile(file) {
  const raw = await file.text();
  const payload = JSON.parse(raw);

  const result = await fetchJson('/api/config/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  fillForm(result.settings);
  await refreshStatus();
  await refreshDiagnostics();
}

function applyThemePack() {
  const packId = $('themePack').value;
  const pack = THEME_PACKS[packId];
  if (!pack) {
    return;
  }

  $('primaryColor').value = pack.theme.primary;
  $('secondaryColor').value = pack.theme.secondary;
  $('textColor').value = pack.theme.text;
  $('mutedTextColor').value = pack.theme.mutedText;
  $('bgColor').value = pack.theme.background;
  $('scenePreset').value = pack.overlay.scenePreset;
  applyThemePreview();
}

async function saveProfileFromCurrent() {
  const name = $('profileNameInput').value.trim() || `Profile ${new Date().toLocaleTimeString()}`;
  const settings = collectForm();

  const payload = await fetchJson('/api/profiles/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, settings })
  });

  state.profiles = payload.profiles || [];
  state.activeProfileId = payload.activeProfileId || null;
  renderProfiles();
}

async function switchSelectedProfile() {
  const profileId = $('profileSelect').value;
  if (!profileId) {
    throw new Error('Select a profile first.');
  }

  const payload = await fetchJson('/api/profiles/switch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ profileId })
  });

  fillForm(payload.settings);
  await refreshFocusTeams({ silent: true });
  state.profiles = payload.profiles || [];
  state.activeProfileId = payload.activeProfileId || null;
  renderProfiles();
  await refreshStatus();
  await refreshDiagnostics();
}

async function deleteSelectedProfile() {
  const profileId = $('profileSelect').value;
  if (!profileId) {
    throw new Error('Select a profile first.');
  }

  if (!window.confirm('Delete selected profile?')) {
    return;
  }

  const payload = await fetchJson(`/api/profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE'
  });

  state.profiles = payload.profiles || [];
  state.activeProfileId = payload.activeProfileId || null;
  renderProfiles();
}

function bindEvents() {
  $('weekMode').addEventListener('change', (event) => {
    setWeekMode(event.target.value, numberValue($('weekNumber'), 1));
  });

  $('espnWeekMode').addEventListener('change', (event) => {
    setScopedWeekMode('espnWeekMode', 'espnWeekNumber', event.target.value, numberValue($('espnWeekNumber'), 1), 1);
  });

  $('sleeperWeekMode').addEventListener('change', (event) => {
    setScopedWeekMode('sleeperWeekMode', 'sleeperWeekNumber', event.target.value, numberValue($('sleeperWeekNumber'), 1), 1);
  });

  ['primaryColor', 'secondaryColor', 'textColor', 'mutedTextColor', 'bgColor'].forEach((id) => {
    $(id).addEventListener('input', applyThemePreview);
  });

  $('themePackApplyBtn').addEventListener('click', applyThemePack);

  $('matchupScope').addEventListener('change', () => {
    syncMatchupScopeControls();
    refreshOverlayLinks();
  });

  $('focusTeam').addEventListener('input', () => {
    refreshOverlayLinks();
  });

  $('refreshFocusTeamsBtn').addEventListener('click', () => {
    refreshFocusTeams()
      .then((choices) => {
        notify('testResult', `Team suggestions refreshed (${choices.length}).`, true);
      })
      .catch((error) => notify('testResult', error.message, false));
  });

  $('saveBtn').addEventListener('click', async () => {
    try {
      await saveSettings();
      notify('testResult', 'Settings saved.', true);
    } catch (error) {
      notify('testResult', error.message, false);
    }
  });

  $('testBtn').addEventListener('click', () => {
    testConnection().catch((error) => notify('testResult', error.message, false));
  });

  $('refreshBtn').addEventListener('click', () => {
    forceRefresh().catch((error) => notify('testResult', error.message, false));
  });

  $('nextBtn').addEventListener('click', () => {
    forceNext().catch((error) => notify('testResult', error.message, false));
  });

  $('pauseRotationBtn').addEventListener('click', () => {
    setRotationPaused(true)
      .then(() => notify('testResult', 'Overlay rotation paused.', true))
      .catch((error) => notify('testResult', error.message, false));
  });

  $('resumeRotationBtn').addEventListener('click', () => {
    setRotationPaused(false)
      .then(() => notify('testResult', 'Overlay rotation resumed.', true))
      .catch((error) => notify('testResult', error.message, false));
  });

  $('storyNowBtn').addEventListener('click', () => {
    triggerStoryCard()
      .then(() => notify('testResult', 'Story card trigger sent.', true))
      .catch((error) => notify('testResult', error.message, false));
  });

  $('pinMatchupBtn').addEventListener('click', () => {
    pinMatchup($('pinnedMatchupId').value)
      .then(() => notify('testResult', 'Pinned matchup updated.', true))
      .catch((error) => notify('testResult', error.message, false));
  });

  $('clearPinBtn').addEventListener('click', () => {
    pinMatchup('')
      .then(() => {
        $('pinnedMatchupId').value = '';
        notify('testResult', 'Pinned matchup cleared.', true);
      })
      .catch((error) => notify('testResult', error.message, false));
  });

  $('oauthStartBtn').addEventListener('click', () => {
    const key = getAdminKey();
    if (key) {
      window.location.href = `/auth/start?adminKey=${encodeURIComponent(key)}`;
      return;
    }

    window.location.href = '/auth/start';
  });

  $('oauthLogoutBtn').addEventListener('click', () => {
    logoutTokens().catch((error) => notify('testResult', error.message, false));
  });

  $('copyOverlayBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('overlayUrl').value);
      notify('testResult', 'Overlay URL copied to clipboard.', true);
    } catch {
      notify('testResult', 'Clipboard copy failed. Copy manually.', false);
    }
  });

  $('rememberAdminKeyBtn').addEventListener('click', () => {
    const key = $('adminApiKeyInput').value.trim();
    if (!key) {
      notify('testResult', 'Enter an admin key first.', false);
      return;
    }

    localStorage.setItem(ADMIN_KEY_STORAGE, key);
    notify('testResult', 'Admin key remembered in browser.', true);
  });

  $('clearAdminKeyBtn').addEventListener('click', () => {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    $('adminApiKeyInput').value = '';
    notify('testResult', 'Remembered admin key cleared.', true);
  });

  $('exportConfigBtn').addEventListener('click', () => {
    exportConfig().catch((error) => notify('testResult', error.message, false));
  });

  $('importConfigBtn').addEventListener('click', () => {
    $('importConfigFile').click();
  });

  $('importConfigFile').addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      await importConfigFromFile(file);
      notify('testResult', 'Config imported successfully.', true);
    } catch (error) {
      notify('testResult', `Import failed: ${error.message}`, false);
    } finally {
      event.target.value = '';
    }
  });

  $('profileSaveBtn').addEventListener('click', () => {
    saveProfileFromCurrent()
      .then(() => notify('testResult', 'Profile saved.', true))
      .catch((error) => notify('testResult', error.message, false));
  });

  $('profileSwitchBtn').addEventListener('click', () => {
    switchSelectedProfile()
      .then(() => notify('testResult', 'Profile switched.', true))
      .catch((error) => notify('testResult', error.message, false));
  });

  $('profileDeleteBtn').addEventListener('click', () => {
    deleteSelectedProfile()
      .then(() => notify('testResult', 'Profile deleted.', true))
      .catch((error) => notify('testResult', error.message, false));
  });

  $('refreshDiagnosticsBtn').addEventListener('click', () => {
    refreshDiagnostics().catch((error) => notify('testResult', error.message, false));
  });

  $('replaySnapshotBtn').addEventListener('click', () => {
    replaySnapshotById($('replaySnapshotId').value)
      .then(() => notify('testResult', 'Snapshot replayed to overlay.', true))
      .catch((error) => notify('testResult', error.message, false));
  });

  $('exportHistoryJsonBtn').addEventListener('click', () => {
    exportHistory('json').catch((error) => notify('testResult', error.message, false));
  });

  $('exportHistoryCsvBtn').addEventListener('click', () => {
    exportHistory('csv').catch((error) => notify('testResult', error.message, false));
  });

  $('overlayApiKeyInput').addEventListener('input', () => {
    refreshOverlayLinks();
  });

  state.statusTimer = setInterval(() => {
    refreshStatus().catch(() => {});
  }, 15000);

  state.diagnosticsTimer = setInterval(() => {
    refreshDiagnostics().catch(() => {});
  }, 20000);
}

load()
  .then(bindEvents)
  .catch((error) => {
    $('statusLine').textContent = `Failed to load admin config: ${error.message}`;
  });
