function resolveProvider(settings) {
  if (settings?.data?.mockMode) {
    return 'mock';
  }

  const provider = String(settings?.data?.provider || 'yahoo').trim().toLowerCase();
  if (provider === 'mock' || provider === 'yahoo' || provider === 'espn' || provider === 'sleeper') {
    return provider;
  }

  return 'yahoo';
}

async function fetchByProvider({ provider, fetchers }) {
  if (provider && typeof fetchers?.[provider] === 'function') {
    return fetchers[provider]();
  }

  const error = new Error(`Unsupported provider '${provider}'.`);
  error.code = 'UNSUPPORTED_PROVIDER';
  throw error;
}

module.exports = {
  resolveProvider,
  fetchByProvider
};
