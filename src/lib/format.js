// Tiny formatting helpers used across pages.

export function formatTime12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function stageColor(stage) {
  switch (stage) {
    case 'Tier 1': return 'bg-brand-50 text-brand-700 border-brand-100';
    case 'Tier 2': return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'Tier 3': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'Mixed':  return 'bg-indigo-50 text-indigo-700 border-indigo-100';
    case 'Final':  return 'bg-ink-900 text-white border-ink-900';
    default:       return 'bg-ink-100 text-ink-700 border-ink-200';
  }
}

export function tierLabel(tier) {
  switch (tier) {
    case 'T1': return 'Tier 1';
    case 'T2': return 'Tier 2';
    case 'T3': return 'Tier 3';
    default:   return tier || '';
  }
}

export const MATCH_STATUSES = [
  { value: 'scheduled',   label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'walkover',    label: 'Walkover' },
  { value: 'cancelled',   label: 'Cancelled' },
  { value: 'postponed',   label: 'Postponed' },
];

export function statusLabel(status) {
  return MATCH_STATUSES.find((s) => s.value === status)?.label || 'Scheduled';
}

export function statusBadgeClass(status) {
  switch (status) {
    case 'in_progress': return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'completed':   return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'walkover':    return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'cancelled':   return 'bg-red-50 text-red-700 border-red-100';
    case 'postponed':   return 'bg-violet-50 text-violet-700 border-violet-100';
    case 'scheduled':
    default:            return 'bg-ink-50 text-ink-600 border-ink-100';
  }
}

// Only show the badge for non-trivial states (everything except "scheduled" and
// the normal "completed", which the score itself already communicates).
export function shouldShowStatus(status) {
  return status && status !== 'scheduled' && status !== 'completed';
}

// Distinct accent colors per station so two glances at the schedule are enough
// to know where any match is happening. We rotate through a small palette;
// stations beyond #5 reuse the early colors.
const STATION_PALETTE = [
  'bg-brand-50 text-brand-700 border-brand-100',
  'bg-indigo-50 text-indigo-700 border-indigo-100',
  'bg-emerald-50 text-emerald-700 border-emerald-100',
  'bg-amber-50 text-amber-700 border-amber-100',
  'bg-cyan-50 text-cyan-700 border-cyan-100',
];

export function stationBadgeClass(station) {
  if (!station) return 'bg-ink-100 text-ink-600 border-ink-200';
  return STATION_PALETTE[(station - 1) % STATION_PALETTE.length];
}

export function stationDotClass(station) {
  switch ((station - 1) % STATION_PALETTE.length) {
    case 0: return 'bg-brand-500';
    case 1: return 'bg-indigo-500';
    case 2: return 'bg-emerald-500';
    case 3: return 'bg-amber-500';
    case 4: return 'bg-cyan-500';
    default: return 'bg-ink-400';
  }
}

export function stationLabel(station) {
  if (!station) return '—';
  return `PS ${station}`;
}
