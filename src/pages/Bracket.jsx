import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  stageColor,
  statusLabel,
  statusBadgeClass,
  shouldShowStatus,
  stationBadgeClass,
  stationDotClass,
  stationLabel,
} from '../lib/format.js';

// Renders the full bracket in column groups. We don't draw curved SVG connectors —
// the rounds are clearly labeled and color-coded by stage, which reads cleanly on mobile.

export default function Bracket() {
  const [bracket, setBracket] = useState(null);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.bracket().then(setBracket).catch((e) => setErr(e.message));
  }, []);

  if (err) return <Centered>Error: {err}</Centered>;
  if (!bracket) return <Centered>Loading bracket…</Centered>;

  const matches = bracket.matches;
  // Columns mirror the tournament depth: each one is a round that can start
  // only after the previous column's matches are decided. Grouping by depth
  // (rather than purely by stage) makes the parallel-vs-blocking flow clear.
  const columns = [
    { label: 'Play-ins & T3 SF',         items: matches.filter((m) => /^PI-/.test(m.round) || /^SF-T3-/.test(m.round)) },
    { label: 'Tier 1 R16 / Tier 2 QF',   items: matches.filter((m) => /^R16-/.test(m.round) || /^QF-T2-/.test(m.round)) },
    { label: 'Tier 1 QF / Tier 2 SF',    items: matches.filter((m) => /^QF-T1-/.test(m.round) || /^SF-T2-/.test(m.round)) },
    { label: 'Mixed QF',                 items: matches.filter((m) => /^MQF-/.test(m.round)) },
    { label: 'Mixed SF',                 items: matches.filter((m) => /^MSF-/.test(m.round)) },
    { label: 'Grand Final',              items: matches.filter((m) => m.round === 'GRAND FINAL') },
  ];

  const champion = (() => {
    const gf = matches.find((m) => m.stage === 'Final');
    if (!gf || !gf.winner) return null;
    return gf.resolvedA?.id === gf.winner ? gf.resolvedA : gf.resolvedB;
  })();

  const filteredColumns = columns.map((c) => ({
    ...c,
    items:
      filter === 'all'
        ? c.items
        : c.items.filter((m) => m.stage === filter),
  })).filter((c) => c.items.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Bracket</h1>
          <p className="mt-1 text-ink-500">Full path from R16 to the Grand Final.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all', 'Tier 1', 'Tier 2', 'Tier 3', 'Mixed', 'Final'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'rounded-full px-3 py-1.5 text-xs font-medium transition border ' +
                (filter === f
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white text-ink-600 border-ink-200 hover:bg-ink-50')
              }
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {champion && (
        <div className="mt-6 card overflow-hidden">
          <div className="bg-brand-gradient text-white p-5 sm:p-6 flex items-center gap-4">
            <div className="text-3xl">🏆</div>
            <div>
              <div className="text-xs uppercase tracking-widest opacity-80">Tournament Champion</div>
              <div className="text-2xl font-bold">{champion.name}</div>
              <div className="text-sm opacity-80">{champion.grade}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-x-auto pb-4">
        <div className="flex gap-6 min-w-max">
          {filteredColumns.map((col) => (
            <div key={col.label} className="w-72 shrink-0">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3 px-1">
                {col.label}
              </h3>
              <div className="space-y-3">
                {col.items.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchCard({ match }) {
  const winnerId = match.winner;
  const aWins = winnerId && match.resolvedA?.id === winnerId;
  const bWins = winnerId && match.resolvedB?.id === winnerId;
  const showStatus = shouldShowStatus(match.status);
  const dimmed = match.status === 'cancelled' || match.status === 'postponed';
  return (
    <div className={'card p-3.5 ' + (dimmed ? 'opacity-70' : '')}>
      <div className="flex items-center justify-between text-[11px] mb-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-ink-500 font-medium truncate">{match.id} · {match.round}</span>
          {match.station && (
            <span className={`chip border ${stationBadgeClass(match.station)}`}>
              <span className={'h-1.5 w-1.5 rounded-full ' + stationDotClass(match.station)} />
              {stationLabel(match.station)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {showStatus && (
            <span className={`chip border ${statusBadgeClass(match.status)}`}>
              {statusLabel(match.status)}
            </span>
          )}
          <span className={`chip border ${stageColor(match.stage)}`}>{match.stage}</span>
        </div>
      </div>
      <Side label={match.resolvedA} score={match.scoreA} winning={aWins} pending={match.resolvedA?.source === 'pending'} status={match.status} />
      <div className="my-1 text-center text-[10px] uppercase tracking-widest text-ink-400">vs</div>
      <Side label={match.resolvedB} score={match.scoreB} winning={bWins} pending={match.resolvedB?.source === 'pending'} status={match.status} />
    </div>
  );
}

function Side({ label, score, winning, pending, status }) {
  // For walkovers, show "W" instead of a numeric score so it reads as a walkover not a 0-0 draw.
  const scoreDisplay = status === 'walkover' && winning ? 'W' : score ?? '–';
  return (
    <div
      className={
        'flex items-center justify-between rounded-lg px-2.5 py-2 ' +
        (winning ? 'bg-brand-50 ring-1 ring-brand-200' : pending ? 'bg-ink-50' : 'bg-white')
      }
    >
      <div className="min-w-0">
        <div className={'truncate text-sm font-medium ' + (pending ? 'text-ink-400 italic' : 'text-ink-800')}>
          {label?.name || '—'}
        </div>
        {label?.grade && !pending && (
          <div className="text-[11px] text-ink-500">{label.grade}</div>
        )}
      </div>
      <div className={'ml-2 text-sm font-bold tabular-nums ' + (winning ? 'text-brand-600' : 'text-ink-400')}>
        {scoreDisplay}
      </div>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 text-center text-ink-500">{children}</div>
  );
}
