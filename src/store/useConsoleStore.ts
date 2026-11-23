import { create } from 'zustand';
import type { ConsoleLogLevel, ConsoleLogPayload } from '../types';

export type ConsoleFilterLevel = ConsoleLogLevel | 'all';

export interface ConsoleLogInput {
  id?: string;
  level: ConsoleLogLevel;
  message: string;
  source?: string;
  stack?: string;
  timestamp?: number;
}

export interface ConsoleStoreState {
  entries: ConsoleLogPayload[];
  levelFilter: ConsoleFilterLevel;
  searchQuery: string;
  collapseDuplicates: boolean;
  clearOnPlay: boolean;
  maxEntries: number;

  addLog: (entry: ConsoleLogInput) => void;
  clearLogs: () => void;
  setLevelFilter: (filter: ConsoleFilterLevel) => void;
  setSearchQuery: (query: string) => void;
  toggleCollapseDuplicates: () => void;
  toggleClearOnPlay: () => void;
}

let logSequence = 0;

function createLogId(): string {
  logSequence += 1;
  return `log_${Date.now()}_${logSequence}`;
}

export const useConsoleStore = create<ConsoleStoreState>()((set) => ({
  entries: [],
  levelFilter: 'all',
  searchQuery: '',
  collapseDuplicates: false,
  clearOnPlay: false,
  maxEntries: 500,

  addLog: (entry) =>
    set((state) => {
      if (entry.id && state.entries.some((e) => e.id === entry.id)) {
        return state;
      }
      const normalized: ConsoleLogPayload = {
        id: entry.id ?? createLogId(),
        level: entry.level,
        message: entry.message,
        source: entry.source,
        stack: entry.stack,
        timestamp: entry.timestamp ?? Date.now(),
      };
      const nextEntries = [...state.entries, normalized];
      if (nextEntries.length > state.maxEntries) {
        nextEntries.splice(0, nextEntries.length - state.maxEntries);
      }
      return { entries: nextEntries };
    }),

  clearLogs: () => set({ entries: [] }),

  setLevelFilter: (levelFilter) => set({ levelFilter }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  toggleCollapseDuplicates: () =>
    set((state) => ({ collapseDuplicates: !state.collapseDuplicates })),

  toggleClearOnPlay: () => set((state) => ({ clearOnPlay: !state.clearOnPlay })),
}));
