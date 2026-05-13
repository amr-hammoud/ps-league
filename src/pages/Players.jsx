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

  // Which players actually appear in the bracket (by id reference). Used to
  // separate "in bracket" from "late registration" cleanly even if more players
  // are added without restructuring matches.
  const bracketedIds = useMemo(() => {
    if (!bracket) return new Set();
    const set = new Set();
    for (const m of bracket.matches) {
      if (m.playerA?.type === 'player') set.add(m.playerA.id);
      if (m.playerB?.type === 'player') set.add(m.playerB.id);
    }
    return set;
  }, [bracket]);

  if (err) return <Centered>Error: {err}</Centered>;
  if (!data) return <Centered>Loading players…</Centered>;

  const allFiltered = data.players
    .filter((p) => (tier === 'all' ? true : p.tier === tier))
    .filter((p) => {
      const needle = q.toLowerCase();
      return (
        p.name.toLowerCase().includes(needle) ||
        (p.parent || '').toLowerCase().includes(needle)
      );
    });

  const inBracket = allFiltered.filter((p) => !p.pending && (bracketedIds.has(p.id) || bracketedIds.size === 0));
  const lateReg = allFiltered.filter((p) => p.pending || (p.lateRegistration && !bracketedIds.has(p.id)));

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Players</h1>
          <p className="mt-1 text-ink-500">
            {data.players.length} registered · {bracketedIds.size} in the current bracket
            {lateReg.length > 0 && (
              <> · <span className="text-amber-700 font-medium">{lateReg.length} pending integration</span></>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input w-64"
            placeholder="Search name or parent…"
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
        {data.tiers.map((t) => {
          const tierPlayers = data.players.filter((p) => p.tier === t.id);
          const tierLate = tierPlayers.filter((p) => p.lateRegistration);
          return <TierStrip key={t.id} t={t} count={tierPlayers.length} late={tierLate.length} />;
        })}
      </div>

      <section className="mt-8">
        <SectionHeading
          title="In the bracket"
          subtitle="Players seeded into the current single-elimination tournament."
          count={inBracket.length}
        />
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {inBracket.map((p) => (
            <PlayerCard key={p.id} p={p} status={status[p.id]} />
          ))}
          {inBracket.length === 0 && (
            <div className="card p-6 text-center text-sm text-ink-400 sm:col-span-2 lg:col-span-3">
              No players match this filter.
            </div>
          )}
        </div>
      </section>

      {lateReg.length > 0 && (
        <section className="mt-10">
          <SectionHeading
            title="Pending integration"
            subtitle="Registered late — the admin will run a generate flow to add them to the bracket via play-ins."
            count={lateReg.length}
            accent="amber"
          />
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lateReg.map((p) => (
              <PlayerCard key={p.id} p={p} late />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PlayerCard({ p, status, late }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-brand-gradient text-white flex items-center justify-center font-semibold shrink-0">
        {initials(p.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink-800 truncate">{p.name}</div>
        {p.parent && (
          <div className="text-[11px] text-ink-500 truncate">
            <span className="text-ink-400">Parent:</span> {p.parent}
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-ink-500 mt-0.5">
          <span>{p.grade}</span>
          <span className="text-ink-300">·</span>
          <span>{tierLabel(p.tier)}</span>
        </div>
      </div>
      <div className="shrink-0">
        {late ? (
          <span className="chip bg-amber-50 text-amber-700 border border-amber-100">Late</span>
        ) : status?.eliminated ? (
          <span className="chip bg-ink-100 text-ink-500">Out · {status.eliminatedAt}</span>
        ) : status?.advancedTo ? (
          <span className="chip bg-brand-50 text-brand-700">{status.advancedTo}</span>
        ) : (
          <span className="chip bg-ink-50 text-ink-500">Active</span>
        )}
      </div>
    </div>
  );
}

function TierStrip({ t, count, late }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-ink-800">{t.label}</h3>
        <div className="flex items-center gap-1.5">
          <span className="chip bg-brand-50 text-brand-700">{count}</span>
          {late > 0 && <span className="chip bg-amber-50 text-amber-700 border border-amber-100">+{late} late</span>}
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-500">{t.advance}</p>
    </div>
  );
}

function SectionHeading({ title, subtitle, count, accent }) {
  const countClass =
    accent === 'amber'
      ? 'bg-amber-50 text-amber-700 border border-amber-100'
      : 'bg-brand-50 text-brand-700 border border-brand-100';
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink-800">{title}</h2>
        <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>
      </div>
      <span className={`chip ${countClass}`}>{count}</span>
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
