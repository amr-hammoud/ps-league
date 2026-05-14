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

// Data "version" is just the file's mtime. Cheap, accurate, no state to keep.
async function getAllVersions() {
  const [b, p, s] = await Promise.all([
    fs.stat(path.join(DATA_DIR, 'bracket.json')),
    fs.stat(path.join(DATA_DIR, 'players.json')),
    fs.stat(path.join(DATA_DIR, 'settings.json')),
  ]);
  const bracket = Math.floor(b.mtimeMs);
  const players = Math.floor(p.mtimeMs);
  const settings = Math.floor(s.mtimeMs);
  return {
    bracket,
    players,
    settings,
    // schedule depends on all three so it acts as the universal version
    schedule: Math.max(bracket, players, settings),
  };
}

// Stamp every public GET response with the universal version. The client uses
// this to know exactly what it just received and decide if a later poll says
// "newer data exists, please refresh".
async function withVersion(req, res, next) {
  if (req.method !== 'GET') return next();
  if (req.path === '/api/version') return next();
  try {
    const v = await getAllVersions();
    res.set('X-Version', String(v.schedule));
    res.set('Cache-Control', 'no-store');
  } catch (_e) { /* non-fatal */ }
  next();
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
// Each entry in the bracket is a 2-player team (FC26 multiplayer mode). The
// "captain" is the player on file; the "partner" is whichever of these is set:
//   1. an explicit teammate (set via /api/admin/team/merge for student pairs)
//   2. otherwise the parent named in players.json (the default family team)
function teamPartner(player) {
  if (player.teammate) return player.teammate;
  if (player.parent) return player.parent;
  return null;
}

function resolveSide(side, players, bracketById) {
  if (!side) return null;
  if (side.type === 'player') {
    const p = players.find((p) => p.id === side.id);
    if (!p) return null;
    return { ...p, source: 'player', partner: teamPartner(p) };
  }
  if (side.type === 'winner') {
    const src = bracketById[side.id];
    if (!src || !src.winner) {
      return { id: null, name: `Winner of ${side.id}`, grade: '', tier: '', source: 'pending', from: side.id, partner: null };
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

const ALLOWED_GRADES = ['G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'];

function tierFromGrade(grade) {
  if (grade === 'G4' || grade === 'G5') return 'T1';
  if (grade === 'G6' || grade === 'G7' || grade === 'G8') return 'T2';
  if (grade === 'G9' || grade === 'G10' || grade === 'G11') return 'T3';
  return null;
}

function tierStageName(tier) {
  if (tier === 'T1') return 'Tier 1';
  if (tier === 'T2') return 'Tier 2';
  if (tier === 'T3') return 'Tier 3';
  return null;
}

function nextPlayerId(players) {
  let max = 0;
  for (const p of players.players) {
    const m = /^P(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return 'P' + String(max + 1).padStart(2, '0');
}

function nextLateMatchNumber(bracket) {
  let max = 0;
  for (const m of bracket.matches) {
    const match = /^L(\d+)$/.exec(m.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

// Find the earliest match in a tier that is still safe to mutate (not started,
// no scores entered) and has at least one direct-player slot we can hijack.
// Earlier targets distribute the schedule shift thinly across many downstream
// matches rather than concentrating it on the last rounds.
function findEarliestPendingDirectSlot(bracket, stage) {
  for (const m of bracket.matches) {
    if (m.stage !== stage) continue;
    if (m.status && m.status !== 'scheduled') continue;
    if (m.winner) continue;
    if (m.scoreA != null || m.scoreB != null) continue;
    if (m.playerA && m.playerA.type === 'player') return { matchId: m.id, side: 'playerA' };
    if (m.playerB && m.playerB.type === 'player') return { matchId: m.id, side: 'playerB' };
  }
  return null;
}

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
    // The Grand Final runs in the auditorium at a fixed wall time, so it doesn't
    // get assigned to a station and ignores the chained slot calculation.
    if (m.stage === 'Final') {
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
app.use(withVersion);

// Light-weight version probe. Spectators and admins poll this every few
// seconds to know whether anything they're looking at has gone stale.
app.get('/api/version', async (_req, res) => {
  try {
    res.json(await getAllVersions());
  } catch (_e) {
    res.status(500).json({ error: 'version check failed' });
  }
});

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

// --- Roster CRUD + late-arrival integration ---

app.post('/api/admin/player', requireAdmin, async (req, res) => {
  const { name, grade, parent, contact } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
  if (!ALLOWED_GRADES.includes(grade)) {
    return res.status(400).json({ error: `Grade must be one of: ${ALLOWED_GRADES.join(', ')}` });
  }
  const players = await readJSON('players.json');
  const id = nextPlayerId(players);
  const player = {
    id,
    name: String(name).trim(),
    grade,
    tier: tierFromGrade(grade),
    parent: parent ? String(parent).trim() : null,
    contact: contact ? String(contact).trim() : null,
    pending: true,
  };
  players.players.push(player);
  await writeJSON('players.json', players);
  res.json({ ok: true, player });
});

app.delete('/api/admin/player/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const players = await readJSON('players.json');
  const p = players.players.find((pl) => pl.id === id);
  if (!p) return res.status(404).json({ error: 'Player not found' });
  if (!p.pending) {
    return res.status(400).json({ error: 'Only pending players can be removed. Bracketed players must stay in the roster.' });
  }
  players.players = players.players.filter((pl) => pl.id !== id);
  await writeJSON('players.json', players);
  res.json({ ok: true });
});

app.patch('/api/admin/player/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, grade, parent, contact } = req.body || {};
  const players = await readJSON('players.json');
  const p = players.players.find((pl) => pl.id === id);
  if (!p) return res.status(404).json({ error: 'Player not found' });
  if (name !== undefined) p.name = String(name).trim();
  if (parent !== undefined) p.parent = parent ? String(parent).trim() : null;
  if (contact !== undefined) p.contact = contact ? String(contact).trim() : null;
  if (grade !== undefined) {
    if (!ALLOWED_GRADES.includes(grade)) return res.status(400).json({ error: 'Invalid grade' });
    if (!p.pending) return res.status(400).json({ error: "Can't change grade of a bracketed player" });
    p.grade = grade;
    p.tier = tierFromGrade(grade);
  }
  await writeJSON('players.json', players);
  res.json({ ok: true, player: p });
});

// --- 2v2 team merges -----------------------------------------------------
//
// Each bracket slot represents a 2-player team. By default the team is
// (student + their parent). When two students show up without parents and
// want to play together, the admin "merges" them: one becomes the captain,
// the other is marked withdrawn. Any pending bracket match where the partner
// was a direct entrant becomes a walkover for the opponent so downstream
// matches resolve cleanly.

app.post('/api/admin/team/merge', requireAdmin, async (req, res) => {
  const { captainId, partnerId } = req.body || {};
  if (!captainId || !partnerId) return res.status(400).json({ error: 'captainId and partnerId are required' });
  if (captainId === partnerId) return res.status(400).json({ error: 'Captain and partner must be different players' });

  const players = await readJSON('players.json');
  const captain = players.players.find((p) => p.id === captainId);
  const partner = players.players.find((p) => p.id === partnerId);
  if (!captain || !partner) return res.status(404).json({ error: 'Player not found' });
  if (captain.withdrawn) return res.status(400).json({ error: `${captain.name} has already been merged into another team` });
  if (partner.withdrawn) return res.status(400).json({ error: `${partner.name} has already been merged into another team` });
  if (captain.teammate) return res.status(400).json({ error: `${captain.name} already has a teammate — un-pair them first` });
  if (partner.teammate) return res.status(400).json({ error: `${partner.name} is the captain of another pair — pick the other student as captain` });

  // Set the team relationship. partner.name is kept as-is so the display can
  // show e.g. "Adel Baamer + Ziad Nasser (G4)".
  captain.teammate = partner.name + (partner.grade ? ' (' + partner.grade + ')' : '');
  captain.teammatePlayerId = partner.id;
  partner.withdrawn = true;
  partner.mergedInto = captain.id;

  // Auto-walkover any pending match where the partner is a direct entrant and
  // their opponent is also a direct entrant. Matches whose opponent is itself
  // a "winner of Mx" reference can't be resolved here (the opponent isn't
  // known yet) — those are left alone and surface as TBD on the bracket.
  const bracket = await readJSON('bracket.json');
  const walkovers = [];
  for (const m of bracket.matches) {
    if (m.status && m.status !== 'scheduled') continue;
    if (m.winner) continue;
    const aMatches = m.playerA && m.playerA.type === 'player' && m.playerA.id === partner.id;
    const bMatches = m.playerB && m.playerB.type === 'player' && m.playerB.id === partner.id;
    if (!aMatches && !bMatches) continue;
    const opponent = aMatches ? m.playerB : m.playerA;
    if (!opponent || opponent.type !== 'player') continue;
    m.status = 'walkover';
    m.winner = opponent.id;
    m.scoreA = null;
    m.scoreB = null;
    m.notes = (m.notes ? m.notes + ' · ' : '') + `Walkover — ${partner.name} merged into team with ${captain.name}`;
    walkovers.push(m.id);
  }

  await writeJSON('bracket.json', bracket);
  await writeJSON('players.json', players);

  res.json({
    ok: true,
    captain: { id: captain.id, name: captain.name },
    partner: { id: partner.id, name: partner.name },
    walkoverMatches: walkovers,
  });
});

app.post('/api/admin/team/unmerge', requireAdmin, async (req, res) => {
  const { captainId } = req.body || {};
  const players = await readJSON('players.json');
  const captain = players.players.find((p) => p.id === captainId);
  if (!captain) return res.status(404).json({ error: 'Captain not found' });
  if (!captain.teammatePlayerId) return res.status(400).json({ error: 'This player is not paired with anyone' });
  const partner = players.players.find((p) => p.id === captain.teammatePlayerId);
  if (partner) {
    delete partner.withdrawn;
    delete partner.mergedInto;
  }
  delete captain.teammate;
  delete captain.teammatePlayerId;
  await writeJSON('players.json', players);
  // We do NOT auto-revert walkover matches that the merge produced — the
  // tournament state may have moved on. The admin can manually re-open any
  // affected matches from the Matches tab.
  res.json({ ok: true });
});

// Integrate every player flagged `pending: true` into the live bracket as
// late-arrival play-ins. Algorithm: for each tier, build a single-elim ladder
// among new players, then a final play-in vs one displaced existing player.
// Only ever touches scheduled, score-less, winner-less matches.
app.post('/api/admin/generate', requireAdmin, async (req, res) => {
  const players = await readJSON('players.json');
  const bracket = await readJSON('bracket.json');

  const pending = players.players.filter((p) => p.pending);
  if (pending.length === 0) {
    return res.status(400).json({ error: 'No pending players to integrate.' });
  }

  const byTier = { T1: [], T2: [], T3: [] };
  for (const p of pending) {
    if (!byTier[p.tier]) return res.status(400).json({ error: `Unknown tier for player ${p.id}` });
    byTier[p.tier].push(p);
  }

  let nextNum = nextLateMatchNumber(bracket);
  const summary = [];

  for (const tier of ['T1', 'T2', 'T3']) {
    const newPlayers = byTier[tier];
    if (newPlayers.length === 0) continue;

    const stage = tierStageName(tier);
    const target = findEarliestPendingDirectSlot(bracket, stage);
    if (!target) {
      return res.status(400).json({
        error: `No scheduled direct-player slot left in ${stage}. ${newPlayers.length} new player(s) in this tier can't be integrated automatically.`,
      });
    }

    const targetMatch = bracket.matches.find((m) => m.id === target.matchId);
    const displacedRef = targetMatch[target.side];
    const displacedPlayerId = displacedRef.id;
    const displacedPlayerName = (players.players.find((p) => p.id === displacedPlayerId) || {}).name;

    // 1) Mini-bracket among the new players (K-1 matches, top 1 advances)
    const newMatches = [];
    let survivors = newPlayers.map((p) => ({ type: 'player', id: p.id }));
    let roundNum = 1;
    while (survivors.length > 1) {
      const nextRound = [];
      for (let i = 0; i < survivors.length; i += 2) {
        if (i + 1 < survivors.length) {
          const mid = 'L' + nextNum++;
          newMatches.push({
            id: mid,
            stage,
            round: `PI-LATE-${tier}-R${roundNum}`,
            playerA: survivors[i],
            playerB: survivors[i + 1],
            scoreA: null,
            scoreB: null,
            winner: null,
            status: 'scheduled',
            notes: 'Late-arrival play-in (new vs new)',
          });
          nextRound.push({ type: 'winner', id: mid });
        } else {
          // Odd one out gets a bye to the next round
          nextRound.push(survivors[i]);
        }
      }
      survivors = nextRound;
      roundNum++;
    }

    // 2) Final play-in: surviving new player vs the displaced existing player
    const finalId = 'L' + nextNum++;
    newMatches.push({
      id: finalId,
      stage,
      round: `PI-LATE-${tier}-FINAL`,
      playerA: survivors[0],
      playerB: { type: 'player', id: displacedPlayerId },
      scoreA: null,
      scoreB: null,
      winner: null,
      status: 'scheduled',
      notes: 'Late-arrival final play-in vs existing bracket slot',
    });

    // 3) Splice the new matches in just before the target so the scheduler
    //    sees dependencies in topological order, then point the target slot
    //    at the final play-in's winner.
    const targetIdx = bracket.matches.findIndex((m) => m.id === target.matchId);
    bracket.matches.splice(targetIdx, 0, ...newMatches);
    targetMatch[target.side] = { type: 'winner', id: finalId };

    // 4) Clear pending flag on integrated players
    for (const np of newPlayers) {
      const p = players.players.find((pl) => pl.id === np.id);
      if (p) delete p.pending;
    }

    summary.push({
      tier,
      stage,
      newPlayers: newPlayers.map((p) => ({ id: p.id, name: p.name })),
      displaced: { id: displacedPlayerId, name: displacedPlayerName, into: target.matchId, side: target.side },
      newMatches: newMatches.map((m) => ({ id: m.id, round: m.round })),
    });
  }

  await writeJSON('bracket.json', bracket);
  await writeJSON('players.json', players);

  res.json({ ok: true, summary });
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
