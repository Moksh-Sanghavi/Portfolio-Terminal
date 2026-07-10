import type { BacktestResponse, RebalanceFrequency } from "./types";

const STORAGE_KEY = "portfolio-terminal-history";
const MAX_ENTRIES = 20;

export interface HistoryEntry {
  id: string;
  runAt: string;
  portfolio: string[];
  weights: Record<string, number>;
  startDate: string;
  rebalanceFrequency: RebalanceFrequency;
  initialInvestment: number;
  result: BacktestResponse;
}

function readAll(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable or full - the run itself already succeeded, so
    // failing to persist it to history is not worth surfacing as an error.
  }
}

export function loadHistory(): HistoryEntry[] {
  return readAll();
}

export function saveHistoryEntry(entry: Omit<HistoryEntry, "id" | "runAt">): HistoryEntry[] {
  const newEntry: HistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    runAt: new Date().toISOString(),
  };
  const next = [newEntry, ...readAll()].slice(0, MAX_ENTRIES);
  writeAll(next);
  return next;
}

export function removeHistoryEntry(id: string): HistoryEntry[] {
  const next = readAll().filter((e) => e.id !== id);
  writeAll(next);
  return next;
}

export function clearHistory(): HistoryEntry[] {
  writeAll([]);
  return [];
}
