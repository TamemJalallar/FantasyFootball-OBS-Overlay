async function postJson(url, body) {
  if (!url) return false;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Webhook HTTP ${response.status}`);
  }

  return true;
}

function summarizeEvents({ scoreChanges = [], tdEvents = [], leadChanges = [], upsetEvents = [], finalEvents = [] }) {
  return {
    scoreChanges: scoreChanges.length,
    touchdowns: tdEvents.length,
    leadChanges: leadChanges.length,
    upsetEvents: upsetEvents.length,
    finalEvents: finalEvents.length
  };
}

function buildDiscordPayload({ leagueName, summary, tdEvents = [], scoreChanges = [] }) {
  const lines = [
    `Score changes: ${summary.scoreChanges}`,
    `Touchdowns: ${summary.touchdowns}`,
    `Lead changes: ${summary.leadChanges}`,
    `Upsets: ${summary.upsetEvents}`,
    `Finals: ${summary.finalEvents}`
  ];

  const topTd = tdEvents[0];
  const topScore = scoreChanges[0];

  return {
    username: 'Fantasy Overlay Bot',
    embeds: [
      {
        title: `${leagueName || 'Fantasy League'} Update`,
        description: lines.join('\n'),
        color: 0x2f6bff,
        fields: [
          topTd
            ? {
              name: 'Latest TD',
              value: `${topTd.playerName} (${topTd.fantasyTeamName}) +${Number(topTd.playerPointDelta || 0).toFixed(2)} pts`,
              inline: false
            }
            : null,
          topScore
            ? {
              name: 'Latest Matchup Swing',
              value: `${topScore.matchupId}: ${Number((topScore.teamA?.to || 0) - (topScore.teamA?.from || 0)).toFixed(2)} / ${Number((topScore.teamB?.to || 0) - (topScore.teamB?.from || 0)).toFixed(2)}`,
              inline: false
            }
            : null
        ].filter(Boolean),
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function buildSlackPayload({ leagueName, summary }) {
  return {
    text: `${leagueName || 'Fantasy League'} update: ${summary.scoreChanges} score changes, ${summary.touchdowns} TDs, ${summary.leadChanges} lead changes, ${summary.upsetEvents} upsets, ${summary.finalEvents} finals.`
  };
}

async function dispatchIntegrations({ logger, settings, payload, scoreChanges = [], tdEvents = [], leadChanges = [], upsetEvents = [], finalEvents = [] }) {
  const integrations = settings.integrations || {};
  if (!integrations.enabled) {
    return;
  }

  const shouldSend = (
    (integrations.sendTouchdowns && tdEvents.length)
    || (integrations.sendLeadChanges && leadChanges.length)
    || (integrations.sendUpsets && upsetEvents.length)
    || (integrations.sendFinals && finalEvents.length)
  );

  if (!shouldSend) {
    return;
  }

  const summary = summarizeEvents({ scoreChanges, tdEvents, leadChanges, upsetEvents, finalEvents });
  const leagueName = payload?.league?.name || '';

  if (integrations.discordWebhookUrl) {
    try {
      await postJson(integrations.discordWebhookUrl, buildDiscordPayload({ leagueName, summary, tdEvents, scoreChanges }));
    } catch (error) {
      logger.warn('Discord webhook failed', { error: error.message });
    }
  }

  if (integrations.slackWebhookUrl) {
    try {
      await postJson(integrations.slackWebhookUrl, buildSlackPayload({ leagueName, summary }));
    } catch (error) {
      logger.warn('Slack webhook failed', { error: error.message });
    }
  }
}

module.exports = {
  dispatchIntegrations
};
