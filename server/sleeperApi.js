function withTimeout(ms = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

class SleeperApiClient {
  constructor({ logger, metrics = null }) {
    this.logger = logger;
    this.metrics = metrics;
    this.baseUrl = 'https://api.sleeper.app/v1';
  }

  async request(pathname) {
    const startedAt = Date.now();
    const timeout = withTimeout();

    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: timeout.signal
      });

      const text = await response.text();
      if (!response.ok) {
        const snippet = text.slice(0, 260) || `HTTP ${response.status}`;
        const error = new Error(`Sleeper API request failed: ${snippet}`);
        error.statusCode = response.status;
        throw error;
      }

      const payload = JSON.parse(text || '{}');
      this.metrics?.inc('sleeper_requests_total');
      this.metrics?.set('sleeper_last_request_duration_ms', Date.now() - startedAt);
      return payload;
    } catch (error) {
      this.metrics?.inc('sleeper_requests_failed_total');
      this.logger.warn('Sleeper API request failed', {
        pathname,
        error: error.message
      });
      throw error;
    } finally {
      timeout.clear();
    }
  }

  async fetchState() {
    return this.request('/state/nfl');
  }

  async fetchLeague(leagueId) {
    return this.request(`/league/${leagueId}`);
  }

  async fetchUsers(leagueId) {
    return this.request(`/league/${leagueId}/users`);
  }

  async fetchRosters(leagueId) {
    return this.request(`/league/${leagueId}/rosters`);
  }

  async fetchMatchups(leagueId, week) {
    return this.request(`/league/${leagueId}/matchups/${week}`);
  }
}

module.exports = {
  SleeperApiClient
};
