function withTimeout(ms = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

class EspnApiClient {
  constructor({ logger, metrics = null }) {
    this.logger = logger;
    this.metrics = metrics;
  }

  buildCookies({ swid = '', espnS2 = '' }) {
    const values = [];
    const swidValue = String(swid || '').trim();
    const s2Value = String(espnS2 || '').trim();

    if (swidValue) {
      values.push(`SWID=${swidValue}`);
    }

    if (s2Value) {
      values.push(`espn_s2=${s2Value}`);
    }

    return values.join('; ');
  }

  async fetchLeague({ leagueId, season, views = ['mMatchup', 'mTeam', 'mSettings', 'mStatus'], swid = '', espnS2 = '' }) {
    const startedAt = Date.now();

    if (!leagueId) {
      throw new Error('ESPN leagueId is required.');
    }

    const numericSeason = Number(season || new Date().getFullYear());
    const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${numericSeason}/segments/0/leagues/${leagueId}`);

    const viewList = Array.isArray(views) ? views : ['mMatchup', 'mTeam', 'mSettings', 'mStatus'];
    for (const view of viewList) {
      url.searchParams.append('view', view);
    }

    const headers = {
      Accept: 'application/json'
    };

    const cookie = this.buildCookies({ swid, espnS2 });
    if (cookie) {
      headers.Cookie = cookie;
    }

    const timeout = withTimeout();

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: timeout.signal
      });

      const text = await response.text();
      if (!response.ok) {
        const snippet = text.slice(0, 260) || `HTTP ${response.status}`;
        const error = new Error(`ESPN API request failed: ${snippet}`);
        error.statusCode = response.status;
        throw error;
      }

      const payload = JSON.parse(text || '{}');

      this.metrics?.inc('espn_requests_total');
      this.metrics?.set('espn_last_request_duration_ms', Date.now() - startedAt);
      return payload;
    } catch (error) {
      this.metrics?.inc('espn_requests_failed_total');
      this.logger.warn('ESPN API request failed', {
        leagueId,
        season: numericSeason,
        error: error.message
      });
      throw error;
    } finally {
      timeout.clear();
    }
  }
}

module.exports = {
  EspnApiClient
};
