import React, { useState, useEffect, useMemo, useCallback } from "react";

/**
 * TargetCalendar
 * A parallel-months calendar for tracking progress toward a single goal
 * across a chosen date range.
 *
 * Requirements:
 *  - React 18+
 *  - Tailwind CSS v4 (@tailwindcss/vite plugin)
 *  - No other runtime dependencies (icons are inline SVG)
 *
 * IMPORTANT — Tailwind v4 dark mode setup:
 *  Tailwind v4 has no tailwind.config.js `darkMode` key by default, and
 *  defaults to following the OS color scheme. To make class-based dark
 *  mode (toggled by this component's button) work, add this line to your
 *  global CSS file, right after `@import "tailwindcss";`:
 *
 *    @custom-variant dark (&:is(.dark *));
 *
 *  Without that line, every `dark:` utility class in this file will be
 *  inert no matter what the `theme` state is set to.
 *
 * Usage:
 *  <TargetCalendar />
 */

// ---------------------------------------------------------------------------
// Small inline icon set (kept local so the component has zero dependencies)
// ---------------------------------------------------------------------------
const Icon = {
  Sun: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="4.2" />
      <path
        strokeLinecap="round"
        d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"
      />
    </svg>
  ),
  Moon: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M20.6 14.8A8.6 8.6 0 1 1 9.2 3.4a7 7 0 0 0 11.4 11.4Z" />
    </svg>
  ),
  Undo: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8H4V5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.6 15.4A8 8 0 1 0 6 7.2L4 8" />
    </svg>
  ),
  Reset: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 1 3 6.7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-5h5" />
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4.5 4.5L19 7" />
    </svg>
  ),
  Half: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...p}>
      <path strokeLinecap="round" d="M5 12h14" />
    </svg>
  ),
  Cross: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Note: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  ),
  Eraser: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21H8l-5-5 9.5-9.5a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L13 20" />
      <path strokeLinecap="round" d="M10 13l4 4" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Mark-type registry: edit this list to change what a "pen" can place on a day
// ---------------------------------------------------------------------------
const MARK_TYPES = [
  { id: "achieved", label: "Hit the target", color: "#3F6B5E", icon: Icon.Check },
  { id: "partial", label: "Partial progress", color: "#C98A3E", icon: Icon.Half },
  { id: "missed", label: "Missed", color: "#AD4B3B", icon: Icon.Cross },
  { id: "note", label: "Flagged / note", color: "#6B5C82", icon: Icon.Note },
];

// ---------------------------------------------------------------------------
// Date helpers (no external date library, to keep this dependency-free)
// ---------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, "0");
const toKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const parseISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthsBetween(startStr, endStr) {
  if (!startStr || !endStr) return [];
  let start = parseISO(startStr);
  let end = parseISO(endStr);
  if (start > end) [start, end] = [end, start];
  const months = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  let guard = 0;
  while (cursor <= last && guard < 240) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    guard++;
  }
  return months;
}

function buildWeeks(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------------------------------------------------------------------
// localStorage persistence (safe no-ops if storage is unavailable, e.g.
// private browsing, SSR, or a sandboxed iframe)
// ---------------------------------------------------------------------------
const STORAGE_KEY = "target-calendar:v1";

function loadSavedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full, disabled, or unavailable — fail silently
  }
}

const fmtDisplay = (iso) => {
  if (!iso) return "—";
  const d = parseISO(iso);
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const todayNow = new Date();
const DEFAULT_STATE = {
  theme: "light",
  title: "",
  startDate: toKey(todayNow.getFullYear(), todayNow.getMonth(), 1),
  endDate: toKey(todayNow.getFullYear(), todayNow.getMonth() + 2, 0),
  marks: {},
};

export default function TargetCalendar() {
  // Loaded lazily (function form of useState) so localStorage is only read
  // once, on the very first render, rather than on every re-render.
  const [saved] = useState(() => ({ ...DEFAULT_STATE, ...loadSavedState() }));

  const [theme, setTheme] = useState(saved.theme);
  const [title, setTitle] = useState(saved.title);
  const [startDate, setStartDate] = useState(saved.startDate);
  const [endDate, setEndDate] = useState(saved.endDate);
  const [marks, setMarks] = useState(saved.marks); // { "2026-09-17": "achieved" }
  const [activePen, setActivePen] = useState("achieved");
  const [history, setHistory] = useState([]); // stack of previous `marks` snapshots
  const [confirmingReset, setConfirmingReset] = useState(false);

  const isDark = theme === "dark";

  // Persist whenever any saved field changes. Undo/redo history and the
  // active pen are deliberately session-only, not written to storage.
  useEffect(() => {
    saveState({ theme, title, startDate, endDate, marks });
  }, [theme, title, startDate, endDate, marks]);

  const rangeStart = useMemo(() => (startDate ? parseISO(startDate) : null), [startDate]);
  const rangeEnd = useMemo(() => (endDate ? parseISO(endDate) : null), [endDate]);
  const [orderedStart, orderedEnd] =
    rangeStart && rangeEnd && rangeStart > rangeEnd ? [rangeEnd, rangeStart] : [rangeStart, rangeEnd];

  const months = useMemo(() => monthsBetween(startDate, endDate), [startDate, endDate]);

  const inRange = useCallback(
    (y, m, d) => {
      if (!orderedStart || !orderedEnd) return false;
      const day = new Date(y, m, d);
      return day >= orderedStart && day <= orderedEnd;
    },
    [orderedStart, orderedEnd]
  );

  // Applies a new marks object while pushing the previous one onto the undo
  // stack, using functional updates so it's always working off latest state.
  const applyMarks = useCallback((nextMarks) => {
    setMarks((prev) => {
      setHistory((h) => [...h, prev]);
      return nextMarks;
    });
  }, []);

  const handleDayClick = (key, within) => {
    if (!within) return;
    setMarks((prev) => {
      const next = { ...prev };
      if (next[key] === activePen) {
        delete next[key]; // clicking the same active mark again clears it
      } else {
        next[key] = activePen;
      }
      setHistory((h) => [...h, prev]);
      return next;
    });
  };

  const handleUndo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setMarks(prev);
      return h.slice(0, -1);
    });
  };

  const handleReset = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    applyMarks({});
    setConfirmingReset(false);
  };

  const stats = useMemo(() => {
    const counts = { achieved: 0, partial: 0, missed: 0, note: 0 };
    let totalDays = 0;
    if (orderedStart && orderedEnd) {
      totalDays = Math.round((orderedEnd - orderedStart) / 86400000) + 1;
    }
    Object.values(marks).forEach((v) => {
      if (counts[v] !== undefined) counts[v]++;
    });
    const pct = totalDays > 0 ? Math.round((counts.achieved / totalDays) * 100) : 0;
    return { counts, totalDays, pct };
  }, [marks, orderedStart, orderedEnd]);

  // ---------------------------------------------------------------------
  // NOTE ON THE FIX BELOW:
  // Previously the `dark` toggle class and the `dark:*` utility classes
  // both lived on this same root div. Tailwind's class-based dark mode
  // variant compiles to a *descendant* selector (`.dark .dark\:bg-...` in
  // v3, or `:is(.dark *)` in v4), which never matches an element carrying
  // both classes on itself. That's why toggling `theme` had no visible
  // effect on this container's own background/text color.
  //
  // The fix: put `dark` on an outer wrapper, and keep all `dark:` utility
  // classes on a child element (or elements) nested inside it.
  // ---------------------------------------------------------------------
  return (
    <div className={isDark ? "dark" : ""}>
      <div
        className="min-h-full w-full transition-colors duration-300
                   bg-[#F5F4EF] text-[#1F2421] dark:bg-[#14181B] dark:text-[#ECEAE3]"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&family=Inter:wght@400;500;600&display=swap');
          .tc-serif { font-family: 'Source Serif 4', Georgia, serif; }
        `}</style>

        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10">
          {/* ---------------- Header ---------------- */}
          <header className="flex items-start justify-between gap-6 mb-8">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] tracking-wide uppercase text-[#1F2421]/45 dark:text-[#ECEAE3]/45 mb-2">
                Target calendar
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name what you're working toward"
                className="tc-serif w-full bg-transparent text-3xl sm:text-4xl font-medium leading-tight
                           placeholder:text-[#1F2421]/30 dark:placeholder:text-[#ECEAE3]/30
                           border-0 border-b-2 border-transparent focus:border-[#3F6B5E]
                           focus:outline-none pb-2 transition-colors"
              />
              <p className="mt-2 text-sm text-[#1F2421]/60 dark:text-[#ECEAE3]/60">
                {fmtDisplay(startDate)} &nbsp;→&nbsp; {fmtDisplay(endDate)}
                {stats.totalDays > 0 && <span> · {stats.totalDays} days</span>}
              </p>
            </div>

            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label="Toggle dark mode"
              className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center
                         border border-[#1F2421]/15 dark:border-[#ECEAE3]/15
                         hover:bg-[#1F2421]/5 dark:hover:bg-[#ECEAE3]/10 transition-colors hover:cursor-pointer"
            >
              {isDark ? <Icon.Sun className="h-5 w-5" /> : <Icon.Moon className="h-4.5 w-4.5" />}
            </button>
          </header>

          {/* ---------------- Progress bar ---------------- */}
          {stats.totalDays > 0 && (
            <div className="mb-8">
              <div className="h-1.5 w-full rounded-full bg-[#1F2421]/8 dark:bg-[#ECEAE3]/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${stats.pct}%`, backgroundColor: "#3F6B5E" }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#1F2421]/55 dark:text-[#ECEAE3]/55">
                <span>{stats.pct}% of days hit</span>
                <span>{stats.counts.achieved} achieved</span>
                <span>{stats.counts.partial} partial</span>
                <span>{stats.counts.missed} missed</span>
                {stats.counts.note > 0 && <span>{stats.counts.note} flagged</span>}
              </div>
            </div>
          )}

          {/* ---------------- Toolbar ---------------- */}
          <div
            className="mb-9 rounded-2xl border border-[#1F2421]/10 dark:border-[#ECEAE3]/10
                       bg-white/60 dark:bg-[#1B2124] p-4 sm:p-5 flex flex-col gap-4"
          >
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-[#1F2421]/55 dark:text-[#ECEAE3]/55">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-[#1F2421]/15 dark:border-[#ECEAE3]/15
                             bg-transparent px-3 py-1.5 text-sm text-[#1F2421] dark:text-[#ECEAE3]
                             focus:outline-none focus:border-[#3F6B5E]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[#1F2421]/55 dark:text-[#ECEAE3]/55">
                End date
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-[#1F2421]/15 dark:border-[#ECEAE3]/15
                             bg-transparent px-3 py-1.5 text-sm text-[#1F2421] dark:text-[#ECEAE3]
                             focus:outline-none focus:border-[#3F6B5E]"
                />
              </label>

              <div className="flex-1" />

              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-[#1F2421]/15 dark:border-[#ECEAE3]/15
                             px-3 py-1.5 text-sm hover:bg-[#1F2421]/5 dark:hover:bg-[#ECEAE3]/10
                             disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                >
                  <Icon.Undo className="h-4 w-4" /> Undo
                </button>
                <button
                  onClick={handleReset}
                  onBlur={() => setConfirmingReset(false)}
                  className={
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm border transition-colors " +
                    (confirmingReset
                      ? "border-[#AD4B3B] text-[#AD4B3B] bg-[#AD4B3B]/10"
                      : "border-[#1F2421]/15 dark:border-[#ECEAE3]/15 hover:bg-[#1F2421]/5 dark:hover:bg-[#ECEAE3]/10")
                  }
                >
                  <Icon.Reset className="h-4 w-4" />
                  {confirmingReset ? "Click again to confirm" : "Reset"}
                </button>
              </div>
            </div>

            {/* ---------------- Pen / mark-type selector ---------------- */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[#1F2421]/8 dark:border-[#ECEAE3]/10 pt-5">
              <span className="text-xs text-[#1F2421]/50 dark:text-[#ECEAE3]/50 mr-1">Mark days as</span>
              {MARK_TYPES.map((m) => {
                const Ico = m.icon;
                const active = activePen === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setActivePen(m.id)}
                    className={
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all " +
                      (active
                        ? "text-white border-transparent shadow-sm"
                        : "text-[#1F2421]/70 dark:text-[#ECEAE3]/70 border-[#1F2421]/15 dark:border-[#ECEAE3]/15 hover:bg-[#1F2421]/5 dark:hover:bg-[#ECEAE3]/10")
                    }
                    style={active ? { backgroundColor: m.color } : undefined}
                  >
                    <Ico className="h-3 w-3" />
                    {m.label}
                  </button>
                );
              })}
              <span className="text-[11px] text-[#1F2421]/40 dark:text-[#ECEAE3]/40 ml-1">
                Click a day to apply · click the same mark again to clear it
              </span>
            </div>
          </div>

          {/* ---------------- Months grid ---------------- */}
          {months.length === 0 ? (
            <div className="text-xl text-[#1F2421]/50 dark:text-[#ECEAE3]/50 py-16 text-center">
              Choose a start and end date to lay out your calendar.
            </div>
          ) : (
            <div className="grid gap-5 sm:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {months.map(({ year, month }) => (
                <MonthCard
                  key={`${year}-${month}`}
                  year={year}
                  month={month}
                  marks={marks}
                  inRange={inRange}
                  onDayClick={handleDayClick}
                />
              ))}
            </div>
          )}

          {/* ---------------- Footer ---------------- */}
          <footer className="mt-16 pt-6 border-t border-[#1F2421]/10 dark:border-[#ECEAE3]/10
                              flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2
                              text-xs text-[#1F2421]/45 dark:text-[#ECEAE3]/45">
            <p>Target Calendar · progress is saved to this browser only.</p>
            <p>© {new Date().getFullYear()} <a href="https://github.com/Hamzaa09">Hamzaa09</a>. All rights reserved.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One month's grid
// ---------------------------------------------------------------------------
function MonthCard({ year, month, marks, inRange, onDayClick }) {
  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);
  const markLookup = useMemo(
    () => Object.fromEntries(MARK_TYPES.map((m) => [m.id, m])),
    []
  );

  return (
    <div
      className="rounded-2xl border border-[#1F2421]/10 dark:border-[#ECEAE3]/10
                 bg-white/60 dark:bg-[#1B2124] p-4"
    >
      <h3 className="tc-serif text-lg mb-3">
        {MONTH_NAMES[month]} <span className="text-[#1F2421]/40 dark:text-[#ECEAE3]/40">{year}</span>
      </h3>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="text-center text-[10px] text-[#1F2421]/40 dark:text-[#ECEAE3]/40 py-1"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = toKey(year, month, d);
          const within = inRange(year, month, d);
          const mark = marks[key];
          const markCfg = mark ? markLookup[mark] : null;
          const MarkIcon = markCfg ? markCfg.icon : null;

          return (
            <button
              key={i}
              onClick={() => onDayClick(key, within)}
              disabled={!within}
              className={
                "aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[13px] transition-colors " +
                (within
                  ? "hover:bg-[#1F2421]/5 dark:hover:bg-[#ECEAE3]/10 cursor-pointer"
                  : "opacity-25 cursor-default")
              }
            >
              <span className="leading-none text-[#1F2421]/70 dark:text-[#ECEAE3]/70">{d}</span>
              {MarkIcon ? (
                <span
                  className="h-4 w-4 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: markCfg.color }}
                >
                  <MarkIcon className="h-2.5 w-2.5" />
                </span>
              ) : (
                <span className="h-4 w-4" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
