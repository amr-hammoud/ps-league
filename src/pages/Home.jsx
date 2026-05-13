import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useFreshness, RefreshBanner } from '../lib/freshness.jsx';
import { formatTime12 } from '../lib/format.js';

export default function Home() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const { isStale, markLoaded } = useFreshness('schedule');

  const fetchAll = useCallback(async () => {
    try {
      const [p, s, b] = await Promise.all([api.players(), api.schedule(), api.bracket()]);
      setData({ players: p, schedule: s, bracket: b });
      markLoaded(Math.max(p._version || 0, s._version || 0, b._version || 0) || null);
    } catch (e) {
      setErr(e.message);
    }
  }, [markLoaded]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const champion = data && getChampion(data.bracket);
  const nextMatch = data && getNextMatch(data.schedule.rows);
  const totalMatches = data ? data.schedule.rows.length : 0;
  const completed = data ? data.schedule.rows.filter((m) => m.winner).length : 0;

  return (
    <div>
      {isStale && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4">
          <RefreshBanner onRefresh={fetchAll} />
        </div>
      )}
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-pattern absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <span className="chip border border-brand-100 bg-brand-50 text-brand-700">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> EA Sports FC26 · Single Elimination
              </span>
              <h1 className="mt-4 text-4xl sm:text-5xl font-bold text-ink-900 leading-tight">
                PS <span className="text-brand-500">League</span>
              </h1>
              <p className="mt-4 text-lg text-ink-600 max-w-xl">
                The official tournament hub for NASA International Schools. Follow the bracket, the schedule, and the road to champion — live.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link to="/bracket" className="btn-primary">View Bracket</Link>
                <Link to="/schedule" className="btn-outline">Match Schedule</Link>
              </div>

              {data && (
                <dl className="mt-10 grid grid-cols-4 gap-4 max-w-lg">
                  <Stat
                    label="Players"
                    value={data.players.players.length}
                    sub={(() => {
                      const late = data.players.players.filter((p) => p.lateRegistration).length;
                      return late > 0 ? `${late} late` : null;
                    })()}
                  />
                  <Stat label="Matches" value={totalMatches} />
                  <Stat label="Stations" value={data.schedule.settings.stations || 1} />
                  <Stat label="Played" value={`${completed}/${totalMatches}`} />
                </dl>
              )}
            </div>

            {/* Status card */}
            <div className="card p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-ink-800">Tournament Status</h2>
                <span className="chip bg-ink-100 text-ink-600">{data ? `${completed}/${totalMatches} done` : '…'}</span>
              </div>

              {champion ? (
                <div className="mt-5 rounded-2xl bg-brand-gradient text-white p-5">
                  <div className="text-xs uppercase tracking-widest opacity-80">Tournament Champion</div>
                  <div className="mt-1 text-2xl font-bold">{champion.name}</div>
                  <div className="text-sm opacity-80">{champion.grade} · {champion.tier}</div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-ink-100 bg-ink-50/60 p-5">
                  <div className="text-xs uppercase tracking-widest text-ink-500">Up Next</div>
                  {nextMatch ? (
                    <div className="mt-1">
                      <div className="flex items-center gap-2 text-xs text-ink-500">
                        <span>{nextMatch.id}</span>
                        <span>·</span>
                        <span>{nextMatch.round}</span>
                        <span>·</span>
                        <span>{formatTime12(nextMatch.start)}</span>
                      </div>
                      <div className="mt-2 text-lg font-semibold text-ink-800">
                        {nextMatch.resolvedA?.name || `Winner of ${nextMatch.playerA?.id}`}
                        <span className="mx-2 text-ink-400">vs</span>
                        {nextMatch.resolvedB?.name || `Winner of ${nextMatch.playerB?.id}`}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-ink-500">All matches are complete.</div>
                  )}
                </div>
              )}

              {data && (
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <Info label="Start" value={formatTime12(data.schedule.settings.startTime)} />
                  <Info label="Grand Final" value={formatTime12(data.schedule.settings.grandFinalStart)} />
                  <Info label="Match length" value={`${data.schedule.settings.matchDurationMin} min`} />
                  <Info label="Buffer" value={`${data.schedule.settings.bufferMin} min`} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tiers explainer */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <h2 className="font-display text-2xl font-semibold text-ink-800">How the tournament works</h2>
        <p className="mt-2 text-ink-500 max-w-2xl">
          Players compete within their tier until the Mixed Quarterfinals, where grades stop mattering and 8 players battle to one champion.
        </p>
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          <TierCard
            title="Tier 1 — G4 to G5"
            count={16}
            advances={4}
            stages={['R16', 'QF', 'Mixed QF']}
            accent="from-brand-500 to-brand-700"
          />
          <TierCard
            title="Tier 2 — G6 to G8"
            count={8}
            advances={2}
            stages={['R8', 'SF', 'Mixed QF']}
            accent="from-amber-400 to-amber-600"
          />
          <TierCard
            title="Tier 3 — G9 to G11"
            count={3}
            advances={2}
            stages={['Prelim', 'BYE', 'Mixed QF']}
            accent="from-emerald-400 to-emerald-600"
          />
        </div>
      </section>

      {err && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-6">
          <div className="card border-red-200 bg-red-50 text-red-700 p-4">Error: {err}</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-ink-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-ink-800">{value}</dd>
      {sub && <dd className="text-[11px] text-amber-700 font-medium">{sub}</dd>}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-ink-100 p-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="font-semibold text-ink-800">{value}</div>
    </div>
  );
}

function TierCard({ title, count, advances, stages, accent }) {
  return (
    <div className="card p-5">
      <div className={`h-1.5 -mt-5 -mx-5 mb-4 rounded-t-2xl bg-gradient-to-r ${accent}`} />
      <h3 className="font-display text-lg font-semibold text-ink-800">{title}</h3>
      <div className="mt-2 text-sm text-ink-500">
        <span className="font-semibold text-ink-700">{count}</span> players → <span className="font-semibold text-ink-700">{advances}</span> advance
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {stages.map((s) => (
          <span key={s} className="chip bg-ink-50 text-ink-600 border border-ink-100">{s}</span>
        ))}
      </div>
    </div>
  );
}

function getChampion(bracket) {
  if (!bracket) return null;
  // Identify the Grand Final by stage, not a hardcoded id — the id shifts
  // whenever the bracket is rebuilt or late-arrival play-ins are spliced in.
  const grandFinal = bracket.matches.find((m) => m.stage === 'Final');
  if (!grandFinal || !grandFinal.winner) return null;
  return grandFinal.resolvedA?.id === grandFinal.winner
    ? grandFinal.resolvedA
    : grandFinal.resolvedB;
}

function getNextMatch(rows) {
  return rows.find((m) => !m.winner) || null;
}
