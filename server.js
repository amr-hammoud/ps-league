// PS League — single-process Express server.
//
// Runs the JSON-backed API and serves the built React app (dist/).
// Designed for Hostinger Node.js hosting: one entrypoint, no build at boot.
//
// Routes:
//   GET  /api/players              public players + tiers
//   GET  /api/bracket              public bracket (with resolved player names)
//   GET  /api/schedule             computed schedule from bracket + settings
//   GET  /api/settings             public schedule settings
//   POST /api/admin/login          { password } → sets cookie
//   POST /api/admin/logout         clears cookie
//   GET  /api/admin/session        { authed: bool }
//   POST /api/admin/match          { id, scoreA, scoreB, winner }
//   POST /api/admin/reset          clears all scores/winners
//   POST /api/admin/settings       full settings replace
//   POST /api/admin/bracket        full bracket replace (manual edit)

import express from 'express';
import cookieParser from 'cookie-parser';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DIST_DIR = path.join(__dirname, 'dist');

const PORT = process.env.PORT || 3001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nasa-ps-2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production-please';
const COOKIE_NAME = 'psl_admin';

// --- helpers ---------------------------------------------------------------

async function readJSON(name) {
  const raw = await fs.readFile(path.join(DATA_DIR, name), 'utf8');
  return JSON.parse(raw);
}

async function writeJSON(name, value) {
  const tmp = path.join(DATA_DIR, `.${name}.tmp`);
  const final = path.join(DATA_DIR, name);
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, final); // atomic on POSIX
}

function signSession() {
  const payload = `admin.${Date.now()}`;
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

function verifySession(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [role, ts, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`${role}.${ts}`).digest('hex');
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  // 7-day expiry
  const ageMs = Date.now() - Number(ts);
  if (!Number.isFinite(ageMs) || ageMs > 7 * 24 * 3600 * 1000) return false;
  return role === 'admin';
}

function requireAdmin(req, res, next) {
  if (!verifySession(req.cookies[COOKIE_NAME])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Resolve a match-side reference into a concrete player object (or null).
function resolveSide(side, players, bracketById) {
  if (!side) return null;
  if (side.type === 'player') {
    const p = players.find((p) => p.id === side.id);
    return p ? { ...p, source: 'player' } : null;
  }
  if (side.type === 'winner') {
    const src = bracketById[side.id];
    if (!src || !src.winner) {
      return { id: null, name: `Winner of ${side.id}`, grade: '', tier: '', source: 'pending', from: side.id };
    }
    return resolveSide({ type: 'player', id: src.winner }, players, bracketById);
  }
  return null;
}

// Default status comes from the data on disk: explicit if set, otherwise inferred
// (completed when there's both a winner and a score, in_progress when scores are
// being entered, scheduled otherwise). Lets us add the field gradually without
// migrating old bracket files.
function inferStatus(m) {
  if (m.status) return m.status;
  if (m.winner) return 'completed';
  if (m.scoreA != null || m.scoreB != null) return 'in_progress';
  return 'scheduled';
}

const ALLOWED_STATUSES = new Set([
  'scheduled',
  'in_progress',
  'completed',
  'walkover',
  'cancelled',
  'postponed',
]);

function decorateBracket(bracket, players) {
  const byId = Object.fromEntries(bracket.matches.map((m) => [m.id, m]));
  return bracket.matches.map((m) => ({
    ...m,
    status: inferStatus(m),
    resolvedA: resolveSide(m.playerA, players, byId),
    resolvedB: resolveSide(m.playerB, players, byId),
  }));
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHHMM(min) {
  const total = ((Math.round(min) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getDependencies(m) {
  const out = [];
  if (m.playerA && m.playerA.type === 'winner') out.push(m.playerA.id);
  if (m.playerB && m.playerB.type === 'winner') out.push(m.playerB.id);
  return out;
}

// Greedy list scheduler. Iterates matches in their declared (dependency) order
// and assigns each one to whichever station frees up first. The result is a
// near-optimal schedule that respects upstream dependencies: a match can't
// start until both of its predecessor matches have finished.
//
// The Grand Final (M26) is handled separately because it runs at a fixed wall
// time in a different venue and isn't on a station.
function buildSchedule(bracket, settings) {
  const startTime = settings.startTime;
  const matchDurationMin = Number(settings.matchDurationMin);
  const bufferMin = Number(settings.bufferMin);
  const grandFinalStart = settings.grandFinalStart;
  const nStations = Math.max(1, Math.min(8, Number(settings.stations) || 1));

  const t0 = toMinutes(startTime);
  // stationFree[i] = the next minute station i is available
  const stationFree = new Array(nStations).fill(t0);
  // endByMatch[id] = the minute when that match finishes (used for dependency lookups)
  const endByMatch = {};
  const rows = [];

  for (const m of bracket.matches) {
    if (m.id === 'M26') {
      const start = grandFinalStart;
      const end = minutesToHHMM(toMinutes(start) + matchDurationMin);
      rows.push({ ...m, start, end, station: null });
      endByMatch[m.id] = toMinutes(end);
      continue;
    }

    // Earliest this match could start, based purely on its dependencies finishing.
    let earliest = t0;
    for (const dep of getDependencies(m)) {
      if (endByMatch[dep] !== undefined) {
        earliest = Math.max(earliest, endByMatch[dep]);
      }
    }

    // Pick the station that frees up first. Tie-break by index so the same
    // input always produces the same schedule (deterministic).
    let pick = 0;
    for (let i = 1; i < nStations; i++) {
      if (stationFree[i] < stationFree[pick]) pick = i;
    }

    const startMin = Math.max(earliest, stationFree[pick]);
    const endMin = startMin + matchDurationMin;
    stationFree[pick] = endMin + bufferMin;
    endByMatch[m.id] = endMin;

    rows.push({
      ...m,
      start: minutesToHHMM(startMin),
      end: minutesToHHMM(endMin),
      station: pick + 1, // 1-indexed for display
    });
  }
  return rows;
}

// --- app -------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// Public reads
app.get('/api/players', async (_req, res) => {
  res.json(await readJSON('players.json'));
});

app.get('/api/settings', async (_req, res) => {
  res.json(await readJSON('settings.json'));
});

app.get('/api/bracket', async (_req, res) => {
  const [bracket, players] = await Promise.all([readJSON('bracket.json'), readJSON('players.json')]);
  res.json({
    ...bracket,
    matches: decorateBracket(bracket, players.players),
  });
});

app.get('/api/schedule', async (_req, res) => {
  const [bracket, players, settings] = await Promise.all([
    readJSON('bracket.json'),
    readJSON('players.json'),
    readJSON('settings.json'),
  ]);
  const decorated = { matches: decorateBracket(bracket, players.players) };
  res.json({ settings, rows: buildSchedule(decorated, settings) });
});

// Auth
app.post('/api/admin/login', (req, res) => {
  const pw = (req.body && req.body.password) || '';
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.cookie(COOKIE_NAME, signSession(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.protocol === 'https',
    maxAge: 7 * 24 * 3600 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authed: verifySession(req.cookies[COOKIE_NAME]) });
});

// Admin mutations
app.post('/api/admin/match', requireAdmin, async (req, res) => {
  const { id, scoreA, scoreB, winner, status } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing match id' });
  if (status !== undefined && status !== null && !ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ error: `Bad status: ${status}` });
  }
  const bracket = await readJSON('bracket.json');
  const m = bracket.matches.find((mm) => mm.id === id);
  if (!m) return res.status(404).json({ error: 'Match not found' });

  if (scoreA !== undefined) m.scoreA = scoreA === '' || scoreA === null ? null : Number(scoreA);
  if (scoreB !== undefined) m.scoreB = scoreB === '' || scoreB === null ? null : Number(scoreB);
  if (winner !== undefined) m.winner = winner || null; // expect a player id or null

  if (status !== undefined && status !== null) {
    m.status = status;
    // Normalize side-effects so the bracket stays internally consistent.
    // walkover: keep a winner (the admin picked who advances) but clear scores.
    // cancelled / postponed: nothing advances and no scores stick.
    if (status === 'walkover') {
      m.scoreA = null;
      m.scoreB = null;
    } else if (status === 'cancelled' || status === 'postponed') {
      m.scoreA = null;
      m.scoreB = null;
      m.winner = null;
    } else if (status === 'scheduled') {
      m.winner = null;
    }
  }

  await writeJSON('bracket.json', bracket);
  res.json({ ok: true, match: m });
});

app.post('/api/admin/reset', requireAdmin, async (_req, res) => {
  const bracket = await readJSON('bracket.json');
  for (const m of bracket.matches) {
    m.scoreA = null;
    m.scoreB = null;
    m.winner = null;
    m.status = 'scheduled';
  }
  await writeJSON('bracket.json', bracket);
  res.json({ ok: true });
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  const next = req.body || {};
  const required = ['startTime', 'matchDurationMin', 'bufferMin', 'grandFinalStart'];
  for (const k of required) {
    if (next[k] === undefined || next[k] === null || next[k] === '') {
      return res.status(400).json({ error: `Missing field: ${k}` });
    }
  }
  next.matchDurationMin = Number(next.matchDurationMin);
  next.bufferMin = Number(next.bufferMin);
  next.stations = Math.max(1, Math.min(8, Number(next.stations) || 1));
  await writeJSON('settings.json', next);
  res.json({ ok: true });
});

app.post('/api/admin/bracket', requireAdmin, async (req, res) => {
  const next = req.body;
  if (!next || !Array.isArray(next.matches)) return res.status(400).json({ error: 'Bad bracket shape' });
  await writeJSON('bracket.json', next);
  res.json({ ok: true });
});

// Static React app
app.use(express.static(DIST_DIR, { maxAge: '1h', index: 'index.html' }));

// SPA fallback — everything that isn't /api/* serves index.html
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`PS League server on http://localhost:${PORT}`);
});
