import { create } from 'zustand';
import type { ConsoleLogLevel, ConsoleLogPayload } from '../types';

export type ConsoleFilterLevel = ConsoleLogLevel | 'all';

export interface ConsoleLogInput {
  id?: string;
  level: ConsoleLogLevel;
  message: string;
  source?: string;
  timestamp?: number;
}

export interface ConsoleStoreState {
  entries: ConsoleLogPayload[];
  levelFilter: ConsoleFilterLevel;
  searchQuery: string;
  maxEntries: number;

  addLog: (entry: ConsoleLogInput) => void;
  clearLogs: () => void;
  setLevelFilter: (filter: ConsoleFilterLevel) => void;
  setSearchQuery: (query: string) => void;
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
  maxEntries: 500,

  addLog: (entry) =>
    set((state) => {
      const normalized: ConsoleLogPayload = {
        id: entry.id ?? createLogId(),
        level: entry.level,
        message: entry.message,
        source: entry.source,
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
}));
