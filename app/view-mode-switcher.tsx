"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ViewMode = "grid" | "list" | "table";

const STORAGE_PREFIX = "pacman-view-mode-";
const EVENT = "pacman-view-mode-change";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useViewMode(
  scope: string,
  defaultMode: ViewMode,
): [ViewMode, (m: ViewMode) => void] {
  const key = STORAGE_PREFIX + scope;
  const getSnapshot = useCallback((): ViewMode => {
    const stored = localStorage.getItem(key);
    return stored === "grid" || stored === "list" || stored === "table"
      ? stored
      : defaultMode;
  }, [key, defaultMode]);
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => defaultMode);
  const update = useCallback(
    (next: ViewMode) => {
      try {
        localStorage.setItem(key, next);
        window.dispatchEvent(new Event(EVENT));
      } catch {
        // localStorage may be unavailable (private mode)
      }
    },
    [key],
  );
  return [mode, update];
}

const ICONS: Record<ViewMode, React.ReactNode> = {
  grid: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="11" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="11" width="7" height="7" rx="1" />
      <rect x="11" y="11" width="7" height="7" rx="1" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <rect x="2" y="3" width="4" height="4" rx="1" />
      <rect x="8" y="4" width="10" height="2" rx="1" />
      <rect x="2" y="9" width="4" height="4" rx="1" />
      <rect x="8" y="10" width="10" height="2" rx="1" />
      <rect x="2" y="15" width="4" height="4" rx="1" />
      <rect x="8" y="16" width="10" height="2" rx="1" />
    </svg>
  ),
  table: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <rect x="2" y="3" width="16" height="2" rx="0.5" />
      <rect x="2" y="7" width="16" height="2" rx="0.5" />
      <rect x="2" y="11" width="16" height="2" rx="0.5" />
      <rect x="2" y="15" width="16" height="2" rx="0.5" />
    </svg>
  ),
};

const LABELS: Record<ViewMode, string> = {
  grid: "Grille",
  list: "Liste",
  table: "Tableau",
};

export function ViewModeSwitcher({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div className="inline-flex border rounded overflow-hidden bg-white">
      {(["grid", "list", "table"] as ViewMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          title={LABELS[m]}
          aria-pressed={mode === m}
          className={
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs border-r last:border-r-0 " +
            (mode === m
              ? "bg-blue-600 text-white"
              : "text-gray-600 hover:bg-gray-50")
          }
        >
          {ICONS[m]}
          <span className="hidden sm:inline">{LABELS[m]}</span>
        </button>
      ))}
    </div>
  );
}
