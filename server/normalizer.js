const { toArray, toNumber, safeString } = require('./utils');

function getIn(obj, path, fallback = null) {
  let current = obj;
  for (const segment of path) {
    if (current === null || current === undefined) {
      return fallback;
    }
    current = current[segment];
  }
  return current ?? fallback;
}

function parseFantasyRoot(payload) {
  return payload?.fantasy_content || payload || {};
}

function parseLeague(payload) {
  const root = parseFantasyRoot(payload);
  return root.league || {};
}

function parseMatchupStatus(rawStatus) {
  const status = safeString(rawStatus).toLowerCase();
  if (['postevent', 'final', 'ended'].includes(status)) {
    return 'final';
  }
  if (['midevent', 'live', 'inprogress'].includes(status)) {
    return 'live';
  }
  return 'upcoming';
}

function extractManagerName(teamNode) {
  const managerNode = getIn(teamNode, ['managers', 'manager']) || teamNode?.manager;
  const manager = toArray(managerNode)[0] || managerNode;

  return safeString(
    manager?.nickname || manager?.manager_name || manager?.guid || manager?.email || '',
    'Manager'
  );
}

function extractTeamLogo(teamNode) {
  const logosNode = getIn(teamNode, ['team_logos', 'team_logo']);
  const logo = toArray(logosNode)[0] || logosNode;
  return safeString(logo?.url, null);
}

function extractRecord(teamNode, recordsByTeamKey) {
  const teamKey = safeString(teamNode?.team_key, '');
  if (teamKey && recordsByTeamKey[teamKey]) {
    return recordsByTeamKey[teamKey];
  }

  const wins = getIn(teamNode, ['team_standings', 'outcome_totals', 'wins']);
  const losses = getIn(teamNode, ['team_standings', 'outcome_totals', 'losses']);
  const ties = getIn(teamNode, ['team_standings', 'outcome_totals', 'ties']);

  if (wins === null || losses === null) {
    return null;
  }

  const tieNum = Number(ties || 0);
  return tieNum > 0 ? `${wins}-${losses}-${tieNum}` : `${wins}-${losses}`;
}

function findProb(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if (node.win_probability !== undefined) {
    return toNumber(node.win_probability, null);
  }

  for (const key of Object.keys(node)) {
    const value = node[key];
    if (typeof value === 'object') {
      const nested = findProb(value);
      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
}

function normalizeTeam(teamNode, recordsByTeamKey, teamNameOverrides = {}) {
  const teamKey = safeString(teamNode?.team_key, '');
  const rawName = safeString(teamNode?.name, 'Unknown Team');

  return {
    id: safeString(teamNode?.team_id, teamKey || rawName),
    key: teamKey,
    name: teamNameOverrides[teamKey] || rawName,
    manager: extractManagerName(teamNode),
    logo: extractTeamLogo(teamNode),
    points: toNumber(getIn(teamNode, ['team_points', 'total']), null),
    projected: toNumber(getIn(teamNode, ['team_projected_points', 'total']), null),
    record: extractRecord(teamNode, recordsByTeamKey),
    winProbability: findProb(teamNode)
  };
}

function parseRecordsMap(standingsPayload) {
  const league = parseLeague(standingsPayload);
  const teams = toArray(getIn(league, ['standings', 'teams', 'team'], []));

  const byTeamKey = {};
  for (const team of teams) {
    const teamKey = safeString(team?.team_key, '');
    if (!teamKey) {
      continue;
    }

    const wins = getIn(team, ['team_standings', 'outcome_totals', 'wins']);
    const losses = getIn(team, ['team_standings', 'outcome_totals', 'losses']);
    const ties = Number(getIn(team, ['team_standings', 'outcome_totals', 'ties'], 0));

    if (wins !== null && losses !== null) {
      byTeamKey[teamKey] = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
    }
  }

  return byTeamKey;
}

function markClosestLiveMatchup(matchups) {
  const closest = [...matchups]
    .filter((m) => m.isLive)
    .sort((a, b) => Math.abs((a.teamA.points ?? 0) - (a.teamB.points ?? 0)) - Math.abs((b.teamA.points ?? 0) - (b.teamB.points ?? 0)))[0];

  if (closest) {
    closest.isClosest = true;
  }
}

function parseConfiguredWeek(rawValue, fallbackWeek) {
  if (rawValue === 'current') {
    return Number(fallbackWeek || 1);
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return Number(fallbackWeek || 1);
  }

  return numeric;
}

function normalizeYahooMatchups({ scoreboardPayload, standingsPayload, settings }) {
  const leagueNode = parseLeague(scoreboardPayload);
  const recordsByTeamKey = parseRecordsMap(standingsPayload);
  const matchupNodes = toArray(getIn(leagueNode, ['scoreboard', 'matchups', 'matchup'], []));
  const overrides = settings?.league?.teamNameOverrides || {};

  const normalizedMatchups = matchupNodes
    .map((node, idx) => {
      const teams = toArray(getIn(node, ['teams', 'team'], [])).slice(0, 2);
      if (teams.length < 2) {
        return null;
      }

      const teamA = normalizeTeam(teams[0], recordsByTeamKey, overrides);
      const teamB = normalizeTeam(teams[1], recordsByTeamKey, overrides);
      const matchupId = safeString(node.matchup_id, `${teamA.key}-vs-${teamB.key || idx}`);
      const status = parseMatchupStatus(node.status);
      const diff = (teamA.points ?? 0) - (teamB.points ?? 0);

      const projectedWinnerKey =
        (teamA.projected ?? Number.NEGATIVE_INFINITY) >= (teamB.projected ?? Number.NEGATIVE_INFINITY)
          ? teamA.key
          : teamB.key;

      return {
        id: matchupId,
        week: Number(node.week || getIn(leagueNode, ['scoreboard', 'week']) || settings?.league?.week || 1),
        status,
        isLive: status === 'live',
        isFinal: status === 'final',
        teamA,
        teamB,
        winnerKey: safeString(node.winner_team_key, diff >= 0 ? teamA.key : teamB.key),
        projectedWinnerKey,
        scoreDiff: Math.abs(Number(diff.toFixed(2))),
        isClose: Math.abs(diff) <= 8,
        isUpset:
          (teamA.projected !== null && teamB.projected !== null && teamA.projected < teamB.projected && diff > 0)
          || (teamA.projected !== null && teamB.projected !== null && teamB.projected < teamA.projected && diff < 0),
        isGameOfWeek: settings?.overlay?.gameOfWeekMatchupId === matchupId
      };
    })
    .filter(Boolean);

  markClosestLiveMatchup(normalizedMatchups);

  const league = {
    leagueKey: safeString(leagueNode.league_key, ''),
    leagueId: safeString(leagueNode.league_id, settings?.league?.leagueId || ''),
    name: safeString(leagueNode.name, 'Yahoo Fantasy League'),
    season: Number(leagueNode.season || settings?.league?.season || new Date().getFullYear()),
    week: Number(getIn(leagueNode, ['scoreboard', 'week']) || leagueNode.current_week || settings?.league?.week || 1),
    source: 'yahoo'
  };

  return {
    league,
    matchups: normalizedMatchups,
    updatedAt: new Date().toISOString()
  };
}

function buildEspnManagersById(payload) {
  const map = new Map();
  for (const member of toArray(payload?.members, [])) {
    const id = safeString(member?.id, '');
    if (!id) {
      continue;
    }

    const fullName = `${safeString(member?.firstName, '')} ${safeString(member?.lastName, '')}`.trim();
    const display = safeString(member?.displayName || fullName, id);
    map.set(id, display || 'Manager');
  }
  return map;
}

function buildEspnTeamsById(payload, settings) {
  const managersById = buildEspnManagersById(payload);
  const overrides = settings?.league?.teamNameOverrides || {};
  const leagueId = safeString(payload?.id, settings?.espn?.leagueId || settings?.league?.leagueId || '');
  const map = new Map();

  for (const team of toArray(payload?.teams, [])) {
    const teamId = Number(team?.id);
    if (!Number.isFinite(teamId)) {
      continue;
    }

    const key = `espn.l.${leagueId}.t.${teamId}`;
    const displayName = safeString(
      team?.name || `${safeString(team?.location, '')} ${safeString(team?.nickname, '')}`.trim() || team?.abbrev,
      `Team ${teamId}`
    );

    const ownerIds = toArray(team?.owners, []).map((owner) => safeString(owner, '')).filter(Boolean);
    const managerNames = ownerIds.map((id) => managersById.get(id)).filter(Boolean);

    const wins = Number(getIn(team, ['record', 'overall', 'wins'], null));
    const losses = Number(getIn(team, ['record', 'overall', 'losses'], null));
    const ties = Number(getIn(team, ['record', 'overall', 'ties'], 0));
    const hasRecord = Number.isFinite(wins) && Number.isFinite(losses);

    map.set(teamId, {
      id: safeString(teamId, key),
      key,
      name: overrides[key] || displayName,
      manager: managerNames.length ? managerNames.join(', ') : 'Manager',
      logo: safeString(team?.logo || toArray(team?.logos, [])[0]?.href || toArray(team?.logos, [])[0]?.url, null),
      points: null,
      projected: null,
      record: hasRecord ? (ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`) : null,
      winProbability: null
    });
  }

  return map;
}

function deriveEspnMatchupStatus({ matchupPeriodId, currentWeek, winner, homePoints, awayPoints }) {
  if (matchupPeriodId < currentWeek) {
    return 'final';
  }

  if (matchupPeriodId > currentWeek) {
    return 'upcoming';
  }

  const winnerUpper = safeString(winner, '').toUpperCase();
  if (winnerUpper && winnerUpper !== 'UNDECIDED') {
    return 'final';
  }

  if ((homePoints || 0) === 0 && (awayPoints || 0) === 0) {
    return 'upcoming';
  }

  return 'live';
}

function normalizeEspnMatchups({ leaguePayload, settings }) {
  const leagueId = safeString(leaguePayload?.id, settings?.espn?.leagueId || settings?.league?.leagueId || '');
  const season = Number(leaguePayload?.seasonId || settings?.espn?.season || settings?.league?.season || new Date().getFullYear());
  const currentWeek = Number(getIn(leaguePayload, ['status', 'currentMatchupPeriod'], leaguePayload?.scoringPeriodId || 1));
  const selectedWeek = parseConfiguredWeek(settings?.espn?.week ?? settings?.league?.week ?? 'current', currentWeek);

  const teamsById = buildEspnTeamsById(leaguePayload, settings);
  const matchupNodes = toArray(leaguePayload?.schedule, [])
    .filter((row) => Number(row?.matchupPeriodId || 0) === selectedWeek);

  const matchups = matchupNodes
    .map((row, idx) => {
      const home = row?.home || {};
      const away = row?.away || {};
      const homeTeamId = Number(home?.teamId);
      const awayTeamId = Number(away?.teamId);

      if (!Number.isFinite(homeTeamId) || !Number.isFinite(awayTeamId)) {
        return null;
      }

      const homeBase = teamsById.get(homeTeamId);
      const awayBase = teamsById.get(awayTeamId);
      if (!homeBase || !awayBase) {
        return null;
      }

      const homePoints = toNumber(home?.totalPoints, 0) || 0;
      const awayPoints = toNumber(away?.totalPoints, 0) || 0;
      const homeProjected = toNumber(home?.totalProjectedPoints, null);
      const awayProjected = toNumber(away?.totalProjectedPoints, null);

      const teamA = {
        ...homeBase,
        points: Number(homePoints.toFixed(2)),
        projected: homeProjected === null ? null : Number(homeProjected.toFixed(2)),
        winProbability: toNumber(home?.winProbability ?? home?.winPercentage, null)
      };

      const teamB = {
        ...awayBase,
        points: Number(awayPoints.toFixed(2)),
        projected: awayProjected === null ? null : Number(awayProjected.toFixed(2)),
        winProbability: toNumber(away?.winProbability ?? away?.winPercentage, null)
      };

      const status = deriveEspnMatchupStatus({
        matchupPeriodId: Number(row?.matchupPeriodId || selectedWeek),
        currentWeek,
        winner: row?.winner,
        homePoints,
        awayPoints
      });

      const diff = Number((teamA.points - teamB.points).toFixed(2));
      const winnerFlag = safeString(row?.winner, '').toUpperCase();
      const winnerKey = winnerFlag === 'HOME'
        ? teamA.key
        : (winnerFlag === 'AWAY' ? teamB.key : (diff >= 0 ? teamA.key : teamB.key));

      const projectedWinnerKey =
        (teamA.projected ?? Number.NEGATIVE_INFINITY) >= (teamB.projected ?? Number.NEGATIVE_INFINITY)
          ? teamA.key
          : teamB.key;

      const matchupId = safeString(row?.id, `espn-matchup-${selectedWeek}-${idx + 1}`);
      return {
        id: matchupId,
        week: selectedWeek,
        status,
        isLive: status === 'live',
        isFinal: status === 'final',
        teamA,
        teamB,
        winnerKey,
        projectedWinnerKey,
        scoreDiff: Math.abs(diff),
        isClose: Math.abs(diff) <= 8,
        isUpset:
          (teamA.projected !== null && teamB.projected !== null && teamA.projected < teamB.projected && diff > 0)
          || (teamA.projected !== null && teamB.projected !== null && teamB.projected < teamA.projected && diff < 0),
        isGameOfWeek: settings?.overlay?.gameOfWeekMatchupId === matchupId
      };
    })
    .filter(Boolean);

  markClosestLiveMatchup(matchups);

  return {
    league: {
      leagueKey: `espn.l.${leagueId}`,
      leagueId,
      name: safeString(getIn(leaguePayload, ['settings', 'name'], leaguePayload?.name), 'ESPN Fantasy League'),
      season,
      week: selectedWeek,
      source: 'espn'
    },
    matchups,
    updatedAt: new Date().toISOString()
  };
}

function buildSleeperUsersById(usersPayload) {
  const map = new Map();
  for (const user of toArray(usersPayload, [])) {
    const userId = safeString(user?.user_id, '');
    if (!userId) {
      continue;
    }

    map.set(userId, user);
  }
  return map;
}

function buildSleeperRostersById(rostersPayload) {
  const map = new Map();
  for (const roster of toArray(rostersPayload, [])) {
    const rosterId = Number(roster?.roster_id);
    if (!Number.isFinite(rosterId)) {
      continue;
    }

    map.set(rosterId, roster);
  }
  return map;
}

function buildSleeperTeam({ leagueId, roster, matchupEntry, usersById, settings }) {
  const overrides = settings?.league?.teamNameOverrides || {};
  const rosterId = Number(roster?.roster_id);
  const ownerId = safeString(toArray(roster?.owners, [])[0] || roster?.owner_id, '');
  const user = usersById.get(ownerId);

  const key = `sleeper.l.${leagueId}.r.${rosterId}`;
  const displayName = safeString(
    getIn(user, ['metadata', 'team_name'], user?.display_name || user?.username),
    `Roster ${rosterId}`
  );

  const wins = Number(getIn(roster, ['settings', 'wins'], null));
  const losses = Number(getIn(roster, ['settings', 'losses'], null));
  const ties = Number(getIn(roster, ['settings', 'ties'], 0));
  const hasRecord = Number.isFinite(wins) && Number.isFinite(losses);

  return {
    id: safeString(rosterId, key),
    key,
    name: overrides[key] || displayName,
    manager: safeString(user?.display_name || user?.username, 'Manager'),
    logo: user?.avatar ? `https://sleepercdn.com/avatars/${user.avatar}` : null,
    points: toNumber(matchupEntry?.points ?? matchupEntry?.custom_points, 0),
    projected: null,
    record: hasRecord ? (ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`) : null,
    winProbability: null
  };
}

function deriveSleeperStatus({ selectedWeek, currentWeek, pointsA, pointsB }) {
  if (selectedWeek < currentWeek) {
    return 'final';
  }

  if (selectedWeek > currentWeek) {
    return 'upcoming';
  }

  if ((pointsA || 0) === 0 && (pointsB || 0) === 0) {
    return 'upcoming';
  }

  return 'live';
}

function normalizeSleeperMatchups({ leaguePayload, usersPayload, rostersPayload, matchupsPayload, statePayload, settings }) {
  const leagueId = safeString(leaguePayload?.league_id, settings?.sleeper?.leagueId || settings?.league?.leagueId || '');
  const season = Number(leaguePayload?.season || settings?.sleeper?.season || settings?.league?.season || new Date().getFullYear());
  const currentWeek = Number(statePayload?.week || 1);
  const selectedWeek = parseConfiguredWeek(settings?.sleeper?.week ?? settings?.league?.week ?? 'current', currentWeek);

  const usersById = buildSleeperUsersById(usersPayload);
  const rostersById = buildSleeperRostersById(rostersPayload);

  const grouped = new Map();
  for (const row of toArray(matchupsPayload, [])) {
    const matchupId = Number(row?.matchup_id || 0);
    if (!Number.isFinite(matchupId) || matchupId <= 0) {
      continue;
    }

    const list = grouped.get(matchupId) || [];
    list.push(row);
    grouped.set(matchupId, list);
  }

  const matchups = [...grouped.entries()]
    .map(([matchupId, entries]) => {
      if (!Array.isArray(entries) || entries.length < 2) {
        return null;
      }

      const sides = [...entries]
        .sort((a, b) => Number(a?.roster_id || 0) - Number(b?.roster_id || 0))
        .slice(0, 2);

      const rosterA = rostersById.get(Number(sides[0]?.roster_id));
      const rosterB = rostersById.get(Number(sides[1]?.roster_id));
      if (!rosterA || !rosterB) {
        return null;
      }

      const teamA = buildSleeperTeam({
        leagueId,
        roster: rosterA,
        matchupEntry: sides[0],
        usersById,
        settings
      });

      const teamB = buildSleeperTeam({
        leagueId,
        roster: rosterB,
        matchupEntry: sides[1],
        usersById,
        settings
      });

      const pointsA = Number(toNumber(teamA.points, 0) || 0);
      const pointsB = Number(toNumber(teamB.points, 0) || 0);
      const diff = Number((pointsA - pointsB).toFixed(2));
      const status = deriveSleeperStatus({
        selectedWeek,
        currentWeek,
        pointsA,
        pointsB
      });

      const matchupKey = `sleeper-matchup-${selectedWeek}-${matchupId}`;
      return {
        id: matchupKey,
        week: selectedWeek,
        status,
        isLive: status === 'live',
        isFinal: status === 'final',
        teamA,
        teamB,
        winnerKey: diff >= 0 ? teamA.key : teamB.key,
        projectedWinnerKey: diff >= 0 ? teamA.key : teamB.key,
        scoreDiff: Math.abs(diff),
        isClose: Math.abs(diff) <= 8,
        isUpset: false,
        isGameOfWeek: settings?.overlay?.gameOfWeekMatchupId === matchupKey
      };
    })
    .filter(Boolean);

  markClosestLiveMatchup(matchups);

  return {
    league: {
      leagueKey: `sleeper.l.${leagueId}`,
      leagueId,
      name: safeString(leaguePayload?.name, 'Sleeper Fantasy League'),
      season,
      week: selectedWeek,
      source: 'sleeper'
    },
    matchups,
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  normalizeYahooMatchups,
  normalizeEspnMatchups,
  normalizeSleeperMatchups
};
