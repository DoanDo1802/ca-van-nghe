import React, { useEffect, useMemo, useRef } from 'react';
import { AlertCircle, AlertTriangle, Info, Search, Terminal, Trash2 } from 'lucide-react';
import { useConsoleStore, type ConsoleFilterLevel } from '../../store/useConsoleStore';
import type { ConsoleLogLevel } from '../../types';

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const LEVEL_STYLES: Record<
  ConsoleLogLevel,
  { row: string; icon: React.ComponentType<{ className?: string }>; iconClass: string }
> = {
  log: {
    row: 'text-gray-300 border-b border-[#1f242e]',
    icon: Info,
    iconClass: 'text-sky-400',
  },
  warn: {
    row: 'text-amber-200 bg-amber-500/5 border-b border-amber-500/15',
    icon: AlertTriangle,
    iconClass: 'text-amber-400',
  },
  error: {
    row: 'text-red-200 bg-red-500/10 border-b border-red-500/20',
    icon: AlertCircle,
    iconClass: 'text-red-400',
  },
};

export const ConsolePanel: React.FC = () => {
  const entries = useConsoleStore((s) => s.entries);
  const levelFilter = useConsoleStore((s) => s.levelFilter);
  const searchQuery = useConsoleStore((s) => s.searchQuery);
  const setLevelFilter = useConsoleStore((s) => s.setLevelFilter);
  const setSearchQuery = useConsoleStore((s) => s.setSearchQuery);
  const clearLogs = useConsoleStore((s) => s.clearLogs);

  const listRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    let log = 0;
    let warn = 0;
    let error = 0;
    for (const entry of entries) {
      if (entry.level === 'log') log += 1;
      else if (entry.level === 'warn') warn += 1;
      else if (entry.level === 'error') error += 1;
    }
    return { all: entries.length, log, warn, error };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (!query) return true;
      return (
        entry.message.toLowerCase().includes(query) ||
        (entry.source?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [entries, levelFilter, searchQuery]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filteredEntries.length]);

  const filterButtons: Array<{ id: ConsoleFilterLevel; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'log', label: 'Log', count: counts.log },
    { id: 'warn', label: 'Warn', count: counts.warn },
    { id: 'error', label: 'Error', count: counts.error },
  ];

  return (
    <div className="h-full flex flex-col bg-[#151820] text-xs">
      {/* Header */}
      <div className="h-8 shrink-0 px-2.5 bg-[#1b1f27] border-b border-[#2b313d] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-gray-400" />
          <span className="font-semibold text-gray-200 tracking-wide uppercase text-[11px]">
            Console
          </span>

          <div className="flex items-center gap-1 ml-2">
            {filterButtons.map((btn) => {
              const active = levelFilter === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setLevelFilter(btn.id)}
                  className={`h-5 px-2 rounded text-[11px] flex items-center gap-1 transition-colors ${
                    active
                      ? 'bg-blue-600/80 text-white'
                      : 'bg-[#12151b] text-gray-400 hover:text-gray-200 hover:bg-[#252b36]'
                  }`}
                >
                  <span>{btn.label}</span>
                  <span className="opacity-75 font-mono">{btn.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-gray-500 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter logs..."
              className="h-5 w-40 pl-6 pr-2 rounded bg-[#12151b] border border-[#2b313d] text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={clearLogs}
            title="Clear Console"
            className="h-5 px-2 rounded bg-[#12151b] border border-[#2b313d] text-gray-300 hover:text-white hover:bg-[#252b36] flex items-center gap-1 text-[11px] transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Log List */}
      <div ref={listRef} className="flex-1 overflow-y-auto font-mono text-[11px]">
        {filteredEntries.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs font-sans">
            No console messages
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const style = LEVEL_STYLES[entry.level];
            const Icon = style.icon;
            return (
              <div
                key={entry.id}
                className={`px-2.5 py-1 flex items-start gap-2 leading-relaxed ${style.row}`}
              >
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${style.iconClass}`} />
                <span className="text-gray-500 shrink-0">[{formatTimestamp(entry.timestamp)}]</span>
                {entry.source && (
                  <span className="px-1 py-0 rounded bg-[#232834] text-gray-300 shrink-0">
                    {entry.source}
                  </span>
                )}
                <span className="break-all whitespace-pre-wrap select-text">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
