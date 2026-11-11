import React, { useState, useEffect, useMemo, useCallback } from "react";
// new comment 
/**
 * TargetCalendar
 * A parallel-months calendar for tracking 1–4 targets over a single date
 * range, where each target has its own day-of-week schedule
 * (e.g. "Strength training" on Mon/Wed/Fri, "Reading" on Tue/Thu/Sat,
 * "Rest & review" on Sunday — all inside the same 80-day window).
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
  Cross: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Target palette: each target added to a period gets the next unused color.
// Capped at 4 targets both for legibility on a single day cell and because
// the palette below has exactly four distinct, accessible colors.
// ---------------------------------------------------------------------------
const PALETTE = ["#3F6B5E", "#C98A3E", "#AD4B3B", "#6B5C82"];
const MAX_TARGETS = PALETTE.length;
const DOT = 11; // px, size of each per-target marker inside a day cell

// Weekday labels/indices follow JS Date#getDay(): 0 = Sunday … 6 = Saturday
const WEEKDAY_TOGGLES = [
  { day: 0, short: "S", label: "Sunday" },
  { day: 1, short: "M", label: "Monday" },
  { day: 2, short: "T", label: "Tuesday" },
  { day: 3, short: "W", label: "Wednesday" },
  { day: 4, short: "T", label: "Thursday" },
  { day: 5, short: "F", label: "Friday" },
  { day: 6, short: "S", label: "Saturday" },
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

// Counts how many dates between start/end (inclusive) fall on one of
// `weekdaysAllowed` and are NOT in `excludedWeekdays` (global blackout days).
function countScheduledDays(start, end, weekdaysAllowed, excludedWeekdays) {
  if (!start || !end || !weekdaysAllowed || weekdaysAllowed.length === 0) return 0;
  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let guard = 0;
  while (cursor <= last && guard < 20000) {
    const wd = cursor.getDay();
    if (weekdaysAllowed.includes(wd) && !excludedWeekdays.includes(wd)) count++;
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// localStorage persistence (safe no-ops if storage is unavailable, e.g.
// private browsing, SSR, or a sandboxed iframe)
// ---------------------------------------------------------------------------
const STORAGE_KEY = "target-calendar:v2"; // bumped: v1 marks were single-goal, v2 are per-target

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

// Mark keys combine a target id and a date so all statuses live in one
// flat, easily-undoable object: { "t1__2026-09-17": "done" }
const markKey = (targetId, dateKey) => `${targetId}__${dateKey}`;
const splitMarkKey = (key) => {
  const i = key.indexOf("__");
  return [key.slice(0, i), key.slice(i + 2)];
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
  excludedWeekdays: [],
  targets: [{ id: "t1", name: "Target 1", color: PALETTE[0], weekdays: [0, 1, 2, 3, 4, 5, 6] }],
};

export default function TargetCalendar() {
  const [saved] = useState(() => ({ ...DEFAULT_STATE, ...loadSavedState() }));

  const [theme, setTheme] = useState(saved.theme);
  const [title, setTitle] = useState(saved.title);
  const [startDate, setStartDate] = useState(saved.startDate);
  const [endDate, setEndDate] = useState(saved.endDate);
  const [marks, setMarks] = useState(saved.marks); // { "t1__2026-09-17": "done" | "missed" }
  const [excludedWeekdays, setExcludedWeekdays] = useState(saved.excludedWeekdays || []);
  const [targets, setTargets] = useState(
    saved.targets && saved.targets.length ? saved.targets : DEFAULT_STATE.targets
  );
  const [history, setHistory] = useState([]); // stack of previous `marks` snapshots
  const [confirmingReset, setConfirmingReset] = useState(false);

  const isDark = theme === "dark";

  useEffect(() => {
    saveState({ theme, title, startDate, endDate, marks, excludedWeekdays, targets });
  }, [theme, title, startDate, endDate, marks, excludedWeekdays, targets]);

  const rangeStart = useMemo(() => (startDate ? parseISO(startDate) : null), [startDate]);
  const rangeEnd = useMemo(() => (endDate ? parseISO(endDate) : null), [endDate]);
  const [orderedStart, orderedEnd] =
    rangeStart && rangeEnd && rangeStart > rangeEnd ? [rangeEnd, rangeStart] : [rangeStart, rangeEnd];

  const months = useMemo(() => monthsBetween(startDate, endDate), [startDate, endDate]);

  // Whether a day falls inside the chosen date range at all
  const inRange = useCallback(
    (y, m, d) => {
      if (!orderedStart || !orderedEnd) return false;
      const day = new Date(y, m, d);
      return day >= orderedStart && day <= orderedEnd;
    },
    [orderedStart, orderedEnd]
  );

  // Whether a given target is actually scheduled (and trackable) on this day:
  // in range, not a globally-excluded weekday, and on that target's weekdays.
  const isTargetCountable = useCallback(
    (target, y, m, d) => {
      if (!inRange(y, m, d)) return false;
      const wd = new Date(y, m, d).getDay();
      if (excludedWeekdays.includes(wd)) return false;
      return target.weekdays.includes(wd);
    },
    [inRange, excludedWeekdays]
  );

  const applyMarks = useCallback((nextMarks) => {
    setMarks((prev) => {
      setHistory((h) => [...h, prev]);
      return nextMarks;
    });
  }, []);

  // Cycles a single (target, day) cell: unmarked → done → missed → unmarked
  const handleDayClick = (targetId, dateKey, applicable) => {
    if (!applicable) return;
    const key = markKey(targetId, dateKey);
    setMarks((prev) => {
      const next = { ...prev };
      const current = next[key];
      if (!current) next[key] = "done";
      else if (current === "done") next[key] = "missed";
      else delete next[key];
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

  const toggleExcludedWeekday = (day) => {
    setExcludedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const addTarget = () => {
    setTargets((prev) => {
      if (prev.length >= MAX_TARGETS) return prev;
      const color = PALETTE[prev.length % PALETTE.length];
      return [...prev, { id: `t${Date.now()}`, name: `Target ${prev.length + 1}`, color, weekdays: [] }];
    });
  };

  const removeTarget = (id) => {
    setTargets((prev) => (prev.length <= 1 ? prev : prev.filter((t) => t.id !== id)));
  };

  const renameTarget = (id, name) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const toggleTargetWeekday = (id, day) => {
    setTargets((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, weekdays: t.weekdays.includes(day) ? t.weekdays.filter((d) => d !== day) : [...t.weekdays, day] }
          : t
      )
    );
  };

  // Per-target totals (scheduled / done / %), then an overall combined figure
  const targetStats = useMemo(() => {
    const result = {};
    targets.forEach((t) => {
      const total = countScheduledDays(orderedStart, orderedEnd, t.weekdays, excludedWeekdays);
      let done = 0;
      Object.entries(marks).forEach(([key, status]) => {
        if (status !== "done") return;
        const [tid, dateKey] = splitMarkKey(key);
        if (tid !== t.id) return;
        const d = parseISO(dateKey);
        if (isTargetCountable(t, d.getFullYear(), d.getMonth(), d.getDate())) done++;
      });
      result[t.id] = { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
    return result;
  }, [targets, marks, orderedStart, orderedEnd, excludedWeekdays, isTargetCountable]);

  const overall = useMemo(() => {
    let total = 0;
    let done = 0;
    targets.forEach((t) => {
      const s = targetStats[t.id];
      if (s) {
        total += s.total;
        done += s.done;
      }
    });
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [targets, targetStats]);

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
                {overall.total > 0 && <span> · {overall.total} scheduled instances</span>}
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

          {/* ---------------- Progress: overall bar + per-target chips ---------------- */}
          {overall.total > 0 && (
            <div className="mb-8 space-y-3">
              <div>
                <div className="h-1.5 w-full rounded-full bg-[#1F2421]/8 dark:bg-[#ECEAE3]/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${overall.pct}%`, backgroundColor: "#3F6B5E" }}
                  />
                </div>
                <p className="mt-2 text-xs text-[#1F2421]/55 dark:text-[#ECEAE3]/55">
                  {overall.pct}% overall · {overall.done}/{overall.total} scheduled days completed
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {targets.map((t) => {
                  const s = targetStats[t.id] || { total: 0, done: 0, pct: 0 };
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-full border border-[#1F2421]/10 dark:border-[#ECEAE3]/10 px-3 py-1.5 text-xs"
                    >
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="font-medium">{t.name || "Untitled"}</span>
                      <span className="text-[#1F2421]/45 dark:text-[#ECEAE3]/45">
                        {s.done}/{s.total} · {s.pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---------------- Toolbar ---------------- */}
          <div
            className="mb-9 rounded-2xl border border-[#1F2421]/10 dark:border-[#ECEAE3]/10
                       bg-white/60 dark:bg-[#1B2124] p-4 sm:p-5 flex flex-col gap-5"
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

            {/* ---------------- Targets editor ---------------- */}
            <div className="flex flex-col gap-3 border-t border-[#1F2421]/8 dark:border-[#ECEAE3]/10 pt-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#1F2421]/50 dark:text-[#ECEAE3]/50">
                  Targets in this period — give each its own days of the week
                </span>
                <button
                  onClick={addTarget}
                  disabled={targets.length >= MAX_TARGETS}
                  className="text-xs font-medium rounded-full border border-[#1F2421]/15 dark:border-[#ECEAE3]/15
                             px-3 py-1 hover:bg-[#1F2421]/5 dark:hover:bg-[#ECEAE3]/10
                             disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  + Add target
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {targets.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-[#1F2421]/10 dark:border-[#ECEAE3]/10 p-2.5"
                  >
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <input
                      value={t.name}
                      onChange={(e) => renameTarget(t.id, e.target.value)}
                      placeholder="Target name"
                      className="min-w-27.5 flex-1 bg-transparent text-sm
                                 border-b border-transparent focus:border-[#1F2421]/30 dark:focus:border-[#ECEAE3]/30
                                 focus:outline-none px-1 py-0.5"
                    />
                    <div className="flex items-center gap-1">
                      {WEEKDAY_TOGGLES.map(({ day, short, label }) => {
                        const on = t.weekdays.includes(day);
                        return (
                          <button
                            key={day}
                            title={label}
                            onClick={() => toggleTargetWeekday(t.id, day)}
                            aria-pressed={on}
                            style={on ? { backgroundColor: t.color, borderColor: "transparent", color: "#fff" } : undefined}
                            className={
                              "h-6 w-6 rounded-full text-[11px] font-medium border transition-colors " +
                              (on
                                ? ""
                                : "text-[#1F2421]/70 dark:text-[#ECEAE3]/70 border-[#1F2421]/15 dark:border-[#ECEAE3]/15 hover:bg-[#1F2421]/5 dark:hover:bg-[#ECEAE3]/10")
                            }
                          >
                            {short}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => removeTarget(t.id)}
                      disabled={targets.length <= 1}
                      className="ml-auto text-xs text-[#1F2421]/40 dark:text-[#ECEAE3]/40 hover:text-[#AD4B3B]
                                 disabled:opacity-20 disabled:hover:text-[#1F2421]/40 dark:disabled:hover:text-[#ECEAE3]/40
                                 px-2 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#1F2421]/40 dark:text-[#ECEAE3]/40">
                Click a target's dot on a scheduled day to cycle it: empty → done → missed → empty.
              </p>
            </div>

            {/* ---------------- Excluded weekdays ---------------- */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[#1F2421]/8 dark:border-[#ECEAE3]/10 pt-5">
              <span className="text-xs text-[#1F2421]/50 dark:text-[#ECEAE3]/50 mr-1">
                Exclude from count (all targets)
              </span>
              {WEEKDAY_TOGGLES.map(({ day, short, label }) => {
                const excluded = excludedWeekdays.includes(day);
                return (
                  <button
                    key={day}
                    onClick={() => toggleExcludedWeekday(day)}
                    aria-pressed={excluded}
                    title={label}
                    className={
                      "h-7 w-7 rounded-full text-xs font-medium border transition-all " +
                      (excluded
                        ? "bg-[#AD4B3B] border-transparent text-white"
                        : "text-[#1F2421]/70 dark:text-[#ECEAE3]/70 border-[#1F2421]/15 dark:border-[#ECEAE3]/15 hover:bg-[#1F2421]/5 dark:hover:bg-[#ECEAE3]/10")
                    }
                  >
                    {short}
                  </button>
                );
              })}
              <span className="text-[11px] text-[#1F2421]/40 dark:text-[#ECEAE3]/40 ml-1">
                e.g. blackout dates that apply to every target at once
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
                  targets={targets}
                  marks={marks}
                  inRange={inRange}
                  isTargetCountable={isTargetCountable}
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
function MonthCard({ year, month, targets, marks, inRange, isTargetCountable, onDayClick }) {
  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);

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
          const dayInRange = inRange(year, month, d);

          return (
            <div
              key={i}
              className={
                "aspect-square rounded-lg flex flex-col items-center justify-center gap-1 text-[13px] " +
                (dayInRange ? "" : "opacity-25")
              }
            >
              <span className="leading-none text-[#1F2421]/70 dark:text-[#ECEAE3]/70">{d}</span>

              <div className="flex items-center justify-center gap-1 flex-wrap" style={{ minHeight: DOT }}>
                {targets.map((t) => {
                  const applicable = isTargetCountable(t, year, month, d);
                  if (!applicable) {
                    return <span key={t.id} style={{ width: DOT, height: DOT }} className="inline-block" />;
                  }
                  const status = marks[markKey(t.id, key)];
                  return (
                    <button
                      key={t.id}
                      onClick={() => onDayClick(t.id, key, true)}
                      title={t.name}
                      style={{
                        width: DOT,
                        height: DOT,
                        backgroundColor: status === "done" ? t.color : "transparent",
                        borderColor: t.color,
                        borderWidth: status === "done" ? 0 : 1.4,
                        borderStyle: "solid",
                      }}
                      className="rounded-full flex items-center justify-center shrink-0 transition-colors hover:cursor-pointer"
                    >
                      {status === "done" && <Icon.Check className="h-1.5 w-1.5 text-white" strokeWidth="3.2" />}
                      {status === "missed" && (
                        <Icon.Cross className="h-1.5 w-1.5" style={{ color: t.color }} strokeWidth="3.2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
