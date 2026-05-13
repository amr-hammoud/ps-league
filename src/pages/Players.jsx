import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { tierLabel } from '../lib/format.js';

export default function Players() {
  const [data, setData] = useState(null);
  const [bracket, setBracket] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('all');

  useEffect(() => {
    Promise.all([api.players(), api.bracket()])
      .then(([p, b]) => { setData(p); setBracket(b); })
      .catch((e) => setErr(e.message));
  }, []);

  // Find each player's current furthest round
  const status = useMemo(() => {
    if (!data || !bracket) return {};
    const out = {};
    for (const p of data.players) out[p.id] = { advancedTo: null, eliminated: false };
    for (const m of bracket.matches) {
      if (!m.winner) continue;
      // Winner advances
      if (m.resolvedA?.id === m.winner) {
        out[m.winner] = { ...out[m.winner], advancedTo: m.round };
        if (m.resolvedB?.id) out[m.resolvedB.id] = { ...(out[m.resolvedB.id] || {}), eliminated: true, eliminatedAt: m.round };
      } else if (m.resolvedB?.id === m.winner) {
        out[m.winner] = { ...out[m.winner], advancedTo: m.round };
        if (m.resolvedA?.id) out[m.resolvedA.id] = { ...(out[m.resolvedA.id] || {}), eliminated: true, eliminatedAt: m.round };
      }
    }
    return out;
  }, [data, bracket]);

  if (err) return <Centered>Error: {err}</Centered>;
  if (!data) return <Centered>Loading players…</Centered>;

  const filtered = data.players
    .filter((p) => (tier === 'all' ? true : p.tier === tier))
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Players</h1>
          <p className="mt-1 text-ink-500">{data.players.length} qualifiers across three tiers.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input w-64"
            placeholder="Search by name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex rounded-xl border border-ink-200 bg-white overflow-hidden">
            {['all', 'T1', 'T2', 'T3'].map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={
                  'px-3 py-2 text-sm font-medium border-r last:border-r-0 border-ink-200 ' +
                  (tier === t ? 'bg-brand-500 text-white' : 'text-ink-600 hover:bg-ink-50')
                }
              >
                {t === 'all' ? 'All' : tierLabel(t)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-3 gap-4">
        {data.tiers.map((t) => (
          <TierStrip key={t.id} t={t} players={data.players.filter((p) => p.tier === t.id)} />
        ))}
      </div>

      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((p) => (
          <PlayerCard key={p.id} p={p} status={status[p.id]} />
        ))}
      </div>
    </div>
  );
}

function PlayerCard({ p, status }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-brand-gradient text-white flex items-center justify-center font-semibold">
        {initials(p.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink-800 truncate">{p.name}</div>
        <div className="flex items-center gap-2 text-xs text-ink-500 mt-0.5">
          <span>{p.grade}</span>
          <span className="text-ink-300">·</span>
          <span>{tierLabel(p.tier)}</span>
        </div>
      </div>
      {status?.eliminated ? (
        <span className="chip bg-ink-100 text-ink-500">Out · {status.eliminatedAt}</span>
      ) : status?.advancedTo ? (
        <span className="chip bg-brand-50 text-brand-700">{status.advancedTo}</span>
      ) : (
        <span className="chip bg-ink-50 text-ink-500">Active</span>
      )}
    </div>
  );
}

function TierStrip({ t, players }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-ink-800">{t.label}</h3>
        <span className="chip bg-brand-50 text-brand-700">{players.length}</span>
      </div>
      <p className="mt-1 text-xs text-ink-500">{t.advance}</p>
    </div>
  );
}

function initials(name) {
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function Centered({ children }) {
  return <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 text-center text-ink-500">{children}</div>;
}
