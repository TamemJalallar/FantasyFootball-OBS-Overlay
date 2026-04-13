const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createMatchupCard,
  createStoryCard
} = require('../client/overlayTemplates');

function fixtureSettings() {
  return {
    overlay: {
      showLogos: false,
      showRecords: true,
      showProjections: true,
      showScoreDelta: true
    }
  };
}

function fixtureMatchup() {
  return {
    id: '1',
    week: 7,
    status: 'live',
    isClosest: true,
    isUpset: false,
    isGameOfWeek: true,
    scoreDiff: 3.4,
    projectedWinnerKey: 'team-a',
    teamA: {
      key: 'team-a',
      name: 'Sunday Surge',
      manager: 'Tamem',
      record: '4-2',
      projected: 121.4,
      winProbability: 62.3,
      points: 109.2
    },
    teamB: {
      key: 'team-b',
      name: 'Gridiron Reapers',
      manager: 'Alex',
      record: '3-3',
      projected: 117.8,
      winProbability: 37.7,
      points: 105.8
    }
  };
}

function loadSnapshot(name) {
  return fs.readFileSync(path.resolve(__dirname, 'snapshots', name), 'utf8').trim();
}

function normalizeMarkup(html) {
  return String(html || '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();
}

test('matchup card markup snapshot', () => {
  const html = createMatchupCard({
    matchup: fixtureMatchup(),
    settings: fixtureSettings(),
    changedTeamKeys: new Set(['team-a']),
    scoreDeltaByTeamKey: new Map([
      ['team-a', 6.4],
      ['team-b', -1.2]
    ]),
    redzoneLockActive: true,
    redzoneFocusIds: new Set(['1'])
  });

  assert.equal(normalizeMarkup(html), loadSnapshot('matchup-card.snap'));
});

test('story card markup snapshot', () => {
  const html = createStoryCard({
    id: 'story-closest',
    badge: 'Closest',
    title: 'Sunday Surge vs Gridiron Reapers is razor thin',
    body: 'Only 3.4 points apart right now.'
  });

  assert.equal(normalizeMarkup(html), loadSnapshot('story-card.snap'));
});
