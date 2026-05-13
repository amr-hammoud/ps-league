// Thin client wrapper around the JSON API.
// All requests are credentialed so the admin cookie travels with them.

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText);
    err.status = res.status;
    throw err;
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
};
