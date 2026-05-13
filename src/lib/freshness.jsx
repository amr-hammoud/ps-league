// A tiny "is the data on this page stale?" system, used to show a non-intrusive
// "Updates available — Refresh now" banner whenever another admin (or anything
// else server-side) has changed the underlying JSON since this tab loaded.
//
// Design:
// - One global poller hits `/api/version` every few seconds and broadcasts the
//   server-reported versions (file mtimes) via context.
// - Each page calls `useFreshness('schedule')` (or another resource key) to
//   subscribe. It tracks the version that was current when the page last
//   loaded data — `markLoaded(versionFromHeader)` after each fetch.
// - `isStale` is true whenever the polled server version is *strictly greater*
//   than the last loaded version. Your own admin saves call `markLoaded()` with
//   the freshly returned version, so they never trigger the banner for you.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const POLL_MS = 6000;

const FreshnessContext = createContext({
  versions: {},
  refresh: async () => {},
});

export function FreshnessProvider({ children, interval = POLL_MS }) {
  const [versions, setVersions] = useState({});

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/version', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!r.ok) return;
      const j = await r.json();
      setVersions(j);
    } catch (_e) {
      // Network blip — keep silent and try again next tick.
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, interval);
    // Also refresh on tab focus so coming back from another tab is instant.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, interval]);

  const value = useMemo(() => ({ versions, refresh }), [versions, refresh]);
  return <FreshnessContext.Provider value={value}>{children}</FreshnessContext.Provider>;
}

export function useFreshness(resource = 'schedule') {
  const { versions, refresh } = useContext(FreshnessContext);
  const [loadedVersion, setLoadedVersion] = useState(null);
  const serverVersion = versions[resource];

  // Call after each fetch with the version returned by the server (X-Version
  // header, exposed as `data._version` by lib/api.js). Falls back to the
  // currently-known server version so the banner stays correct even when the
  // header is missing for some reason.
  const markLoaded = useCallback(
    (version) => {
      const v = typeof version === 'number' && Number.isFinite(version) ? version : serverVersion;
      if (v != null) setLoadedVersion(v);
    },
    [serverVersion],
  );

  const isStale =
    loadedVersion != null && serverVersion != null && serverVersion > loadedVersion;

  return { isStale, markLoaded, refresh, serverVersion, loadedVersion };
}

export function RefreshBanner({ onRefresh, label = 'New tournament data available' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-16 z-30 my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/90 backdrop-blur px-4 py-2.5 shadow-soft"
    >
      <div className="flex items-center gap-2 text-sm text-brand-700">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
        </span>
        <span className="font-medium">{label}</span>
        <span className="text-brand-500 hidden sm:inline">— another admin updated this since you loaded it</span>
      </div>
      <button onClick={onRefresh} className="btn-primary text-xs px-3 py-1.5">
        Refresh now
      </button>
    </div>
  );
}
