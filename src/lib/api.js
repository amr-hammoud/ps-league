// Thin client wrapper around the JSON API.
// All requests are credentialed so the admin cookie travels with them.

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText);
    err.status = res.status;
    throw err;
  }
  // The server stamps GET responses with X-Version (file mtime). Attach it to
  // the parsed body so pages can pass it to useFreshness().
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const v = res.headers.get('X-Version');
    if (v) data._version = Number(v);
  }
  return data;
}

export const api = {
  players: () => request('/api/players'),
  bracket: () => request('/api/bracket'),
  schedule: () => request('/api/schedule'),
  settings: () => request('/api/settings'),

  session: () => request('/api/admin/session'),
  login: (password) =>
    request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/api/admin/logout', { method: 'POST' }),

  updateMatch: (id, payload) =>
    request('/api/admin/match', {
      method: 'POST',
      body: JSON.stringify({ id, ...payload }),
    }),
  resetAll: () => request('/api/admin/reset', { method: 'POST' }),
  updateSettings: (settings) =>
    request('/api/admin/settings', { method: 'POST', body: JSON.stringify(settings) }),

  addPlayer: (payload) =>
    request('/api/admin/player', { method: 'POST', body: JSON.stringify(payload) }),
  removePlayer: (id) =>
    request(`/api/admin/player/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updatePlayer: (id, payload) =>
    request(`/api/admin/player/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  generateBrackets: () => request('/api/admin/generate', { method: 'POST' }),
  setSlot: (matchId, side, playerId) =>
    request('/api/admin/slot', {
      method: 'POST',
      body: JSON.stringify({ matchId, side, playerId }),
    }),
  swapPlayers: (playerAId, playerBId) =>
    request('/api/admin/swap', {
      method: 'POST',
      body: JSON.stringify({ playerAId, playerBId }),
    }),

  mergeTeam: (captainId, partnerId) =>
    request('/api/admin/team/merge', {
      method: 'POST',
      body: JSON.stringify({ captainId, partnerId }),
    }),
  unmergeTeam: (captainId) =>
    request('/api/admin/team/unmerge', {
      method: 'POST',
      body: JSON.stringify({ captainId }),
    }),
};
