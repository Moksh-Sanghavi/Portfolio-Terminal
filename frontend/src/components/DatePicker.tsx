import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  max?: string; // YYYY-MM-DD
  min?: string; // YYYY-MM-DD
}

type ViewMode = "days" | "months" | "years";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function toTypedFormat(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${m}/${d.getFullYear()}`;
}

/** Strict DD/MM/YYYY parse; rejects malformed/rolled-over dates (e.g. 30/02/2022 -> 02/03/2022). */
function tryParseTyped(s: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function buildMonthGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, nextDay), inMonth: false });
    nextDay += 1;
  }
  return cells;
}

export default function DatePicker({ value, onChange, max, min }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("days");
  const selectedDate = useMemo(() => parseISODate(value), [value]);
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState(() => toTypedFormat(selectedDate));
  const [draftInvalid, setDraftInvalid] = useState(false);

  const maxDate = max ? parseISODate(max) : null;
  const minDate = min ? parseISODate(min) : null;
  const today = new Date();

  const yearOptions = useMemo(() => {
    const lo = minDate ? minDate.getFullYear() : today.getFullYear() - 10;
    const hi = maxDate ? maxDate.getFullYear() : today.getFullYear();
    const years: number[] = [];
    for (let y = lo; y <= hi; y++) years.push(y);
    return years;
  }, [minDate, maxDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      setViewYear(selectedDate.getFullYear());
      setViewMonth(selectedDate.getMonth());
      setViewMode("days");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  // Keep the typed draft in sync with externally-driven value changes
  // (calendar picks, history reload, etc.) as long as the user isn't mid-edit.
  useEffect(() => {
    if (!typing) setDraft(toTypedFormat(selectedDate));
  }, [selectedDate, typing]);

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const isDisabled = (d: Date) => {
    if (maxDate && d > maxDate) return true;
    if (minDate && d < minDate) return true;
    return false;
  };

  const isMonthDisabled = (year: number, month: number) => {
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const firstDayOfMonth = new Date(year, month, 1);
    if (maxDate && firstDayOfMonth > maxDate) return true;
    if (minDate && lastDayOfMonth < minDate) return true;
    return false;
  };

  const goToPrevMonth = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goToNextMonth = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goToPrevYear = () => setViewYear((y) => y - 1);
  const goToNextYear = () => setViewYear((y) => y + 1);

  const selectDate = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(toISODate(d));
    setOpen(false);
  };

  const selectMonth = (month: number) => {
    if (isMonthDisabled(viewYear, month)) return;
    setViewMonth(month);
    setViewMode("days");
  };

  const selectYear = (year: number) => {
    setViewYear(year);
    setViewMode("days");
  };

  const selectToday = () => {
    if (isDisabled(today)) return;
    onChange(toISODate(today));
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setOpen(false);
  };

  const handleDraftFocus = () => {
    setTyping(true);
    setDraft(toTypedFormat(selectedDate));
    setDraftInvalid(false);
  };

  const commitDraft = () => {
    const parsed = tryParseTyped(draft);
    if (parsed && !isDisabled(parsed)) {
      onChange(toISODate(parsed));
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
      setDraftInvalid(false);
    } else {
      setDraft(toTypedFormat(selectedDate));
      setDraftInvalid(false);
    }
    setTyping(false);
  };

  const handleDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setDraft(toTypedFormat(selectedDate));
      setDraftInvalid(false);
      e.currentTarget.blur();
    }
  };

  const handleDraftChange = (raw: string) => {
    setDraft(raw);
    setDraftInvalid(raw.trim() !== "" && !tryParseTyped(raw));
  };

  return (
    <div className="relative">
      <div
        className={`flex w-full items-center gap-2 rounded-xl border bg-zinc-900 px-3.5 py-2.5 transition-colors focus-within:border-emerald-600 ${
          draftInvalid ? "border-rose-600" : "border-zinc-800 hover:border-zinc-700"
        }`}
      >
        <input
          type="text"
          value={typing ? draft : formatDisplay(selectedDate)}
          onFocus={handleDraftFocus}
          onChange={(e) => handleDraftChange(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={handleDraftKeyDown}
          placeholder="DD/MM/YYYY"
          className="min-w-0 flex-1 bg-transparent font-mono text-sm tabular-nums text-zinc-200 outline-none placeholder-zinc-600"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-zinc-500 transition-colors hover:text-emerald-400"
          aria-label="Open calendar"
        >
          <Calendar className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <>
          <button
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close calendar"
            tabIndex={-1}
          />
          <div className="absolute z-40 mt-2 w-[300px] rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/40 animate-[fadeIn_0.12s_ease-out]">
            {/* Header: year/month navigation + mode switches */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={goToPrevYear}
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label="Previous year"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                {viewMode === "days" && (
                  <button
                    type="button"
                    onClick={goToPrevMonth}
                    className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                {viewMode !== "months" ? (
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === "days" ? "months" : "days")}
                    className="rounded-lg px-1.5 py-0.5 text-zinc-100 transition-colors hover:bg-zinc-800 hover:text-emerald-400"
                  >
                    {MONTH_LABELS[viewMonth]}
                  </button>
                ) : (
                  <span className="px-1.5 py-0.5 text-zinc-500">Select month</span>
                )}
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === "years" ? "days" : "years")}
                  className="rounded-lg px-1.5 py-0.5 text-zinc-100 transition-colors hover:bg-zinc-800 hover:text-emerald-400"
                >
                  {viewYear}
                </button>
              </div>

              <div className="flex items-center gap-0.5">
                {viewMode === "days" && (
                  <button
                    type="button"
                    onClick={goToNextMonth}
                    className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={goToNextYear}
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label="Next year"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {viewMode === "years" && (
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {yearOptions.map((year) => (
                  <button
                    type="button"
                    key={year}
                    onClick={() => selectYear(year)}
                    className={`rounded-lg py-2 text-sm font-semibold tabular-nums transition-colors ${
                      year === viewYear
                        ? "bg-emerald-500 text-zinc-950"
                        : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}

            {viewMode === "months" && (
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {MONTH_SHORT_LABELS.map((label, month) => {
                  const disabled = isMonthDisabled(viewYear, month);
                  const selected = month === viewMonth;
                  return (
                    <button
                      type="button"
                      key={label}
                      disabled={disabled}
                      onClick={() => selectMonth(month)}
                      className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                        selected
                          ? "bg-emerald-500 text-zinc-950"
                          : disabled
                            ? "cursor-not-allowed text-zinc-800"
                            : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {viewMode === "days" && (
              <>
                {/* Weekday header */}
                <div className="mb-1 grid grid-cols-7 gap-0.5">
                  {WEEKDAY_LABELS.map((w) => (
                    <div
                      key={w}
                      className="flex h-7 items-center justify-center text-[10px] font-bold uppercase tracking-wide text-zinc-600"
                    >
                      {w}
                    </div>
                  ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map(({ date, inMonth }) => {
                    const disabled = isDisabled(date);
                    const selected = isSameDay(date, selectedDate);
                    const isToday = isSameDay(date, today);
                    return (
                      <button
                        type="button"
                        key={date.toISOString()}
                        disabled={disabled}
                        onClick={() => selectDate(date)}
                        className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-xs tabular-nums transition-colors ${
                          selected
                            ? "bg-emerald-500 font-bold text-zinc-950"
                            : disabled
                              ? "cursor-not-allowed text-zinc-800"
                              : inMonth
                                ? "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                                : "text-zinc-700 hover:bg-zinc-800/60"
                        }`}
                      >
                        {date.getDate()}
                        {isToday && !selected && (
                          <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Footer */}
            <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3">
              <span className="text-[11px] text-zinc-500">
                Selected: {formatDisplay(selectedDate)}
              </span>
              <button
                type="button"
                onClick={selectToday}
                disabled={isDisabled(today)}
                className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-400 transition-colors hover:border-emerald-700 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Today
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
