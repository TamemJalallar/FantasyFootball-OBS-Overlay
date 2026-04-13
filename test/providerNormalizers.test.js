const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeEspnMatchups,
  normalizeSleeperMatchups
} = require('../server/normalizer');

test('normalizeEspnMatchups maps ESPN payload into overlay model', () => {
  const leaguePayload = {
    id: 12345,
    seasonId: 2026,
    status: {
      currentMatchupPeriod: 6
    },
    settings: {
      name: 'ESPN Test League'
    },
    members: [
      { id: 'u1', displayName: 'Tamem' },
      { id: 'u2', displayName: 'Alex' }
    ],
    teams: [
      {
        id: 1,
        location: 'Sunday',
        nickname: 'Surge',
        owners: ['u1'],
        logo: 'https://example.com/t1.png',
        record: { overall: { wins: 4, losses: 1, ties: 0 } }
      },
      {
        id: 2,
        location: 'Gridiron',
        nickname: 'Reapers',
        owners: ['u2'],
        logo: 'https://example.com/t2.png',
        record: { overall: { wins: 2, losses: 3, ties: 0 } }
      }
    ],
    schedule: [
      {
        id: 7001,
        matchupPeriodId: 6,
        winner: 'UNDECIDED',
        home: {
          teamId: 1,
          totalPoints: 122.5,
          totalProjectedPoints: 131.2
        },
        away: {
          teamId: 2,
          totalPoints: 118.8,
          totalProjectedPoints: 124.4
        }
      }
    ]
  };

  const settings = {
    espn: { week: 'current' },
    league: { teamNameOverrides: {} },
    overlay: { gameOfWeekMatchupId: '7001' }
  };

  const normalized = normalizeEspnMatchups({ leaguePayload, settings });

  assert.equal(normalized.league.source, 'espn');
  assert.equal(normalized.league.week, 6);
  assert.equal(normalized.matchups.length, 1);

  const matchup = normalized.matchups[0];
  assert.equal(matchup.id, '7001');
  assert.equal(matchup.status, 'live');
  assert.equal(matchup.teamA.name, 'Sunday Surge');
  assert.equal(matchup.teamA.manager, 'Tamem');
  assert.equal(matchup.teamA.record, '4-1');
  assert.equal(matchup.teamB.record, '2-3');
  assert.equal(matchup.isGameOfWeek, true);
  assert.equal(matchup.isClosest, true);
});

test('normalizeSleeperMatchups maps Sleeper payload into overlay model', () => {
  const leaguePayload = {
    league_id: '9999',
    name: 'Sleeper Test League',
    season: '2026'
  };

  const usersPayload = [
    {
      user_id: 'owner-1',
      display_name: 'Tamem',
      avatar: 'abc123',
      metadata: { team_name: 'Sunday Surge' }
    },
    {
      user_id: 'owner-2',
      display_name: 'Alex',
      avatar: 'def456',
      metadata: { team_name: 'Gridiron Reapers' }
    }
  ];

  const rostersPayload = [
    {
      roster_id: 1,
      owner_id: 'owner-1',
      settings: { wins: 5, losses: 1, ties: 0 }
    },
    {
      roster_id: 2,
      owner_id: 'owner-2',
      settings: { wins: 3, losses: 3, ties: 0 }
    }
  ];

  const matchupsPayload = [
    {
      matchup_id: 3,
      roster_id: 1,
      points: 111.24
    },
    {
      matchup_id: 3,
      roster_id: 2,
      points: 109.18
    }
  ];

  const statePayload = {
    week: 7
  };

  const settings = {
    sleeper: { week: 'current' },
    league: { teamNameOverrides: {} },
    overlay: { gameOfWeekMatchupId: 'sleeper-matchup-7-3' }
  };

  const normalized = normalizeSleeperMatchups({
    leaguePayload,
    usersPayload,
    rostersPayload,
    matchupsPayload,
    statePayload,
    settings
  });

  assert.equal(normalized.league.source, 'sleeper');
  assert.equal(normalized.league.week, 7);
  assert.equal(normalized.matchups.length, 1);

  const matchup = normalized.matchups[0];
  assert.equal(matchup.id, 'sleeper-matchup-7-3');
  assert.equal(matchup.status, 'live');
  assert.equal(matchup.teamA.name, 'Sunday Surge');
  assert.equal(matchup.teamA.manager, 'Tamem');
  assert.equal(matchup.teamA.record, '5-1');
  assert.equal(matchup.teamA.logo, 'https://sleepercdn.com/avatars/abc123');
  assert.equal(matchup.teamB.record, '3-3');
  assert.equal(matchup.isGameOfWeek, true);
  assert.equal(matchup.isClosest, true);
});
