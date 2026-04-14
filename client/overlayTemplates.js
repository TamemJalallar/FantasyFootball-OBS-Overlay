(function setupOverlayTemplates(globalScope) {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
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

  function createLogoNode(team, settings) {
    if (settings?.overlay?.showLogos && team?.logo) {
      const src = escapeHtml(team.logo);
      const alt = escapeHtml(`${team.name} logo`);
      return `<img class="logo" src="${src}" alt="${alt}" loading="lazy" />`;
    }

    const text = escapeHtml(initials(team?.name));
    return `<div class="logo logo-fallback" aria-hidden="true">${text}</div>`;
  }

  function createTeamRow({
    team,
    isLeading,
    sideLabel,
    settings,
    changedTeamKeys,
    scoreDeltaByTeamKey
  }) {
    const changed = changedTeamKeys?.has(team?.key) ? 'score-pop' : '';
    const scoreDelta = scoreDeltaByTeamKey?.get(team?.key);

    const extra = [
      formatRecord(team?.record, settings?.overlay?.showRecords),
      settings?.overlay?.showProjections && team?.projected !== null ? `Proj ${formatScore(team.projected)}` : '',
      team?.winProbability !== null && team?.winProbability !== undefined ? `Win ${Number(team.winProbability).toFixed(1)}%` : ''
    ].filter(Boolean).join(' • ');

    return `
      <article class="team-row ${isLeading ? 'leading' : ''}">
        <p class="team-name-top">${escapeHtml(team?.name)}</p>
        ${createLogoNode(team, settings)}
        <div class="team-meta">
          <p class="team-name">${escapeHtml(team?.name)}</p>
          <p class="team-manager">${escapeHtml(sideLabel)}: ${escapeHtml(team?.manager || 'Manager')}</p>
          ${extra ? `<p class="team-extra">${escapeHtml(extra)}</p>` : ''}
        </div>
        <div class="team-score ${changed}">
          <span>${formatScore(team?.points)}</span>
          ${(settings?.overlay?.showScoreDelta && scoreDelta !== undefined && scoreDelta !== null)
    ? `<small class="score-delta ${scoreDelta >= 0 ? 'up' : 'down'}">${scoreDelta >= 0 ? '+' : ''}${Number(scoreDelta).toFixed(2)}</small>`
    : ''}
        </div>
      </article>
    `;
  }

  function createBadgeList({ matchup, redzoneLockActive = false, redzoneFocusIds = new Set() }) {
    const badges = [`<span class="badge ${statusClass(matchup?.status)}">${matchup?.status}</span>`];

    if (matchup?.isGameOfWeek) {
      badges.push('<span class="badge">Game of the Week</span>');
    }

    if (matchup?.isClosest) {
      badges.push('<span class="badge">Closest</span>');
    }

    if (matchup?.isUpset) {
      badges.push('<span class="badge">Upset Alert</span>');
    }

    if (redzoneLockActive && redzoneFocusIds?.has(matchup?.id)) {
      badges.push('<span class="badge">Redzone Focus</span>');
    }

    return badges.join('');
  }

  function createMatchupCard({
    matchup,
    settings,
    changedTeamKeys,
    scoreDeltaByTeamKey,
    redzoneLockActive = false,
    redzoneFocusIds = new Set()
  }) {
    const a = matchup?.teamA || {};
    const b = matchup?.teamB || {};
    const aLeads = (a.points ?? 0) >= (b.points ?? 0);

    const cardClasses = [
      'matchup-card',
      matchup?.status === 'final' ? 'final' : '',
      matchup?.isClosest ? 'closest' : '',
      matchup?.isUpset ? 'upset' : ''
    ].filter(Boolean).join(' ');

    return `
      <section class="${cardClasses}">
        <header class="matchup-head">
          <div class="badges">${createBadgeList({ matchup, redzoneLockActive, redzoneFocusIds })}</div>
          <span class="week-label">Week ${matchup?.week}</span>
        </header>

        ${createTeamRow({
    team: a,
    isLeading: aLeads,
    sideLabel: 'Home',
    settings,
    changedTeamKeys,
    scoreDeltaByTeamKey
  })}
        ${createTeamRow({
    team: b,
    isLeading: !aLeads,
    sideLabel: 'Away',
    settings,
    changedTeamKeys,
    scoreDeltaByTeamKey
  })}

        ${settings?.overlay?.showProjections
    ? `<div class="projection"><span>Projected Winner: ${escapeHtml(matchup?.projectedWinnerKey === a.key ? a.name : b.name)}</span><span>Diff ${formatScore(matchup?.scoreDiff)}</span></div>`
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
            ${story?.badge ? `<span class="badge">${escapeHtml(story.badge)}</span>` : ''}
          </div>
          <span class="week-label">Weekly Pulse</span>
        </header>
        <article class="story-content">
          <p class="story-title">${escapeHtml(story?.title || 'Matchup Story')}</p>
          <p class="story-body">${escapeHtml(story?.body || '')}</p>
        </article>
      </section>
    `;
  }

  const exported = {
    escapeHtml,
    formatScore,
    formatRecord,
    initials,
    statusClass,
    createMatchupCard,
    createStoryCard
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  globalScope.OverlayTemplates = exported;
})(typeof window !== 'undefined' ? window : globalThis);
