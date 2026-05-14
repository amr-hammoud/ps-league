import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useFreshness, RefreshBanner } from '../lib/freshness.jsx';
import {
  formatTime12,
  stageColor,
  statusLabel,
  statusBadgeClass,
  shouldShowStatus,
  stationBadgeClass,
  stationDotClass,
  stationLabel,
} from '../lib/format.js';

export default function Schedule() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [view, setView] = useState('byTime'); // 'byTime' | 'byStation'
  const [stationFilter, setStationFilter] = useState('all');
  const { isStale, markLoaded } = useFreshness('schedule');

  const fetchData = useCallback(async () => {
    try {
      const d = await api.schedule();
      setData(d);
      markLoaded(d._version || null);
    } catch (e) {
      setErr(e.message);
    }
  }, [markLoaded]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stations = useMemo(() => {
    if (!data) return [];
    const set = new Set();
    for (const m of data.rows) if (m.station) set.add(m.station);
    return Array.from(set).sort((a, b) => a - b);
  }, [data]);

  if (err) return <Centered>Error: {err}</Centered>;
  if (!data) return <Centered>Loading schedule…</Centered>;

  const s = data.settings;
  const mainRows = data.rows
    .filter((m) => m.stage !== 'Final')
    .filter((m) => stationFilter === 'all' || m.station === Number(stationFilter));
  const grandFinal = data.rows.find((m) => m.stage === 'Final');

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      {isStale && <RefreshBanner onRefresh={fetchData} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Schedule</h1>
          <p className="mt-1 text-ink-500">
            {s.stations || 1} {s.stations === 1 ? 'station' : 'stations'} running in parallel. The Grand Final has its own slot in the auditorium.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Pill label="Start" value={formatTime12(s.startTime)} />
          <Pill label="Match" value={`${s.matchDurationMin} min`} />
          <Pill label="Buffer" value={`${s.bufferMin} min`} />
          <Pill label="Stations" value={s.stations || 1} />
          <Pill label="Final" value={formatTime12(s.grandFinalStart)} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-ink-200 bg-white overflow-hidden">
          <ToggleButton active={view === 'byTime'} onClick={() => setView('byTime')}>By time</ToggleButton>
          <ToggleButton active={view === 'byStation'} onClick={() => setView('byStation')}>By station</ToggleButton>
        </div>
        {view === 'byTime' && stations.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={stationFilter === 'all'} onClick={() => setStationFilter('all')}>All stations</FilterChip>
            {stations.map((st) => (
              <FilterChip
                key={st}
                active={stationFilter === String(st)}
                onClick={() => setStationFilter(String(st))}
                station={st}
              >
                {stationLabel(st)}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {view === 'byTime' ? (
        <ByTime mainRows={mainRows} grandFinal={grandFinal} />
      ) : (
        <ByStation rows={data.rows.filter((m) => m.stage !== 'Final')} stations={stations} grandFinal={grandFinal} />
      )}
    </div>
  );
}

function ByTime({ mainRows, grandFinal }) {
  return (
    <>
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Main Stage</h2>
        <div className="card overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-3 border-b border-ink-100 text-[11px] uppercase tracking-wider text-ink-500 bg-ink-50/50">
            <div className="col-span-1">#</div>
            <div className="col-span-2">Stage / Round</div>
            <div className="col-span-1">Station</div>
            <div className="col-span-4">Match</div>
            <div className="col-span-2">Time</div>
            <div className="col-span-2 text-right">Score</div>
          </div>
          <ul>
            {mainRows.map((m) => <Row key={m.id} m={m} />)}
            {mainRows.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-ink-400">No matches for this filter.</li>
            )}
          </ul>
        </div>
      </section>

      {grandFinal && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Grand Final — Auditorium</h2>
          <div className="card overflow-hidden">
            <ul>
              <Row m={grandFinal} />
            </ul>
          </div>
        </section>
      )}
    </>
  );
}

function ByStation({ rows, stations, grandFinal }) {
  if (stations.length === 0) {
    return <div className="mt-6 card p-6 text-center text-ink-500">No station assignments yet.</div>;
  }
  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stations.map((st) => {
          const items = rows.filter((m) => m.station === st);
          return (
            <div key={st} className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100 bg-ink-50/50">
                <div className="flex items-center gap-2">
                  <span className={'h-2.5 w-2.5 rounded-full ' + stationDotClass(st)} />
                  <h3 className="font-display text-base font-semibold text-ink-800">{stationLabel(st)}</h3>
                </div>
                <span className="text-xs text-ink-500">{items.length} matches</span>
              </div>
              <ul>
                {items.map((m) => <StationRow key={m.id} m={m} />)}
                {items.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-ink-400">No matches assigned.</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
      {grandFinal && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Grand Final — Auditorium</h2>
          <div className="card overflow-hidden">
            <ul>
              <Row m={grandFinal} />
            </ul>
          </div>
        </section>
      )}
    </>
  );
}

function Row({ m }) {
  return (
    <li className="px-4 py-3 border-b last:border-b-0 border-ink-100 hover:bg-ink-50/40 transition">
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
        <div className="sm:col-span-1 text-xs font-semibold text-ink-700">{m.id}</div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
          <span className={`chip border ${stageColor(m.stage)}`}>{m.stage}</span>
          <span className="text-xs text-ink-500">{m.round}</span>
          {shouldShowStatus(m.status) && (
            <span className={`chip border ${statusBadgeClass(m.status)}`}>{statusLabel(m.status)}</span>
          )}
        </div>
        <div className="sm:col-span-1">
          {m.station ? (
            <span className={`chip border ${stationBadgeClass(m.station)}`}>
              <span className={'h-1.5 w-1.5 rounded-full ' + stationDotClass(m.station)} />
              {stationLabel(m.station)}
            </span>
          ) : (
            <span className="text-xs text-ink-400 italic">final</span>
          )}
        </div>
        <div className="sm:col-span-4 text-sm text-ink-800">
          <PlayerLabel side={m.resolvedA} ref={m.playerA} />
          <span className="mx-2 text-ink-400">vs</span>
          <PlayerLabel side={m.resolvedB} ref={m.playerB} />
        </div>
        <div className="sm:col-span-2 text-sm">
          <span className="font-semibold text-ink-800">{formatTime12(m.start)}</span>
          <span className="text-ink-400"> → </span>
          <span className="text-ink-500">{formatTime12(m.end)}</span>
        </div>
        <div className="sm:col-span-2 text-right text-sm font-semibold tabular-nums">
          {m.status === 'walkover' && m.winner ? (
            <span className="text-amber-700">W/O</span>
          ) : m.status === 'cancelled' ? (
            <span className="text-red-500">cancelled</span>
          ) : m.status === 'postponed' ? (
            <span className="text-violet-600">postponed</span>
          ) : m.scoreA != null && m.scoreB != null ? (
            <span className={m.winner ? 'text-brand-600' : 'text-ink-800'}>
              {m.scoreA} <span className="text-ink-400">–</span> {m.scoreB}
            </span>
          ) : (
            <span className="text-ink-300">—</span>
          )}
        </div>
      </div>
    </li>
  );
}

function StationRow({ m }) {
  return (
    <li className="px-4 py-3 border-b last:border-b-0 border-ink-100 hover:bg-ink-50/40 transition">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-ink-500">
            <span className="font-semibold text-ink-700">{m.id}</span>
            <span>·</span>
            <span>{m.round}</span>
            {shouldShowStatus(m.status) && (
              <span className={`chip border ${statusBadgeClass(m.status)}`}>{statusLabel(m.status)}</span>
            )}
          </div>
          <div className="mt-1 text-sm text-ink-800 truncate">
            <PlayerLabel side={m.resolvedA} ref={m.playerA} />
            <span className="mx-1.5 text-ink-400">vs</span>
            <PlayerLabel side={m.resolvedB} ref={m.playerB} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-ink-800">{formatTime12(m.start)}</div>
          <div className="text-[11px] text-ink-400">→ {formatTime12(m.end)}</div>
        </div>
      </div>
    </li>
  );
}

function PlayerLabel({ side, ref: r }) {
  if (side?.source === 'pending') {
    return <span className="text-ink-400 italic">Winner of {r?.id || side.from}</span>;
  }
  if (!side) return <span className="text-ink-400 italic">TBD</span>;
  return (
    <span>
      <span className="font-medium">{side.name}</span>
      {side.grade && <span className="text-ink-400 text-xs"> ({side.grade})</span>}
      {side.partner && <span className="text-ink-500"> + {side.partner}</span>}
    </span>
  );
}

function Pill({ label, value }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="text-sm font-semibold text-ink-800">{value}</div>
    </div>
  );
}

function ToggleButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-2 text-sm font-medium border-r last:border-r-0 border-ink-200 transition ' +
        (active ? 'bg-brand-500 text-white' : 'text-ink-600 hover:bg-ink-50')
      }
    >
      {children}
    </button>
  );
}

function FilterChip({ active, onClick, station, children }) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded-full px-3 py-1.5 text-xs font-medium border inline-flex items-center gap-1.5 transition ' +
        (active
          ? 'bg-ink-900 text-white border-ink-900'
          : 'bg-white text-ink-600 border-ink-200 hover:bg-ink-50')
      }
    >
      {station && <span className={'h-1.5 w-1.5 rounded-full ' + stationDotClass(station)} />}
      {children}
    </button>
  );
}

function Centered({ children }) {
  return <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 text-center text-ink-500">{children}</div>;
}
