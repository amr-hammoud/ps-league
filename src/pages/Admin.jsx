import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useFreshness, RefreshBanner } from '../lib/freshness.jsx';
import { formatTime12, stageColor, MATCH_STATUSES, statusLabel, statusBadgeClass, shouldShowStatus } from '../lib/format.js';

export default function Admin() {
  const [authed, setAuthed] = useState(null); // null = loading
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.session().then((r) => setAuthed(r.authed)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <Centered>Checking session…</Centered>;
  if (!authed) return <Login onAuthed={() => setAuthed(true)} setErr={setErr} err={err} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
}

function Login({ onAuthed, setErr, err }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.login(pw);
      onAuthed();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-20">
      <div className="card p-7">
        <div className="flex items-center gap-3">
          <img src="/brand/logo.png" alt="" className="h-9 w-auto" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">Admin</div>
            <div className="text-ink-500 text-sm">Sign in to manage the tournament.</div>
          </div>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
              required
            />
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [tab, setTab] = useState('matches');
  const [bracket, setBracket] = useState(null);
  const [settings, setSettings] = useState(null);
  const [players, setPlayers] = useState(null);
  const [toast, setToast] = useState(null);
  const { isStale, markLoaded } = useFreshness('schedule');

  // reload() runs both after a save (so the admin sees fresh data and the
  // freshness banner stays hidden for their own change) and when they click
  // "Refresh now" in response to another admin's edit.
  const reload = useCallback(async () => {
    const [b, s, p] = await Promise.all([api.bracket(), api.settings(), api.players()]);
    setBracket(b);
    setSettings(s);
    setPlayers(p);
    markLoaded(Math.max(b._version || 0, s._version || 0, p._version || 0) || null);
  }, [markLoaded]);

  useEffect(() => { reload(); }, [reload]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const logout = async () => { await api.logout(); onLogout(); };
  const reset = async () => {
    if (!confirm('Reset every score and winner? This cannot be undone.')) return;
    await api.resetAll();
    await reload();
    flash('Bracket reset.');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      {isStale && <RefreshBanner onRefresh={reload} label="The other admin made changes" />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Admin</h1>
          <p className="mt-1 text-ink-500">Record winners, adjust scores, and edit schedule settings.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="btn-outline text-red-600 border-red-200 hover:bg-red-50">Reset all</button>
          <button onClick={logout} className="btn-ghost">Sign out</button>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-ink-100">
        <TabButton active={tab === 'matches'} onClick={() => setTab('matches')}>Matches</TabButton>
        <TabButton active={tab === 'roster'} onClick={() => setTab('roster')}>
          Roster
          {players && players.players.some((p) => p.pending) && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
              {players.players.filter((p) => p.pending).length}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>Schedule Settings</TabButton>
      </div>

      <div className="mt-6">
        {tab === 'matches' && bracket && players && (
          <MatchEditor bracket={bracket} players={players} onChange={reload} flash={flash} />
        )}
        {tab === 'roster' && players && (
          <RosterEditor players={players} onChange={reload} flash={flash} />
        )}
        {tab === 'settings' && settings && (
          <SettingsEditor settings={settings} onSaved={reload} flash={flash} />
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-xl bg-ink-900 text-white px-4 py-3 text-sm shadow-soft animate-in fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-2 text-sm font-medium -mb-px border-b-2 transition ' +
        (active ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-700')
      }
    >
      {children}
    </button>
  );
}

function MatchEditor({ bracket, players, onChange, flash }) {
  const [swapOpen, setSwapOpen] = useState(false);

  const groups = [
    { label: 'Tier 1 — Play-ins',      rounds: /^PI-T1-/ },
    { label: 'Tier 2 — Play-ins',      rounds: /^PI-T2-/ },
    { label: 'Tier 3 — Semifinals',    rounds: /^SF-T3-/ },
    { label: 'Tier 1 — R16',           rounds: /^R16-/ },
    { label: 'Tier 2 — Quarterfinals', rounds: /^QF-T2-/ },
    { label: 'Tier 1 — Quarterfinals', rounds: /^QF-T1-/ },
    { label: 'Tier 2 — Semifinals',    rounds: /^SF-T2-/ },
    { label: 'Mixed — Quarterfinals',  rounds: /^MQF-/ },
    { label: 'Mixed — Semifinals',     rounds: /^MSF-/ },
    { label: 'Grand Final',            rounds: /^GRAND FINAL$/ },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          Tip: students can request to play each other — use <strong>Swap players</strong> to switch them between matches.
        </p>
        <button onClick={() => setSwapOpen(true)} className="btn-outline text-sm">
          Swap players
        </button>
      </div>

      {groups.map((g) => {
        const items = bracket.matches.filter((m) => g.rounds.test(m.round));
        if (!items.length) return null;
        return (
          <section key={g.label}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">{g.label}</h3>
            <div className="space-y-3">
              {items.map((m) => (
                <MatchRow
                  key={m.id}
                  m={m}
                  bracket={bracket}
                  players={players}
                  onSaved={() => { onChange(); flash(`Saved ${m.id}`); }}
                  onAssigned={() => { onChange(); flash(`Updated ${m.id}`); }}
                />
              ))}
            </div>
          </section>
        );
      })}

      {swapOpen && (
        <SwapDialog
          bracket={bracket}
          onClose={() => setSwapOpen(false)}
          onSwapped={async () => { await onChange(); setSwapOpen(false); flash('Players swapped.'); }}
        />
      )}
    </div>
  );
}

function MatchRow({ m, bracket, players, onSaved, onAssigned }) {
  const [scoreA, setScoreA] = useState(m.scoreA ?? '');
  const [scoreB, setScoreB] = useState(m.scoreB ?? '');
  const [winner, setWinner] = useState(m.winner ?? '');
  const [status, setStatus] = useState(m.status || 'scheduled');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [assignSide, setAssignSide] = useState(null); // 'playerA' | 'playerB' | null

  // Reset local state if the underlying match changes (e.g. after reset-all)
  useEffect(() => {
    setScoreA(m.scoreA ?? '');
    setScoreB(m.scoreB ?? '');
    setWinner(m.winner ?? '');
    setStatus(m.status || 'scheduled');
  }, [m.scoreA, m.scoreB, m.winner, m.status]);

  const aReady = m.resolvedA?.source !== 'pending' && m.resolvedA?.id;
  const bReady = m.resolvedB?.source !== 'pending' && m.resolvedB?.id;
  const canEdit = aReady && bReady;

  const isWalkover = status === 'walkover';
  const isCancelled = status === 'cancelled' || status === 'postponed';

  // Auto-suggest winner when scores are filled and different
  const suggestedWinner = (() => {
    if (isCancelled) return null;
    const a = Number(scoreA);
    const b = Number(scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || scoreA === '' || scoreB === '') return null;
    if (a === b) return null;
    return a > b ? m.resolvedA?.id : m.resolvedB?.id;
  })();

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      // The server normalizes scores/winner per status, but we send only what's
      // meaningful for the current state so the request body stays predictable.
      const payload = { status };
      if (isCancelled) {
        payload.scoreA = null;
        payload.scoreB = null;
        payload.winner = null;
      } else if (isWalkover) {
        payload.scoreA = null;
        payload.scoreB = null;
        payload.winner = winner || null;
      } else {
        payload.scoreA = scoreA === '' ? null : scoreA;
        payload.scoreB = scoreB === '' ? null : scoreB;
        payload.winner = winner || suggestedWinner || null;
      }
      await api.updateMatch(m.id, payload);
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (next) => {
    setStatus(next);
    if (next === 'cancelled' || next === 'postponed') {
      setWinner('');
      setScoreA('');
      setScoreB('');
    } else if (next === 'walkover') {
      setScoreA('');
      setScoreB('');
    } else if (next === 'scheduled') {
      setWinner('');
    }
  };

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-700">{m.id}</span>
          <span className={`chip border ${stageColor(m.stage)}`}>{m.stage}</span>
          <span className="text-xs text-ink-500">{m.round}</span>
          {shouldShowStatus(status) && (
            <span className={`chip border ${statusBadgeClass(status)}`}>{statusLabel(status)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-ink-500">Status</label>
          <select
            value={status}
            onChange={(e) => changeStatus(e.target.value)}
            className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:border-brand-500"
            disabled={!canEdit}
          >
            {MATCH_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      {!canEdit && (
        <div className="mb-2 text-xs text-ink-400 italic">Waiting on previous match</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PlayerInput
          side={m.resolvedA}
          score={scoreA}
          onScore={setScoreA}
          selected={winner === m.resolvedA?.id}
          onSelect={() => setWinner(m.resolvedA?.id || '')}
          disabled={!canEdit || isCancelled}
          scoreless={isWalkover || isCancelled}
          editable={isSlotEditable(m, 'playerA')}
          onEdit={() => setAssignSide('playerA')}
        />
        <PlayerInput
          side={m.resolvedB}
          score={scoreB}
          onScore={setScoreB}
          selected={winner === m.resolvedB?.id}
          onSelect={() => setWinner(m.resolvedB?.id || '')}
          disabled={!canEdit || isCancelled}
          scoreless={isWalkover || isCancelled}
          editable={isSlotEditable(m, 'playerB')}
          onEdit={() => setAssignSide('playerB')}
        />
      </div>

      {assignSide && (
        <AssignPlayerDialog
          matchId={m.id}
          side={assignSide}
          bracket={bracket}
          players={players}
          onClose={() => setAssignSide(null)}
          onAssigned={() => { setAssignSide(null); onAssigned && onAssigned(); }}
        />
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-ink-500">
          {isCancelled ? (
            <span className="italic">No winner — {statusLabel(status).toLowerCase()}.</span>
          ) : isWalkover ? (
            winner ? (
              <span>Walkover winner: <strong className="text-ink-800">{winnerName(m, winner)}</strong></span>
            ) : (
              <span className="italic">Pick which player advances on walkover.</span>
            )
          ) : winner ? (
            <span>Winner: <strong className="text-ink-800">{winnerName(m, winner)}</strong></span>
          ) : suggestedWinner ? (
            <span>Suggested: <strong className="text-ink-800">{winnerName(m, suggestedWinner)}</strong></span>
          ) : (
            <span className="italic">Pick a winner or fill scores.</span>
          )}
          {err && <span className="ml-2 text-red-600">{err}</span>}
        </div>
        <div className="flex gap-2">
          {winner && !isCancelled && (
            <button onClick={() => setWinner('')} className="btn-ghost text-xs">Clear winner</button>
          )}
          <button onClick={save} className="btn-primary text-sm" disabled={busy || !canEdit}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// A slot is editable when it isn't a "winner of Mx" reference AND its match
// hasn't started yet (no winner, no scores, no special status).
function isSlotEditable(m, side) {
  const ref = m[side];
  if (ref && ref.type === 'winner') return false;
  if (m.winner) return false;
  if (m.scoreA != null || m.scoreB != null) return false;
  if (m.status && m.status !== 'scheduled') return false;
  return true;
}

function PlayerInput({ side, score, onScore, selected, onSelect, disabled, scoreless, editable, onEdit }) {
  const pending = side?.source === 'pending';
  const empty = !side;
  return (
    <div
      className={
        'rounded-xl border p-3 transition ' +
        (disabled || pending
          ? 'border-ink-100 bg-ink-50 cursor-not-allowed'
          : empty
          ? 'border-dashed border-ink-200 bg-ink-50/40'
          : selected
          ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-500/15 cursor-pointer'
          : 'border-ink-200 bg-white hover:border-brand-300 cursor-pointer')
      }
      onClick={() => !disabled && !pending && !empty && onSelect()}
      role={empty ? undefined : 'button'}
      tabIndex={empty ? -1 : 0}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={'text-sm font-semibold truncate ' + (pending || empty ? 'text-ink-400 italic' : 'text-ink-800')}>
            {empty ? 'TBD — click "Change player"' : side?.name || '—'}
          </div>
          {!pending && !empty && side?.grade && (
            <div className="text-[11px] text-ink-500">
              {side.grade}
              {side.partner && <> · + {side.partner}</>}
            </div>
          )}
          {editable && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit && onEdit(); }}
              className="mt-1 text-[11px] font-medium text-brand-600 hover:underline"
            >
              {empty ? 'Assign player →' : 'Change player'}
            </button>
          )}
        </div>
        {scoreless ? (
          <span className={'w-16 text-center text-xs font-semibold uppercase tracking-wider ' + (selected ? 'text-brand-600' : 'text-ink-400')}>
            {selected ? 'Advance' : '—'}
          </span>
        ) : (
          <input
            type="number"
            min="0"
            max="99"
            value={score}
            onChange={(e) => onScore(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            disabled={disabled || pending || empty}
            className="w-16 rounded-lg border border-ink-200 px-2 py-1 text-center font-semibold tabular-nums focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:border-brand-500 disabled:bg-ink-100 disabled:text-ink-400"
            placeholder="–"
          />
        )}
      </div>
    </div>
  );
}

// Pick a player to put in a specific slot. The list is grouped by tier with
// each player labeled by their current location ("In M5", "Unassigned"), so
// the admin can see at a glance whether they're moving someone or filling an
// empty slot.
function AssignPlayerDialog({ matchId, side, bracket, players, onClose, onAssigned }) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const target = bracket.matches.find((m) => m.id === matchId);
  const currentId = target && target[side] && target[side].type === 'player' ? target[side].id : null;

  // playerId → { matchId, side } for everyone currently in a direct slot
  const slotIndex = (() => {
    const idx = {};
    for (const m of bracket.matches) {
      if (m.playerA && m.playerA.type === 'player') idx[m.playerA.id] = { matchId: m.id, side: 'playerA' };
      if (m.playerB && m.playerB.type === 'player') idx[m.playerB.id] = { matchId: m.id, side: 'playerB' };
    }
    return idx;
  })();

  const eligible = players.players
    .filter((p) => !p.withdrawn && !p.pending)
    .filter((p) => tierFilter === 'all' || p.tier === tierFilter)
    .filter((p) => {
      const q = search.toLowerCase().trim();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.parent || '').toLowerCase().includes(q) ||
        (p.teammate || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const pick = async (playerId) => {
    setBusy(true);
    setErr(null);
    try {
      await api.setSlot(matchId, side, playerId);
      onAssigned();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
      <div className="card max-w-2xl w-full max-h-[85vh] flex flex-col p-6">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-800">
            Assign player to {matchId} · side {side === 'playerA' ? 'A' : 'B'}
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            Picking a player here moves them from their current slot (if any). Whoever is currently in this slot becomes unassigned.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-48"
            placeholder="Search by name or parent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="flex rounded-xl border border-ink-200 bg-white overflow-hidden">
            {['all', 'T1', 'T2', 'T3'].map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={
                  'px-3 py-2 text-xs font-medium border-r last:border-r-0 border-ink-200 ' +
                  (tierFilter === t ? 'bg-brand-500 text-white' : 'text-ink-600 hover:bg-ink-50')
                }
              >
                {t === 'all' ? 'All' : t}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto space-y-1.5 pr-1">
          <button
            type="button"
            onClick={() => pick(null)}
            disabled={busy || !currentId}
            className="w-full rounded-xl border border-dashed border-ink-200 px-3 py-2 text-sm text-left text-ink-600 hover:bg-ink-50 disabled:opacity-50"
          >
            ✕ Clear this slot (leave empty)
          </button>
          {eligible.map((p) => {
            const slot = slotIndex[p.id];
            const isCurrent = slot && slot.matchId === matchId && slot.side === side;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.id)}
                disabled={busy || isCurrent}
                className={
                  'w-full rounded-xl border px-3 py-2 text-sm flex items-center justify-between gap-3 text-left transition ' +
                  (isCurrent
                    ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-500/15 cursor-default'
                    : 'border-ink-100 hover:border-brand-300 hover:bg-brand-50')
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink-800 truncate">{p.name}</div>
                  <div className="text-[11px] text-ink-500 truncate">
                    {p.grade} · {p.tier}
                    {p.teammate ? <> · 🤝 {p.teammate}</> : p.parent ? <> · + {p.parent}</> : null}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] font-medium">
                  {isCurrent ? (
                    <span className="text-brand-700">Currently here</span>
                  ) : slot ? (
                    <span className="text-ink-500">In {slot.matchId}</span>
                  ) : (
                    <span className="text-amber-600">Unassigned</span>
                  )}
                </div>
              </button>
            );
          })}
          {eligible.length === 0 && (
            <div className="text-center py-6 text-sm text-ink-400">No players match this filter.</div>
          )}
        </div>

        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="btn-ghost" disabled={busy}>Close</button>
        </div>
      </div>
    </div>
  );
}

function winnerName(m, id) {
  if (m.resolvedA?.id === id) return m.resolvedA.name;
  if (m.resolvedB?.id === id) return m.resolvedB.name;
  return id;
}

function SettingsEditor({ settings, onSaved, flash }) {
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.updateSettings(form);
      onSaved();
      flash('Settings saved.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card p-6 max-w-2xl">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Start time" hint={`Preview: ${formatTime12(form.startTime)}`}>
          <input className="input" type="time" value={form.startTime} onChange={update('startTime')} />
        </Field>
        <Field label="Grand Final start" hint={`Preview: ${formatTime12(form.grandFinalStart)}`}>
          <input className="input" type="time" value={form.grandFinalStart} onChange={update('grandFinalStart')} />
        </Field>
        <Field label="Match duration (min)">
          <input className="input" type="number" min="1" value={form.matchDurationMin} onChange={update('matchDurationMin')} />
        </Field>
        <Field label="Buffer between matches (min)">
          <input className="input" type="number" min="0" value={form.bufferMin} onChange={update('bufferMin')} />
        </Field>
        <Field label="Number of stations" hint="Parallel PlayStations running simultaneously (1–8).">
          <input className="input" type="number" min="1" max="8" value={form.stations ?? 1} onChange={update('stations')} />
        </Field>
        <Field label="Tournament date">
          <input className="input" type="date" value={form.tournamentDate || ''} onChange={update('tournamentDate')} />
        </Field>
        <Field label="Main venue">
          <input className="input" type="text" value={form.venue || ''} onChange={update('venue')} />
        </Field>
        <Field label="Grand Final venue">
          <input className="input" type="text" value={form.grandFinalVenue || ''} onChange={update('grandFinalVenue')} />
        </Field>
      </div>
      {err && <div className="mt-4 text-sm text-red-600">{err}</div>}
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={() => setForm(settings)} className="btn-ghost">Discard</button>
        <button onClick={save} className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <div className="mt-1 text-[11px] text-ink-500">{hint}</div>}
    </div>
  );
}

function Centered({ children }) {
  return <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 text-center text-ink-500">{children}</div>;
}

// --- Roster tab ---

const GRADE_OPTIONS = ['G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'];

function gradeToTier(grade) {
  if (grade === 'G4' || grade === 'G5') return 'T1';
  if (grade === 'G6' || grade === 'G7' || grade === 'G8') return 'T2';
  return 'T3';
}

function RosterEditor({ players, onChange, flash }) {
  const pending = players.players.filter((p) => p.pending && !p.withdrawn);
  const studentPairs = players.players.filter((p) => p.teammate && p.teammatePlayerId);
  const bracketed = players.players.filter((p) => !p.pending && !p.withdrawn);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const result = await api.generateBrackets();
      const matchCount = (result.summary || []).reduce((n, s) => n + s.newMatches.length, 0);
      flash(`Integrated ${pending.length} player${pending.length === 1 ? '' : 's'} via ${matchCount} new match${matchCount === 1 ? '' : 'es'}.`);
      setConfirming(false);
      await onChange();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <AddPlayerCard onAdded={onChange} flash={flash} />

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-800">Pending players</h3>
            <p className="text-sm text-ink-500">
              {pending.length === 0
                ? 'No new players waiting. Add one above when registrations come in.'
                : `${pending.length} new player${pending.length === 1 ? '' : 's'} waiting to be integrated into the bracket.`}
            </p>
          </div>
          {pending.length > 0 && (
            <button onClick={() => setConfirming(true)} className="btn-primary" disabled={busy}>
              Generate brackets
            </button>
          )}
        </div>

        {pending.length > 0 && (
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {pending.map((p) => (
              <PendingRow key={p.id} p={p} onChange={onChange} flash={flash} />
            ))}
          </div>
        )}

        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      </section>

      <TeamPairingCard players={players} pairs={studentPairs} onChange={onChange} flash={flash} />

      <section className="card p-5">
        <h3 className="font-display text-lg font-semibold text-ink-800">In the bracket</h3>
        <p className="text-sm text-ink-500">{bracketed.length} player{bracketed.length === 1 ? '' : 's'} already seeded. These are read-only.</p>
        <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {bracketed.map((p) => {
            const partner = p.teammate || p.parent;
            return (
              <div key={p.id} className="rounded-lg border border-ink-100 px-3 py-2 text-sm">
                <div className="font-semibold text-ink-800 truncate">{p.name}</div>
                <div className="text-[11px] text-ink-500">
                  {p.id} · {p.grade} · {p.tier}
                  {partner && <> · {p.teammate ? '🤝 ' : ''}{partner}</>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {confirming && (
        <ConfirmDialog
          pending={pending}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={generate}
        />
      )}
    </div>
  );
}

function AddPlayerCard({ onAdded, flash }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('G4');
  const [parent, setParent] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.addPlayer({ name, grade, parent, contact });
      flash(`Added ${name} (${grade}).`);
      setName('');
      setParent('');
      setContact('');
      setGrade('G4');
      await onAdded();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-5">
      <h3 className="font-display text-lg font-semibold text-ink-800">Add a new player</h3>
      <p className="text-sm text-ink-500">They'll sit in the Pending list until you click Generate brackets.</p>
      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Student name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Hassan Al-Maliki" />
        </Field>
        <Field label="Grade" hint={`Tier ${gradeToTier(grade).slice(1)} (${gradeToTier(grade)})`}>
          <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Parent name">
          <input className="input" value={parent} onChange={(e) => setParent(e.target.value)} placeholder="optional" />
        </Field>
        <Field label="Contact">
          <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="optional" />
        </Field>
      </div>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      <div className="mt-4 flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy || !name}>
          {busy ? 'Adding…' : 'Add player'}
        </button>
      </div>
    </form>
  );
}

function PendingRow({ p, onChange, flash }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!confirm(`Remove ${p.name} from pending?`)) return;
    setBusy(true);
    try {
      await api.removePlayer(p.id);
      flash(`Removed ${p.name}.`);
      await onChange();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink-800 truncate">{p.name}</div>
        <div className="text-[11px] text-ink-500">
          {p.id} · {p.grade} · {p.tier}
          {p.parent && <> · {p.parent}</>}
        </div>
      </div>
      <button onClick={remove} disabled={busy} className="btn-ghost text-xs text-red-600 hover:bg-red-50">
        Remove
      </button>
    </div>
  );
}

// Swap two players between their bracket slots. The 2v2 partner travels with
// the captain because it's part of the player record (not the bracket).
function SwapDialog({ bracket, onClose, onSwapped }) {
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Build the eligible list from the bracket itself — only direct entries in
  // matches that haven't started, plus the opponent label for context.
  const eligible = (() => {
    const out = [];
    for (const m of bracket.matches) {
      if (m.winner) continue;
      if (m.scoreA != null || m.scoreB != null) continue;
      if (m.status && m.status !== 'scheduled') continue;
      const sides = [
        { side: 'A', ref: m.playerA, resolved: m.resolvedA, opp: m.resolvedB },
        { side: 'B', ref: m.playerB, resolved: m.resolvedB, opp: m.resolvedA },
      ];
      for (const s of sides) {
        if (s.ref && s.ref.type === 'player' && s.resolved && s.resolved.id) {
          out.push({
            id: s.resolved.id,
            name: s.resolved.name,
            grade: s.resolved.grade,
            partner: s.resolved.partner,
            matchId: m.id,
            round: m.round,
            opp: s.opp,
          });
        }
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const slotA = eligible.find((e) => e.id === playerAId);
  const slotB = eligible.find((e) => e.id === playerBId);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.swapPlayers(playerAId, playerBId);
      onSwapped();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
      <div className="card max-w-xl w-full p-6">
        <h3 className="font-display text-lg font-semibold text-ink-800">Swap two players</h3>
        <p className="mt-2 text-sm text-ink-500">
          Pick two students currently waiting for their first match. They'll exchange bracket slots — their 2v2 partner travels with them.
        </p>

        <div className="mt-4 space-y-3">
          <Field label="Player 1">
            <select className="input" value={playerAId} onChange={(e) => setPlayerAId(e.target.value)}>
              <option value="">— pick a player —</option>
              {eligible.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.grade}) — {p.matchId} {p.round}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Player 2">
            <select className="input" value={playerBId} onChange={(e) => setPlayerBId(e.target.value)}>
              <option value="">— pick a player —</option>
              {eligible.filter((p) => p.id !== playerAId).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.grade}) — {p.matchId} {p.round}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {slotA && slotB && (
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
              <div className="text-[11px] uppercase tracking-wider text-ink-500">Before</div>
              <div className="mt-1 text-sm">
                <div><strong className="text-ink-800">{slotA.matchId}</strong> · {slotA.round}: <span className="text-ink-700">{slotA.name}</span> vs {slotA.opp?.name || 'TBD'}</div>
                <div className="mt-1"><strong className="text-ink-800">{slotB.matchId}</strong> · {slotB.round}: <span className="text-ink-700">{slotB.name}</span> vs {slotB.opp?.name || 'TBD'}</div>
              </div>
            </div>
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
              <div className="text-[11px] uppercase tracking-wider text-brand-700">After swap</div>
              <div className="mt-1 text-sm">
                <div><strong className="text-ink-800">{slotA.matchId}</strong> · {slotA.round}: <span className="text-brand-700 font-semibold">{slotB.name}</span> vs {slotA.opp?.name || 'TBD'}</div>
                <div className="mt-1"><strong className="text-ink-800">{slotB.matchId}</strong> · {slotB.round}: <span className="text-brand-700 font-semibold">{slotA.name}</span> vs {slotB.opp?.name || 'TBD'}</div>
              </div>
            </div>
          </div>
        )}

        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost" disabled={busy}>Cancel</button>
          <button onClick={submit} className="btn-primary" disabled={busy || !playerAId || !playerBId}>
            {busy ? 'Swapping…' : 'Confirm swap'}
          </button>
        </div>
      </div>
    </div>
  );
}

// "Student pairs" — for kids whose parents didn't come. The admin picks two
// players; one becomes captain, the other is marked withdrawn and their
// pending match becomes a walkover for whoever they were about to face.
function TeamPairingCard({ players, pairs, onChange, flash }) {
  const [open, setOpen] = useState(false);
  const [captainId, setCaptainId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Only players currently in the bracket, not already withdrawn, not already
  // captains of another pair. Sorted alphabetically for quick visual scanning.
  const eligible = players.players
    .filter((p) => !p.withdrawn && !p.teammate && !p.pending)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const submit = async () => {
    if (!captainId || !partnerId) { setErr('Pick two players.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const result = await api.mergeTeam(captainId, partnerId);
      const captain = players.players.find((p) => p.id === captainId);
      const partner = players.players.find((p) => p.id === partnerId);
      flash(
        `Paired ${captain?.name} + ${partner?.name}` +
        (result.walkoverMatches?.length
          ? ` (${result.walkoverMatches.length} match${result.walkoverMatches.length === 1 ? '' : 'es'} marked walkover)`
          : ''),
      );
      setOpen(false);
      setCaptainId('');
      setPartnerId('');
      await onChange();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const unpair = async (p) => {
    if (!confirm(`Un-pair ${p.name} + ${p.teammate}? Any walkover matches caused by this pairing must be reset manually.`)) return;
    try {
      await api.unmergeTeam(p.id);
      flash(`Un-paired ${p.name}.`);
      await onChange();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-800">Student pairs (2v2)</h3>
          <p className="text-sm text-ink-500">
            For students playing without a parent. Their partner's pending match becomes an automatic walkover.
          </p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary text-sm">
          Pair two students
        </button>
      </div>

      {pairs.length > 0 ? (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {pairs.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-800 truncate">{p.name}</div>
                <div className="text-[11px] text-ink-500">
                  + {p.teammate}
                </div>
                <div className="text-[11px] text-ink-500">{p.id} · {p.grade} · {p.tier}</div>
              </div>
              <button onClick={() => unpair(p)} className="btn-ghost text-xs text-red-600 hover:bg-red-50 shrink-0">
                Un-pair
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-ink-400 italic">No student pairs yet.</div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
          <div className="card max-w-lg w-full p-6">
            <h3 className="font-display text-lg font-semibold text-ink-800">Pair two students</h3>
            <p className="mt-2 text-sm text-ink-500">
              Pick the captain (whose bracket slot the team will keep) and the partner (whose slot becomes a walkover for their opponent).
            </p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <Field label="Captain (keeps bracket slot)">
                <select className="input" value={captainId} onChange={(e) => setCaptainId(e.target.value)}>
                  <option value="">— pick a player —</option>
                  {eligible.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.grade})</option>
                  ))}
                </select>
              </Field>
              <Field label="Partner (will be merged in)">
                <select className="input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                  <option value="">— pick a player —</option>
                  {eligible.filter((p) => p.id !== captainId).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.grade})</option>
                  ))}
                </select>
              </Field>
            </div>
            {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setOpen(false); setErr(null); }} className="btn-ghost" disabled={busy}>Cancel</button>
              <button onClick={submit} className="btn-primary" disabled={busy || !captainId || !partnerId}>
                {busy ? 'Pairing…' : 'Pair them'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ConfirmDialog({ pending, busy, onCancel, onConfirm }) {
  const byTier = { T1: [], T2: [], T3: [] };
  for (const p of pending) byTier[p.tier].push(p);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
      <div className="card max-w-lg w-full p-6">
        <h3 className="font-display text-lg font-semibold text-ink-800">Generate brackets?</h3>
        <p className="mt-2 text-sm text-ink-500">
          This appends new play-in matches and only changes <strong>scheduled</strong> matches in the bracket. Completed or in-progress matches stay exactly as they are.
        </p>

        <div className="mt-4 space-y-2">
          {['T1', 'T2', 'T3'].map((t) => {
            const players = byTier[t];
            if (players.length === 0) return null;
            const tierName = t === 'T1' ? 'Tier 1' : t === 'T2' ? 'Tier 2' : 'Tier 3';
            // K new players in a tier produces K play-in matches:
            //  K-1 among them, then 1 final vs a displaced existing player.
            return (
              <div key={t} className="rounded-lg border border-ink-100 p-3 text-sm">
                <div className="font-semibold text-ink-800">{tierName} — {players.length} new</div>
                <div className="text-ink-600 mt-1">
                  {players.map((p) => p.name).join(', ')}
                </div>
                <div className="text-[11px] text-ink-500 mt-1">
                  Adds {players.length} match{players.length === 1 ? '' : 'es'}: {players.length > 1 ? `${players.length - 1} among new + 1 ` : '1 '}vs existing slot.
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost" disabled={busy}>Cancel</button>
          <button onClick={onConfirm} className="btn-primary" disabled={busy}>
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
