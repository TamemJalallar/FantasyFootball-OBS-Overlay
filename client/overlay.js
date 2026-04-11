const $ = (id) => document.getElementById(id);

const state = {
  settings: null,
  payload: null,
  payloadRenderKey: null,
  status: null,
  activeIndex: 0,
  rotationTimer: null,
  eventSource: null,
  changedTeamKeys: new Set(),
  scoreDeltaByTeamKey: new Map(),
  tdAlertTimers: [],
  redzoneFocusIds: new Set(),
  redzoneLockUntil: 0,
  recentLeadChanges: [],
  recentUpsetEvents: [],
  recentPlayerScoreChanges: []
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }
  return Number(value).toFixed(2).replace(/\.00$/, '.0');
}

function formatRecord(record, enabled) {
  if (!enabled || !record) {
    return '';
  }
  return `Record ${record}`;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).slice(0, 2);
  return parts.map((x) => x[0] || '').join('').toUpperCase() || 'FF';
}

function statusClass(status) {
  if (status === 'live') return 'live';
  if (status === 'final') return 'final';
  return 'upcoming';
}

function computePayloadRenderKey(payload) {
  if (!payload?.matchups?.length) {
    return 'empty';
  }

  return payload.matchups
    .map((matchup) => [
      matchup.id,
      matchup.status,
      matchup.teamA?.key,
      matchup.teamA?.points,
      matchup.teamB?.key,
      matchup.teamB?.points,
      matchup.isClosest ? 1 : 0,
      matchup.isUpset ? 1 : 0,
      matchup.isGameOfWeek ? 1 : 0
    ].join('|'))
    .join('||');
}

function parseQueryOverrides(settings) {
  const params = new URLSearchParams(window.location.search);
  const override = JSON.parse(JSON.stringify(settings));

  if (params.get('mode')) {
    override.overlay.mode = params.get('mode');
  }

  if (params.get('preset')) {
    override.overlay.scenePreset = params.get('preset');
  }

  if (params.get('scale')) {
    const scale = Number(params.get('scale'));
    if (Number.isFinite(scale) && scale > 0.3 && scale < 3) {
      document.documentElement.style.setProperty('--overlay-scale', String(scale));
    }
  }

  if (params.get('twoUp') === '1') {
    override.overlay.twoMatchupLayout = true;
  }

  return override;
}

function setBodyClasses(settings) {
  const preset = settings.overlay.scenePreset || 'centered-card';
  document.body.className = '';
  document.body.classList.add(`preset-${preset}`);

  if (settings.overlay.layout === 'compact' || settings.theme.compact) {
    document.body.classList.add('compact');
  }

  if (settings.security?.reducedAnimations) {
    document.body.classList.add('reduced-motion');
  }
}

function applyTheme(settings) {
  document.documentElement.style.setProperty('--primary', settings.theme.primary || '#13f1b7');
  document.documentElement.style.setProperty('--secondary', settings.theme.secondary || '#3d5cff');
  document.documentElement.style.setProperty('--bg-glass', settings.theme.background || 'rgba(8, 12, 24, 0.72)');
  document.documentElement.style.setProperty('--text-main', settings.theme.text || '#f6f8ff');
  document.documentElement.style.setProperty('--text-muted', settings.theme.mutedText || '#aab3ca');
  document.documentElement.style.setProperty('--font-scale', String(settings.theme.fontScale || 1));
}

function setDevUpdated(updatedAt) {
  const node = $('devUpdated');

  if (!state.settings?.dev?.showUpdatedIndicator) {
    node.classList.add('hidden');
    return;
  }

  const value = updatedAt ? new Date(updatedAt).toLocaleTimeString() : '--';
  node.textContent = `Updated ${value}`;
  node.classList.remove('hidden');
}

function setDegradedIndicator(status) {
  const node = $('degradedPill');
  if (!status?.degradedMode) {
    node.classList.add('hidden');
    return;
  }

  const reason = status.circuitReason ? ` (${status.circuitReason})` : '';
  node.textContent = `Degraded Mode${reason}`;
  node.classList.remove('hidden');
}

function getAutoRedzoneConfig() {
  return state.settings?.overlay?.autoRedzone || { enabled: false, lockMs: 25000 };
}

function getStoryCardConfig() {
  return state.settings?.overlay?.storyCards || { enabled: false, interval: 2 };
}

function isRedzoneLockActive() {
  const config = getAutoRedzoneConfig();
  if (!config.enabled) {
    return false;
  }
  if (!state.redzoneFocusIds.size) {
    return false;
  }
  return Date.now() < state.redzoneLockUntil;
}

function getRotatingMatchups() {
  const all = state.payload?.matchups || [];
  if (!all.length) {
    return [];
  }

  if (!isRedzoneLockActive()) {
    return all;
  }

  const focused = all.filter((matchup) => (
    state.redzoneFocusIds.has(matchup.id)
    && (matchup.isLive || matchup.isClosest || matchup.isUpset)
  ));

  return focused.length ? focused : all;
}

function primeRedzoneFocus({ payload, scoreChanges = [], tdEvents = [], leadChanges = [], upsetEvents = [] }) {
  const config = getAutoRedzoneConfig();
  if (!config.enabled) {
    state.redzoneFocusIds.clear();
    state.redzoneLockUntil = 0;
    return;
  }

  const focusIds = new Set();

  for (const change of scoreChanges) {
    if (change?.matchupId) {
      focusIds.add(change.matchupId);
    }
  }
  for (const lead of leadChanges) {
    if (lead?.matchupId) {
      focusIds.add(lead.matchupId);
    }
  }
  for (const upset of upsetEvents) {
    if (upset?.matchupId) {
      focusIds.add(upset.matchupId);
    }
  }
  for (const td of tdEvents) {
    if (td?.matchupId) {
      focusIds.add(td.matchupId);
    }
  }

  for (const matchup of payload?.matchups || []) {
    if (matchup.isLive && (matchup.isClosest || matchup.isUpset)) {
      focusIds.add(matchup.id);
    }
  }

  if (!focusIds.size) {
    return;
  }

  state.redzoneFocusIds = focusIds;
  state.redzoneLockUntil = Date.now() + Number(config.lockMs || 25000);
}

function clearTdAlerts() {
  for (const timer of state.tdAlertTimers) {
    clearTimeout(timer);
  }
  state.tdAlertTimers = [];
  const container = $('tdAlerts');
  container.innerHTML = '';
}

function renderTdEvents(tdEvents = []) {
  const container = $('tdAlerts');

  if (!state.settings?.overlay?.showTdAlerts) {
    container.classList.add('hidden');
    clearTdAlerts();
    return;
  }

  container.classList.remove('hidden');
  if (!tdEvents.length) {
    return;
  }

  const duration = Number(state.settings.overlay.tdAlertDurationMs || 8000);
  const reducedMotion = Boolean(state.settings?.security?.reducedAnimations);

  for (const event of tdEvents) {
    const card = document.createElement('article');
    card.className = 'td-alert';

    const title = document.createElement('p');
    title.className = 'td-title';
    title.textContent = `${event.playerName || 'Player'} TD`;

    const subtitle = document.createElement('p');
    subtitle.className = 'td-sub';
    const details = [
      event.fantasyTeamName || '',
      event.manager || '',
      Number.isFinite(Number(event.playerPointDelta))
        ? `${event.playerPointDelta >= 0 ? '+' : ''}${Number(event.playerPointDelta).toFixed(2)} pts`
        : '',
      Array.isArray(event.tdTypes) && event.tdTypes.length ? event.tdTypes.join(', ') : ''
    ].filter(Boolean).join(' • ');
    subtitle.textContent = details || 'Touchdown scored';

    card.appendChild(title);
    card.appendChild(subtitle);
    container.prepend(card);

    while (container.children.length > 4) {
      container.removeChild(container.lastElementChild);
    }

    if (reducedMotion) {
      card.classList.add('show');
    } else {
      requestAnimationFrame(() => {
        card.classList.add('show');
      });
    }

    const hideTimer = setTimeout(() => {
      if (reducedMotion) {
        card.remove();
      } else {
        card.classList.remove('show');
        card.classList.add('hide');
        const removeTimer = setTimeout(() => {
          card.remove();
        }, 360);
        state.tdAlertTimers.push(removeTimer);
      }
    }, duration);

    state.tdAlertTimers.push(hideTimer);
  }
}

function createLogoNode(team) {
  if (state.settings.overlay.showLogos && team.logo) {
    const src = escapeHtml(team.logo);
    const alt = escapeHtml(`${team.name} logo`);
    return `<img class="logo" src="${src}" alt="${alt}" loading="lazy" />`;
  }

  const text = escapeHtml(initials(team.name));
  return `<div class="logo logo-fallback" aria-hidden="true">${text}</div>`;
}

function createTeamRow(team, isLeading, sideLabel) {
  const changed = state.changedTeamKeys.has(team.key) ? 'score-pop' : '';
  const scoreDelta = state.scoreDeltaByTeamKey.get(team.key);
  const extra = [
    formatRecord(team.record, state.settings.overlay.showRecords),
    state.settings.overlay.showProjections && team.projected !== null ? `Proj ${formatScore(team.projected)}` : '',
    team.winProbability !== null && team.winProbability !== undefined ? `Win ${Number(team.winProbability).toFixed(1)}%` : ''
  ].filter(Boolean).join(' • ');

  return `
    <article class="team-row ${isLeading ? 'leading' : ''}">
      ${createLogoNode(team)}
      <div class="team-meta">
        <p class="team-name">${escapeHtml(team.name)}</p>
        <p class="team-manager">${escapeHtml(sideLabel)}: ${escapeHtml(team.manager || 'Manager')}</p>
        ${extra ? `<p class="team-extra">${escapeHtml(extra)}</p>` : ''}
      </div>
      <div class="team-score ${changed}">
        <span>${formatScore(team.points)}</span>
        ${(state.settings.overlay.showScoreDelta && scoreDelta !== undefined && scoreDelta !== null)
    ? `<small class="score-delta ${scoreDelta >= 0 ? 'up' : 'down'}">${scoreDelta >= 0 ? '+' : ''}${Number(scoreDelta).toFixed(2)}</small>`
    : ''}
      </div>
    </article>
  `;
}

function createBadgeList(matchup) {
  const badges = [`<span class="badge ${statusClass(matchup.status)}">${matchup.status}</span>`];

  if (matchup.isGameOfWeek) {
    badges.push('<span class="badge">Game of the Week</span>');
  }

  if (matchup.isClosest) {
    badges.push('<span class="badge">Closest</span>');
  }

  if (matchup.isUpset) {
    badges.push('<span class="badge">Upset Alert</span>');
  }

  if (isRedzoneLockActive() && state.redzoneFocusIds.has(matchup.id)) {
    badges.push('<span class="badge">Redzone Focus</span>');
  }

  return badges.join('');
}

function createMatchupCard(matchup) {
  const a = matchup.teamA;
  const b = matchup.teamB;
  const aLeads = (a.points ?? 0) >= (b.points ?? 0);

  const cardClasses = [
    'matchup-card',
    matchup.status === 'final' ? 'final' : '',
    matchup.isClosest ? 'closest' : '',
    matchup.isUpset ? 'upset' : ''
  ].filter(Boolean).join(' ');

  return `
    <section class="${cardClasses}">
      <header class="matchup-head">
        <div class="badges">${createBadgeList(matchup)}</div>
        <span class="week-label">Week ${matchup.week}</span>
      </header>

      ${createTeamRow(a, aLeads, 'Home')}
      ${createTeamRow(b, !aLeads, 'Away')}

      ${state.settings.overlay.showProjections
    ? `<div class="projection"><span>Projected Winner: ${escapeHtml(matchup.projectedWinnerKey === a.key ? a.name : b.name)}</span><span>Diff ${formatScore(matchup.scoreDiff)}</span></div>`
    : ''}
    </section>
  `;
}

function createStoryCard(story) {
  return `
    <section class="matchup-card story-card">
      <header class="matchup-head">
        <div class="badges">
          <span class="badge">Story</span>
          ${story.badge ? `<span class="badge">${escapeHtml(story.badge)}</span>` : ''}
        </div>
        <span class="week-label">Weekly Pulse</span>
      </header>
      <article class="story-content">
        <p class="story-title">${escapeHtml(story.title || 'Matchup Story')}</p>
        <p class="story-body">${escapeHtml(story.body || '')}</p>
      </article>
    </section>
  `;
}

function buildStoryCards(matchups) {
  const stories = [];
  if (!matchups.length) {
    return stories;
  }

  const highest = matchups.flatMap((matchup) => ([
    { matchup, team: matchup.teamA },
    { matchup, team: matchup.teamB }
  ])).sort((a, b) => Number(b.team?.points || 0) - Number(a.team?.points || 0))[0];

  if (highest?.team) {
    stories.push({
      id: 'story-highest',
      badge: 'Top Score',
      title: `${highest.team.name} is pacing the slate`,
      body: `${formatScore(highest.team.points)} fantasy points with ${highest.team.manager || 'manager'} driving the surge.`
    });
  }

  const closest = [...matchups]
    .filter((matchup) => matchup.status !== 'final')
    .sort((a, b) => Number(a.scoreDiff || 9999) - Number(b.scoreDiff || 9999))[0];
  if (closest) {
    stories.push({
      id: 'story-closest',
      badge: 'Closest',
      title: `${closest.teamA.name} vs ${closest.teamB.name} is razor thin`,
      body: `Only ${formatScore(closest.scoreDiff)} points apart right now.`
    });
  }

  const leadSwing = state.recentLeadChanges[0];
  if (leadSwing) {
    const matchup = matchups.find((item) => item.id === leadSwing.matchupId);
    if (matchup) {
      const team = matchup.teamA.key === leadSwing.newLeaderKey ? matchup.teamA : matchup.teamB;
      stories.push({
        id: `story-swing-${leadSwing.matchupId}`,
        badge: 'Momentum',
        title: `${team.name} just flipped the lead`,
        body: `${team.manager || 'Manager'} has the matchup edge in the latest swing.`
      });
    }
  }

  const playerSurge = state.recentPlayerScoreChanges.find((row) => Number(row.delta) > 0);
  if (playerSurge) {
    stories.push({
      id: `story-player-${playerSurge.playerKey}`,
      badge: 'Player Surge',
      title: `${playerSurge.playerName} is climbing fast`,
      body: `${playerSurge.fantasyTeamName} gained +${Number(playerSurge.delta).toFixed(2)} from this player on the last scan.`
    });
  }

  return stories.slice(0, 3);
}

function getRotationItems() {
  const matchups = getRotatingMatchups();
  const base = matchups.map((matchup) => ({ kind: 'matchup', id: matchup.id, matchup }));
  if (!base.length) {
    return base;
  }

  const twoUp = Boolean(state.settings?.overlay?.twoMatchupLayout);
  const storyConfig = getStoryCardConfig();
  if (twoUp || !storyConfig.enabled) {
    return base;
  }

  const stories = buildStoryCards(matchups);
  if (!stories.length) {
    return base;
  }

  const interval = Math.max(1, Number(storyConfig.interval || 2));
  const merged = [];
  let storyIndex = 0;

  for (let i = 0; i < base.length; i += 1) {
    merged.push(base[i]);
    if ((i + 1) % interval === 0 && storyIndex < stories.length) {
      merged.push({ kind: 'story', id: stories[storyIndex].id, story: stories[storyIndex] });
      storyIndex += 1;
    }
  }

  if (!merged.some((item) => item.kind === 'story')) {
    merged.push({ kind: 'story', id: stories[0].id, story: stories[0] });
  }

  return merged;
}

function renderCarousel() {
  const stage = $('carouselStage');
  const tickerStage = $('tickerStage');
  tickerStage.classList.add('hidden');
  stage.classList.remove('hidden');

  const items = getRotationItems();
  const matchups = getRotatingMatchups();

  if (!items.length) {
    stage.innerHTML = '<div class="matchup-wrap"><section class="matchup-card"><p>No matchup data available.</p></section></div>';
    return;
  }

  const twoUp = state.settings.overlay.twoMatchupLayout && matchups.length > 1;

  if (twoUp) {
    const m1 = matchups[state.activeIndex % matchups.length];
    const m2 = matchups[(state.activeIndex + 1) % matchups.length];

    stage.innerHTML = `
      <div class="matchup-wrap two-up">
        ${createMatchupCard(m1)}
        ${createMatchupCard(m2)}
      </div>
    `;
  } else {
    const currentItem = items[state.activeIndex % items.length];
    stage.innerHTML = `
      <div class="matchup-wrap">
        ${currentItem.kind === 'story'
    ? createStoryCard(currentItem.story)
    : createMatchupCard(currentItem.matchup)}
      </div>
    `;
  }
}

function tickerText(matchup) {
  const a = matchup.teamA;
  const b = matchup.teamB;
  return `${escapeHtml(a.name)} ${formatScore(a.points)} - ${formatScore(b.points)} ${escapeHtml(b.name)}`;
}

function renderTickerMode() {
  const stage = $('tickerStage');
  const carouselStage = $('carouselStage');

  carouselStage.classList.add('hidden');
  stage.classList.remove('hidden');

  const matchups = state.payload?.matchups || [];

  if (!matchups.length) {
    stage.innerHTML = '<div class="ticker-track"><span class="ticker-item">No live data.</span></div>';
    return;
  }

  const items = [...matchups, ...matchups].map((matchup) => {
    const klass = ['ticker-item', matchup.isClosest ? 'closest' : '', matchup.isUpset ? 'upset' : ''].filter(Boolean).join(' ');
    return `<span class="${klass}">${tickerText(matchup)}</span>`;
  }).join('');

  stage.innerHTML = `<div class="ticker-track">${items}</div>`;
}

function renderFooterTicker() {
  const footer = $('footerTicker');

  if (!state.settings.overlay.showTicker || !state.payload?.matchups?.length) {
    footer.classList.add('hidden');
    footer.innerHTML = '';
    return;
  }

  const line = [...state.payload.matchups, ...state.payload.matchups]
    .map((m) => `${tickerText(m)} (${m.status.toUpperCase()})`)
    .join('    •    ');

  footer.classList.remove('hidden');
  footer.innerHTML = `<div class="line">${line}</div>`;
}

function render() {
  if (!state.settings) {
    return;
  }

  applyTheme(state.settings);
  setBodyClasses(state.settings);
  setDevUpdated(state.payload?.updatedAt || state.status?.lastSuccessAt);
  setDegradedIndicator(state.status);

  if (state.settings.overlay.mode === 'ticker') {
    renderTickerMode();
  } else {
    renderCarousel();
  }

  renderFooterTicker();

  window.setTimeout(() => {
    state.changedTeamKeys.clear();
  }, 800);
}

function stopRotation() {
  if (state.rotationTimer) {
    clearInterval(state.rotationTimer);
    state.rotationTimer = null;
  }
}

function nextMatchup() {
  const length = getRotationItems().length;
  if (!length) {
    return;
  }

  state.activeIndex = (state.activeIndex + 1) % length;
  if (state.settings.overlay.mode === 'carousel') {
    renderCarousel();
    renderFooterTicker();
  }
}

function startRotation() {
  stopRotation();

  if (!state.settings || state.settings.overlay.mode === 'ticker') {
    return;
  }

  const length = getRotationItems().length;
  if (length <= 1) {
    return;
  }

  const ms = Number(state.settings.overlay.rotationIntervalMs || 9000);
  state.rotationTimer = setInterval(nextMatchup, ms);
}

function onPayloadUpdate(payload, scoreChanges = [], tdEvents = [], leadChanges = [], upsetEvents = [], playerScoreChanges = []) {
  const previousRenderKey = state.payloadRenderKey;
  const nextRenderKey = computePayloadRenderKey(payload);
  const shouldRender = !state.payload || previousRenderKey !== nextRenderKey || scoreChanges.length > 0;

  state.payload = payload;
  state.payloadRenderKey = nextRenderKey;

  const length = getRotationItems().length;
  if (state.activeIndex >= length) {
    state.activeIndex = 0;
  }

  state.changedTeamKeys.clear();
  state.scoreDeltaByTeamKey.clear();
  for (const change of scoreChanges) {
    if (change.teamA?.from !== change.teamA?.to) {
      state.changedTeamKeys.add(change.teamA.key);
      state.scoreDeltaByTeamKey.set(change.teamA.key, Number(change.teamA.to || 0) - Number(change.teamA.from || 0));
    }
    if (change.teamB?.from !== change.teamB?.to) {
      state.changedTeamKeys.add(change.teamB.key);
      state.scoreDeltaByTeamKey.set(change.teamB.key, Number(change.teamB.to || 0) - Number(change.teamB.from || 0));
    }
  }

  primeRedzoneFocus({
    payload: state.payload,
    scoreChanges,
    tdEvents,
    leadChanges,
    upsetEvents
  });

  if (leadChanges.length) {
    state.recentLeadChanges = [...leadChanges, ...state.recentLeadChanges].slice(0, 20);
  }
  if (upsetEvents.length) {
    state.recentUpsetEvents = [...upsetEvents, ...state.recentUpsetEvents].slice(0, 20);
  }
  if (playerScoreChanges.length) {
    state.recentPlayerScoreChanges = [...playerScoreChanges, ...state.recentPlayerScoreChanges].slice(0, 40);
  }

  if (shouldRender) {
    render();
  }

  renderTdEvents(tdEvents);
  startRotation();
}

function connectSse() {
  const es = new EventSource('/events');
  state.eventSource = es;

  es.addEventListener('init', (event) => {
    const data = JSON.parse(event.data || '{}');
    state.settings = parseQueryOverrides(data.settings);
    state.status = data.status;
    onPayloadUpdate(data.payload || { matchups: [] }, [], [], [], [], []);
  });

  es.addEventListener('update', (event) => {
    const data = JSON.parse(event.data || '{}');
    state.status = data.status || state.status;
    onPayloadUpdate(
      data.payload || state.payload,
      data.scoreChanges || [],
      data.tdEvents || [],
      data.leadChanges || [],
      data.upsetEvents || [],
      data.playerScoreChanges || []
    );
  });

  es.addEventListener('status', (event) => {
    const data = JSON.parse(event.data || '{}');
    state.status = data;
    setDevUpdated(data.lastSuccessAt);
    setDegradedIndicator(data);
  });

  es.addEventListener('config', (event) => {
    const data = JSON.parse(event.data || '{}');
    if (data.settings) {
      state.settings = parseQueryOverrides(data.settings);
      if (!state.settings?.overlay?.autoRedzone?.enabled) {
        state.redzoneFocusIds.clear();
        state.redzoneLockUntil = 0;
      }
      render();
      renderTdEvents([]);
      startRotation();
    }
  });

  es.addEventListener('control', (event) => {
    const data = JSON.parse(event.data || '{}');
    if (data.action === 'next') {
      nextMatchup();
    }
  });

  es.onerror = () => {
    if (state.eventSource) {
      setDevUpdated(state.status?.lastSuccessAt || null);
    }
  };
}

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'n' || event.key === 'ArrowRight') {
    nextMatchup();
  }
});

connectSse();
