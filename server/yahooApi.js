const { XMLParser } = require('fast-xml-parser');

const API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

function withTimeout(ms = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

class YahooApiClient {
  constructor({ logger, authService, metrics = null }) {
    this.logger = logger;
    this.authService = authService;
    this.metrics = metrics;
    this.parser = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: false,
      trimValues: true
    });
    this.requestTimestamps = [];
    this.lastRateLimitHeaders = null;
  }

  trackRequest() {
    const now = Date.now();
    this.requestTimestamps.push(now);
    const cutoff = now - 60 * 60 * 1000;
    while (this.requestTimestamps.length && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }
  }

  getBudgetTelemetry(settings = null) {
    const now = Date.now();
    const lastMinute = this.requestTimestamps.filter((ts) => ts >= now - 60_000).length;
    const lastHour = this.requestTimestamps.filter((ts) => ts >= now - 60 * 60 * 1000).length;

    const perHour = Number(settings?.data?.rateLimitBudget?.perHour || 1800);
    const warnThresholdPct = Number(settings?.data?.rateLimitBudget?.warnThresholdPct || 0.8);
    const usagePct = perHour > 0 ? lastHour / perHour : 0;

    return {
      lastMinute,
      lastHour,
      perHour,
      usagePct: Number(usagePct.toFixed(4)),
      warnThresholdPct,
      warning: usagePct >= warnThresholdPct,
      lastRateLimitHeaders: this.lastRateLimitHeaders
    };
  }

  async request(pathWithParams) {
    const startedAt = Date.now();
    const accessToken = await this.authService.refreshAccessTokenIfNeeded();
    if (!accessToken) {
      throw new Error('Not authorized with Yahoo yet. Complete OAuth in /admin.');
    }

    const timeout = withTimeout();

    try {
      const response = await fetch(`${API_BASE}/${pathWithParams}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/xml'
        },
        signal: timeout.signal
      });

      const text = await response.text();

      if (!response.ok) {
        const message = text.slice(0, 300) || `HTTP ${response.status}`;
        const error = new Error(`Yahoo API request failed: ${message}`);
        error.statusCode = response.status;
        error.isRateLimit = response.status === 429 || /rate.?limit/i.test(message);

        const retryAfterHeader = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
          error.retryAfterMs = retryAfterHeader * 1000;
        }

        throw error;
      }

      this.trackRequest();
      this.lastRateLimitHeaders = {
        limit: response.headers.get('x-ratelimit-limit') || null,
        remaining: response.headers.get('x-ratelimit-remaining') || null,
        reset: response.headers.get('x-ratelimit-reset') || null
      };

      this.metrics?.inc('yahoo_requests_total');
      this.metrics?.set('yahoo_last_request_duration_ms', Date.now() - startedAt);
      this.metrics?.set('yahoo_requests_last_minute', this.getBudgetTelemetry().lastMinute);
      this.metrics?.set('yahoo_requests_last_hour', this.getBudgetTelemetry().lastHour);
      return this.parser.parse(text);
    } catch (error) {
      this.metrics?.inc('yahoo_requests_failed_total');
      this.logger.warn('Yahoo API request failed', { pathWithParams, error: error.message });
      throw error;
    } finally {
      timeout.clear();
    }
  }

  async fetchLeagueMetadata(leagueKey) {
    return this.request(`league/${leagueKey}`);
  }

  async fetchScoreboard(leagueKey, week) {
    const weekPart = week === 'current' ? '' : `;week=${week}`;
    return this.request(`league/${leagueKey}/scoreboard${weekPart}`);
  }

  async fetchStandings(leagueKey) {
    return this.request(`league/${leagueKey}/standings`);
  }

  async fetchLeagueSettings(leagueKey) {
    return this.request(`league/${leagueKey}/settings`);
  }

  async fetchTeamRosterWithStats(teamKey, week) {
    const numericWeek = Number(week);
    if (Number.isFinite(numericWeek) && numericWeek > 0) {
      return this.request(`team/${teamKey}/roster;week=${numericWeek}/players/stats;type=week;week=${numericWeek}`);
    }

    return this.request(`team/${teamKey}/roster/players/stats;type=week`);
  }

  async fetchGameKeyForSeason(season) {
    const payload = await this.request(`games;game_codes=nfl;seasons=${season}`);
    const gamesNode = payload?.fantasy_content?.games?.game;
    const game = Array.isArray(gamesNode) ? gamesNode[0] : gamesNode;
    return game?.game_key || null;
  }
}

module.exports = {
  YahooApiClient
};
