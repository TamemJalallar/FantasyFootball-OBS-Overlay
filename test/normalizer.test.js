const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeYahooMatchups } = require('../server/normalizer');

function buildFixtures() {
  const scoreboardPayload = {
    fantasy_content: {
      league: {
        league_key: '449.l.12345',
        league_id: '12345',
        name: 'Test League',
        season: '2026',
        scoreboard: {
          week: '5',
          matchups: {
            matchup: [
              {
                matchup_id: '1',
                week: '5',
                status: 'midevent',
                winner_team_key: '449.l.12345.t.1',
                teams: {
                  team: [
                    {
                      team_key: '449.l.12345.t.1',
                      team_id: '1',
                      name: 'Underdogs United',
                      managers: { manager: { nickname: 'Tamem' } },
                      team_points: { total: '102.34' },
                      team_projected_points: { total: '95.10' },
                      win_probability: '58.2'
                    },
                    {
                      team_key: '449.l.12345.t.2',
                      team_id: '2',
                      name: 'Projected Favorite',
                      managers: { manager: { nickname: 'Alex' } },
                      team_points: { total: '95.12' },
                      team_projected_points: { total: '111.50' }
                    }
                  ]
                }
              },
              {
                matchup_id: '2',
                week: '5',
                status: 'postevent',
                winner_team_key: '449.l.12345.t.3',
                teams: {
                  team: [
                    {
                      team_key: '449.l.12345.t.3',
                      team_id: '3',
                      name: 'Final Winner',
                      managers: { manager: { nickname: 'Sam' } },
                      team_points: { total: '121.00' },
                      team_projected_points: { total: '120.90' }
                    },
                    {
                      team_key: '449.l.12345.t.4',
                      team_id: '4',
                      name: 'Final Loser',
                      managers: { manager: { nickname: 'Rae' } },
                      team_points: { total: '114.55' },
                      team_projected_points: { total: '116.00' }
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    }
  };

  const standingsPayload = {
    fantasy_content: {
      league: {
        standings: {
          teams: {
            team: [
              {
                team_key: '449.l.12345.t.1',
                team_standings: { outcome_totals: { wins: '3', losses: '1', ties: '0' } }
              },
              {
                team_key: '449.l.12345.t.2',
                team_standings: { outcome_totals: { wins: '1', losses: '3', ties: '0' } }
              },
              {
                team_key: '449.l.12345.t.3',
                team_standings: { outcome_totals: { wins: '4', losses: '0', ties: '0' } }
              },
              {
                team_key: '449.l.12345.t.4',
                team_standings: { outcome_totals: { wins: '2', losses: '2', ties: '0' } }
              }
            ]
          }
        }
      }
    }
  };

  const settings = {
    league: {
      leagueId: '12345',
      season: 2026,
      week: 'current',
      teamNameOverrides: {
        '449.l.12345.t.1': 'Rebranded Underdogs'
      }
    },
    overlay: {
      gameOfWeekMatchupId: '2'
    }
  };

  return { scoreboardPayload, standingsPayload, settings };
}

test('normalizeYahooMatchups maps payload into overlay-friendly shape', () => {
  const { scoreboardPayload, standingsPayload, settings } = buildFixtures();
  const normalized = normalizeYahooMatchups({ scoreboardPayload, standingsPayload, settings });

  assert.equal(normalized.league.source, 'yahoo');
  assert.equal(normalized.league.leagueKey, '449.l.12345');
  assert.equal(normalized.league.week, 5);
  assert.equal(normalized.matchups.length, 2);

  const live = normalized.matchups.find((m) => m.id === '1');
  const final = normalized.matchups.find((m) => m.id === '2');

  assert.ok(live);
  assert.ok(final);

  assert.equal(live.status, 'live');
  assert.equal(live.isLive, true);
  assert.equal(live.teamA.name, 'Rebranded Underdogs');
  assert.equal(live.teamA.record, '3-1');
  assert.equal(live.teamA.winProbability, 58.2);
  assert.equal(live.isUpset, true);
  assert.equal(live.isClosest, true);

  assert.equal(final.status, 'final');
  assert.equal(final.isFinal, true);
  assert.equal(final.isGameOfWeek, true);
});
