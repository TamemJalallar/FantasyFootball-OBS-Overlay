const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../server/dataService');

const {
  isTouchdownLabel,
  computeTdEventsFromStates,
  computePlayerScoreChangesFromStates,
  serializeTdState,
  deserializeTdState,
  detectScoreChanges,
  detectLeadChanges,
  detectUpsetStarts,
  detectFinalized,
  computeScheduleWindowState
} = __testables;

test('isTouchdownLabel recognizes touchdown labels', () => {
  assert.equal(isTouchdownLabel('Passing Touchdowns'), true);
  assert.equal(isTouchdownLabel('Receiving TD'), true);
  assert.equal(isTouchdownLabel('Rushing Yards'), false);
});

test('serializeTdState and deserializeTdState round-trip map values', () => {
  const source = new Map([
    ['team1|player1', { playerKey: 'player1', totalTouchdowns: 2, tdBreakdown: { '7': 2 } }]
  ]);

  const serialized = serializeTdState({
    leagueKey: '449.l.12345',
    week: 6,
    state: source
  });

  const restored = deserializeTdState(serialized);
  assert.equal(restored.leagueKey, '449.l.12345');
  assert.equal(restored.week, 6);
  assert.equal(restored.state.size, 1);
  assert.deepEqual(restored.state.get('team1|player1'), source.get('team1|player1'));
});

test('computeTdEventsFromStates emits touchdown deltas', () => {
  const previousState = new Map([
    ['team1|player1', {
      playerKey: 'player1',
      playerName: 'Receiver One',
      teamKey: 'team1',
      points: 14,
      totalTouchdowns: 1,
      tdBreakdown: { '7': 1 },
      tdTypes: ['Receiving TD']
    }]
  ]);

  const currentState = new Map([
    ['team1|player1', {
      playerKey: 'player1',
      playerName: 'Receiver One',
      teamKey: 'team1',
      points: 20,
      totalTouchdowns: 2,
      tdBreakdown: { '7': 2 },
      tdTypes: ['Receiving TD']
    }]
  ]);

  const events = computeTdEventsFromStates({
    previousState,
    currentState,
    teamMeta: {
      team1: {
        matchupId: 'matchup-1',
        teamName: 'Sunday Surge',
        manager: 'Tamem'
      }
    },
    tdStatLabels: {
      '7': 'Receiving TD'
    },
    now: new Date('2026-04-07T12:00:00.000Z')
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].touchdownDelta, 1);
  assert.equal(events[0].playerPointDelta, 6);
  assert.equal(events[0].fantasyTeamName, 'Sunday Surge');
  assert.deepEqual(events[0].tdTypes, ['Receiving TD']);
});

test('computePlayerScoreChangesFromStates emits per-player scoring deltas', () => {
  const previousState = new Map([
    ['team1|player1', {
      playerKey: 'player1',
      playerName: 'Player One',
      teamKey: 'team1',
      points: 8
    }],
    ['team1|player2', {
      playerKey: 'player2',
      playerName: 'Player Two',
      teamKey: 'team1',
      points: 4
    }]
  ]);

  const currentState = new Map([
    ['team1|player1', {
      playerKey: 'player1',
      playerName: 'Player One',
      teamKey: 'team1',
      points: 14
    }],
    ['team1|player2', {
      playerKey: 'player2',
      playerName: 'Player Two',
      teamKey: 'team1',
      points: 4
    }]
  ]);

  const rows = computePlayerScoreChangesFromStates({
    previousState,
    currentState,
    teamMeta: {
      team1: { matchupId: 'm1', teamName: 'Alpha' }
    },
    now: new Date('2026-04-11T12:00:00.000Z')
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].playerName, 'Player One');
  assert.equal(rows[0].delta, 6);
  assert.equal(rows[0].fantasyTeamName, 'Alpha');
});

test('detectScoreChanges only returns changed matchups', () => {
  const previousPayload = {
    matchups: [
      {
        id: '1',
        teamA: { key: 'a1', points: 98.5 },
        teamB: { key: 'b1', points: 101.2 }
      },
      {
        id: '2',
        teamA: { key: 'a2', points: 88.1 },
        teamB: { key: 'b2', points: 90.4 }
      }
    ]
  };

  const nextPayload = {
    matchups: [
      {
        id: '1',
        teamA: { key: 'a1', points: 100.3 },
        teamB: { key: 'b1', points: 101.2 }
      },
      {
        id: '2',
        teamA: { key: 'a2', points: 88.1 },
        teamB: { key: 'b2', points: 90.4 }
      }
    ]
  };

  const changes = detectScoreChanges(previousPayload, nextPayload);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].matchupId, '1');
  assert.equal(changes[0].teamA.from, 98.5);
  assert.equal(changes[0].teamA.to, 100.3);
});

test('detectLeadChanges identifies new leader transitions', () => {
  const previousPayload = {
    matchups: [
      {
        id: 'm1',
        status: 'live',
        teamA: { key: 'a', points: 102.5 },
        teamB: { key: 'b', points: 103.2 }
      }
    ]
  };

  const nextPayload = {
    matchups: [
      {
        id: 'm1',
        status: 'live',
        teamA: { key: 'a', points: 106.5 },
        teamB: { key: 'b', points: 103.2 }
      }
    ]
  };

  const changes = detectLeadChanges(previousPayload, nextPayload);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].previousLeaderKey, 'b');
  assert.equal(changes[0].newLeaderKey, 'a');
});

test('detectUpsetStarts only emits newly upset matchups', () => {
  const previousPayload = {
    matchups: [
      {
        id: 'm1',
        isUpset: false,
        status: 'live'
      }
    ]
  };

  const nextPayload = {
    matchups: [
      {
        id: 'm1',
        isUpset: true,
        status: 'live',
        teamA: { key: 'a' },
        teamB: { key: 'b' }
      }
    ]
  };

  const upsetEvents = detectUpsetStarts(previousPayload, nextPayload);
  assert.equal(upsetEvents.length, 1);
  assert.equal(upsetEvents[0].matchupId, 'm1');
});

test('detectFinalized emits newly completed matchups', () => {
  const previousPayload = {
    matchups: [
      {
        id: 'm1',
        isFinal: false,
        winnerKey: null
      }
    ]
  };

  const nextPayload = {
    matchups: [
      {
        id: 'm1',
        isFinal: true,
        winnerKey: 'team-a',
        teamA: { key: 'team-a' },
        teamB: { key: 'team-b' }
      }
    ]
  };

  const finals = detectFinalized(previousPayload, nextPayload);
  assert.equal(finals.length, 1);
  assert.equal(finals[0].matchupId, 'm1');
  assert.equal(finals[0].winnerKey, 'team-a');
});

test('computeScheduleWindowState is active during configured game window', () => {
  const state = computeScheduleWindowState({
    enabled: true,
    timezone: 'UTC',
    gameDays: ['sun'],
    gameWindowStartHour: 9,
    gameWindowEndHour: 24
  }, new Date('2026-10-18T15:00:00.000Z'));

  assert.equal(state.enabled, true);
  assert.equal(state.weekday, 'sun');
  assert.equal(state.active, true);
  assert.equal(state.inWindow, true);
});

test('computeScheduleWindowState is inactive outside game window', () => {
  const state = computeScheduleWindowState({
    enabled: true,
    timezone: 'UTC',
    gameDays: ['sun'],
    gameWindowStartHour: 9,
    gameWindowEndHour: 24
  }, new Date('2026-10-21T03:00:00.000Z'));

  assert.equal(state.weekday, 'wed');
  assert.equal(state.active, false);
});
