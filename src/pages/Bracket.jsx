import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { api } from '../lib/api.js';
import {
  stageColor,
  statusLabel,
  statusBadgeClass,
  shouldShowStatus,
  stationBadgeClass,
  stationDotClass,
  stationLabel,
  formatTime12,
} from '../lib/format.js';

// Card dimensions — kept compact so the whole bracket can fit in a single
// pannable canvas without each match feeling cramped.
const NODE_WIDTH = 290;
const NODE_HEIGHT = 138;

// --- Layout: dagre converts the match DAG into XY positions. We declare
// horizontal flow so progression reads left → right like a classic bracket.
function layoutMatches(matches) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: 90, nodesep: 22, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const m of matches) {
    g.setNode(m.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const m of matches) {
    if (m.playerA && m.playerA.type === 'winner') g.setEdge(m.playerA.id, m.id);
    if (m.playerB && m.playerB.type === 'winner') g.setEdge(m.playerB.id, m.id);
  }

  dagre.layout(g);

  const pos = {};
  for (const id of g.nodes()) {
    const n = g.node(id);
    pos[id] = { x: n.x - n.width / 2, y: n.y - n.height / 2 };
  }
  return pos;
}

// --- Custom node renderer. Looks like a match card but the connecting edges
// are drawn by React Flow so the bracket flow stays readable when filtered.
const MatchNode = memo(function MatchNode({ data }) {
  const { match, scheduleRow, highlight } = data;
  const winnerId = match.winner;
  const aWins = winnerId && match.resolvedA && match.resolvedA.id === winnerId;
  const bWins = winnerId && match.resolvedB && match.resolvedB.id === winnerId;
  const station = scheduleRow ? scheduleRow.station : null;

  const outerCls =
    'bg-white rounded-2xl border-2 transition shadow-soft cursor-pointer ' +
    (highlight === 'on'
      ? 'border-brand-500 ring-4 ring-brand-500/20'
      : highlight === 'dim'
      ? 'border-ink-100 opacity-25'
      : 'border-ink-100 hover:border-brand-300');

  return (
    <div className={outerCls} style={{ width: NODE_WIDTH }}>
      <Handle type="target" position={Position.Left} style={handleStyle} />

      <div className="px-3 py-2 flex items-center justify-between gap-1.5 border-b border-ink-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold text-ink-700 shrink-0">{match.id}</span>
          <span className="text-[11px] text-ink-500 truncate">{match.round}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {station && (
            <span className={'chip border text-[10px] ' + stationBadgeClass(station)}>
              <span className={'h-1.5 w-1.5 rounded-full ' + stationDotClass(station)} />
              {stationLabel(station)}
            </span>
          )}
          <span className={'chip border text-[10px] ' + stageColor(match.stage)}>{match.stage}</span>
        </div>
      </div>

      <Side label={match.resolvedA} score={match.scoreA} winning={aWins} status={match.status} />
      <div className="mx-3 border-t border-dashed border-ink-100" />
      <Side label={match.resolvedB} score={match.scoreB} winning={bWins} status={match.status} />

      <div className="px-3 py-1.5 text-[10px] border-t border-ink-100 bg-ink-50/60 rounded-b-2xl flex items-center justify-between">
        <div className="text-ink-500">
          {scheduleRow && scheduleRow.start ? (
            <span>{formatTime12(scheduleRow.start)} → {formatTime12(scheduleRow.end)}</span>
          ) : (
            <span className="italic text-ink-400">unscheduled</span>
          )}
        </div>
        {shouldShowStatus(match.status) && (
          <span className={'chip border text-[10px] ' + statusBadgeClass(match.status)}>
            {statusLabel(match.status)}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
});

const handleStyle = { opacity: 0, pointerEvents: 'none' };

function Side({ label, score, winning, status }) {
  const isPending = label && label.source === 'pending';
  // For walkovers, label the winner's "score" as W instead of a numeric value.
  const scoreText = status === 'walkover' && winning ? 'W' : (score == null ? '–' : score);
  return (
    <div className={'flex items-center justify-between px-3 py-2 ' + (winning ? 'bg-brand-50' : '')}>
      <div className="min-w-0 flex items-center gap-2">
        {winning && <span className="h-2 w-2 rounded-full bg-brand-500 shrink-0" />}
        <span
          className={
            'text-sm truncate ' +
            (isPending ? 'text-ink-400 italic' : winning ? 'font-semibold text-brand-800' : 'font-medium text-ink-800')
          }
        >
          {(label && label.name) || 'TBD'}
        </span>
        {label && label.grade && !isPending && <span className="text-[10px] text-ink-400 shrink-0">{label.grade}</span>}
      </div>
      <span className={'text-sm font-bold tabular-nums shrink-0 ml-2 ' + (winning ? 'text-brand-600' : 'text-ink-400')}>
        {scoreText}
      </span>
    </div>
  );
}

const nodeTypes = { match: MatchNode };

const STAGE_OPTIONS = ['all', 'Tier 1', 'Tier 2', 'Tier 3', 'Mixed', 'Final'];

export default function Bracket() {
  const [bracket, setBracket] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [err, setErr] = useState(null);
  const [stageFilter, setStageFilter] = useState('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  useEffect(() => {
    Promise.all([api.bracket(), api.schedule()])
      .then(([b, s]) => { setBracket(b); setSchedule(s); })
      .catch((e) => setErr(e.message));
  }, []);

  const scheduleByMatch = useMemo(() => {
    const idx = {};
    if (schedule) for (const r of schedule.rows) idx[r.id] = r;
    return idx;
  }, [schedule]);

  const positions = useMemo(() => (bracket ? layoutMatches(bracket.matches) : {}), [bracket]);

  // Compute the lineage (all upstream + downstream matches) of the selection.
  // Used to dim the rest of the bracket so the path stands out clearly.
  const highlightSet = useMemo(() => {
    if (!bracket || !selectedMatchId) return null;
    const set = new Set([selectedMatchId]);
    const upstream = (id) => {
      const m = bracket.matches.find((mm) => mm.id === id);
      if (!m) return;
      if (m.playerA && m.playerA.type === 'winner' && !set.has(m.playerA.id)) {
        set.add(m.playerA.id);
        upstream(m.playerA.id);
      }
      if (m.playerB && m.playerB.type === 'winner' && !set.has(m.playerB.id)) {
        set.add(m.playerB.id);
        upstream(m.playerB.id);
      }
    };
    const downstream = (id) => {
      for (const m of bracket.matches) {
        const usesA = m.playerA && m.playerA.type === 'winner' && m.playerA.id === id;
        const usesB = m.playerB && m.playerB.type === 'winner' && m.playerB.id === id;
        if (usesA || usesB) {
          if (!set.has(m.id)) {
            set.add(m.id);
            downstream(m.id);
          }
        }
      }
    };
    upstream(selectedMatchId);
    downstream(selectedMatchId);
    return set;
  }, [bracket, selectedMatchId]);

  const matchVisible = useCallback(
    (m) => {
      if (stageFilter !== 'all' && m.stage !== stageFilter) return false;
      if (stationFilter !== 'all') {
        const st = scheduleByMatch[m.id] && scheduleByMatch[m.id].station;
        if (String(st) !== stationFilter) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const a = (m.resolvedA && m.resolvedA.name) ? m.resolvedA.name.toLowerCase() : '';
        const b = (m.resolvedB && m.resolvedB.name) ? m.resolvedB.name.toLowerCase() : '';
        if (!a.includes(q) && !b.includes(q)) return false;
      }
      return true;
    },
    [stageFilter, stationFilter, search, scheduleByMatch],
  );

  const nodes = useMemo(() => {
    if (!bracket) return [];
    return bracket.matches.map((m) => {
      let highlight = 'normal';
      const visible = matchVisible(m);
      if (highlightSet) {
        highlight = highlightSet.has(m.id) ? 'on' : 'dim';
      } else if (!visible) {
        highlight = 'dim';
      }
      return {
        id: m.id,
        type: 'match',
        position: positions[m.id] || { x: 0, y: 0 },
        data: { match: m, scheduleRow: scheduleByMatch[m.id], highlight },
        draggable: false,
        selectable: true,
      };
    });
  }, [bracket, positions, scheduleByMatch, matchVisible, highlightSet]);

  const edges = useMemo(() => {
    if (!bracket) return [];
    const out = [];
    for (const m of bracket.matches) {
      const addEdge = (side, label) => {
        if (!side || side.type !== 'winner') return;
        const source = bracket.matches.find((mm) => mm.id === side.id);
        const sourceDecided = !!(source && source.winner);
        const inHighlight = highlightSet ? highlightSet.has(side.id) && highlightSet.has(m.id) : true;
        const visibleBoth = matchVisible(m) && (source ? matchVisible(source) : true);
        const baseDimmed = !visibleBoth || (highlightSet && !inHighlight);
        const colorActive = '#9D3689';
        const colorIdle = '#B8B9BE';
        const stroke = sourceDecided ? colorActive : colorIdle;
        out.push({
          id: `${side.id}-${m.id}-${label}`,
          source: side.id,
          target: m.id,
          animated: sourceDecided && !baseDimmed,
          style: {
            stroke,
            strokeWidth: !baseDimmed ? 2 : 1,
            opacity: baseDimmed ? 0.15 : 1,
            strokeDasharray: sourceDecided ? null : '5 4',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
            width: 18,
            height: 18,
          },
        });
      };
      addEdge(m.playerA, 'a');
      addEdge(m.playerB, 'b');
    }
    return out;
  }, [bracket, highlightSet, matchVisible]);

  const champion = useMemo(() => {
    if (!bracket) return null;
    const gf = bracket.matches.find((m) => m.stage === 'Final');
    if (!gf || !gf.winner) return null;
    return gf.resolvedA && gf.resolvedA.id === gf.winner ? gf.resolvedA : gf.resolvedB;
  }, [bracket]);

  if (err) return <Centered>Error: {err}</Centered>;
  if (!bracket) return <Centered>Loading bracket…</Centered>;

  const stations = (() => {
    const set = new Set();
    if (schedule) for (const r of schedule.rows) if (r.station) set.add(r.station);
    return [...set].sort((a, b) => a - b);
  })();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Bracket</h1>
          <p className="mt-1 text-ink-500">
            Click any match to highlight its path through the tournament. Drag the canvas to pan, scroll to zoom.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <Legend dot="bg-brand-500" label="Decided" />
          <Legend dot="bg-ink-300" label="Pending" dashed />
        </div>
      </div>

      {champion && (
        <div className="mt-5 card overflow-hidden">
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

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          className="input w-56"
          placeholder="Search player…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex rounded-xl border border-ink-200 bg-white overflow-hidden">
          {STAGE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={
                'px-3 py-2 text-xs font-medium border-r last:border-r-0 border-ink-200 ' +
                (stageFilter === s ? 'bg-brand-500 text-white' : 'text-ink-600 hover:bg-ink-50')
              }
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        {stations.length > 0 && (
          <div className="flex rounded-xl border border-ink-200 bg-white overflow-hidden">
            <button
              onClick={() => setStationFilter('all')}
              className={
                'px-3 py-2 text-xs font-medium border-r last:border-r-0 border-ink-200 ' +
                (stationFilter === 'all' ? 'bg-brand-500 text-white' : 'text-ink-600 hover:bg-ink-50')
              }
            >
              All stations
            </button>
            {stations.map((st) => (
              <button
                key={st}
                onClick={() => setStationFilter(String(st))}
                className={
                  'px-3 py-2 text-xs font-medium border-r last:border-r-0 border-ink-200 inline-flex items-center gap-1.5 ' +
                  (stationFilter === String(st) ? 'bg-brand-500 text-white' : 'text-ink-600 hover:bg-ink-50')
                }
              >
                <span className={'h-1.5 w-1.5 rounded-full ' + stationDotClass(st)} />
                {stationLabel(st)}
              </button>
            ))}
          </div>
        )}
        {selectedMatchId && (
          <button
            onClick={() => setSelectedMatchId(null)}
            className="btn-ghost text-xs"
          >
            Clear highlight ({selectedMatchId})
          </button>
        )}
      </div>

      <div
        className="mt-4 rounded-2xl border border-ink-100 bg-white overflow-hidden"
        style={{ height: '78vh' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedMatchId(node.id)}
          onPaneClick={() => setSelectedMatchId(null)}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.18}
          maxZoom={1.4}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#EDEDEF" />
          <Controls showInteractive={false} />
          <MiniMap
            zoomable
            pannable
            nodeColor={(n) => (highlightSet && !highlightSet.has(n.id) ? '#F5DCED' : '#9D3689')}
            maskColor="rgba(20,20,20,0.04)"
          />
        </ReactFlow>
      </div>

      <p className="mt-3 text-xs text-ink-500">
        Tip: filtering by player will dim every match they don't play in. Tap a match to see the
        full path — upstream feeders and downstream rounds. Solid magenta arrows mean the source
        match already has a winner.
      </p>
    </div>
  );
}

function Legend({ dot, label, dashed }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative h-0 w-6 inline-flex items-center">
        <span
          className={'absolute left-0 right-0 h-0.5 ' + (dot === 'bg-brand-500' ? 'bg-brand-500' : 'bg-ink-300')}
          style={dashed ? { backgroundImage: 'repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 8px)', backgroundColor: 'transparent', color: '#B8B9BE' } : {}}
        />
      </span>
      {label}
    </span>
  );
}

function Centered({ children }) {
  return <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 text-center text-ink-500">{children}</div>;
}
