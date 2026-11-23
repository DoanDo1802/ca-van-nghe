import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Copy,
  Info,
  Layers,
  Play,
  Search,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useConsoleStore, type ConsoleFilterLevel } from '../../store/useConsoleStore';
import { DebugLogger } from '../../utils/debugLogger';
import type { ConsoleLogLevel, ConsoleLogPayload } from '../../types';

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
    row: 'text-gray-300 border-b border-[#1f242e] hover:bg-white/[0.03]',
    icon: Info,
    iconClass: 'text-sky-400',
  },
  warn: {
    row: 'text-amber-200 bg-amber-500/5 border-b border-amber-500/15 hover:bg-amber-500/10',
    icon: AlertTriangle,
    iconClass: 'text-amber-400',
  },
  error: {
    row: 'text-red-200 bg-red-500/10 border-b border-red-500/20 hover:bg-red-500/15',
    icon: AlertCircle,
    iconClass: 'text-red-400',
  },
};

interface DisplayEntry {
  entry: ConsoleLogPayload;
  count: number;
}

export const ConsolePanel: React.FC = () => {
  const entries = useConsoleStore((s) => s.entries);
  const levelFilter = useConsoleStore((s) => s.levelFilter);
  const searchQuery = useConsoleStore((s) => s.searchQuery);
  const collapseDuplicates = useConsoleStore((s) => s.collapseDuplicates);
  const clearOnPlay = useConsoleStore((s) => s.clearOnPlay);
  const setLevelFilter = useConsoleStore((s) => s.setLevelFilter);
  const setSearchQuery = useConsoleStore((s) => s.setSearchQuery);
  const toggleCollapseDuplicates = useConsoleStore((s) => s.toggleCollapseDuplicates);
  const toggleClearOnPlay = useConsoleStore((s) => s.toggleClearOnPlay);
  const clearLogs = useConsoleStore((s) => s.clearLogs);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

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

  const displayedEntries = useMemo<DisplayEntry[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (!query) return true;
      return (
        entry.message.toLowerCase().includes(query) ||
        (entry.source?.toLowerCase().includes(query) ?? false) ||
        (entry.stack?.toLowerCase().includes(query) ?? false)
      );
    });

    if (!collapseDuplicates) {
      return filtered.map((entry) => ({ entry, count: 1 }));
    }

    const collapsed: DisplayEntry[] = [];
    const indexByKey = new Map<string, number>();
    for (const entry of filtered) {
      const key = `${entry.level}|${entry.source ?? ''}|${entry.message}`;
      const existingIdx = indexByKey.get(key);
      if (existingIdx !== undefined) {
        collapsed[existingIdx].count += 1;
        collapsed[existingIdx].entry = entry;
      } else {
        indexByKey.set(key, collapsed.length);
        collapsed.push({ entry, count: 1 });
      }
    }
    return collapsed;
  }, [entries, levelFilter, searchQuery, collapseDuplicates]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [displayedEntries.length]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 24;
  };

  const handleClear = () => {
    DebugLogger.clearBuffer();
    clearLogs();
    setSelectedId(null);
  };

  const handleCopySelected = () => {
    if (!selectedEntry) return;
    const text = [
      `[${formatTimestamp(selectedEntry.timestamp)}] [${selectedEntry.level.toUpperCase()}]${selectedEntry.source ? ` [${selectedEntry.source}]` : ''} ${selectedEntry.message}`,
      selectedEntry.stack ? selectedEntry.stack : '',
    ]
      .filter(Boolean)
      .join('\n');
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  const filterButtons: Array<{
    id: ConsoleFilterLevel;
    label: string;
    count: number;
    badgeClass?: string;
  }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'log', label: 'Log', count: counts.log, badgeClass: 'text-sky-300' },
    { id: 'warn', label: 'Warn', count: counts.warn, badgeClass: 'text-amber-300' },
    { id: 'error', label: 'Error', count: counts.error, badgeClass: 'text-red-300' },
  ];

  return (
    <div className="h-full flex flex-col bg-[#151820] text-xs">
      {/* Unity-style Console Header */}
      <div className="h-8 shrink-0 px-2.5 bg-[#1b1f27] border-b border-[#2b313d] flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          <Terminal className="w-3.5 h-3.5 text-gray-400" />
          <span className="font-semibold text-gray-200 tracking-wide uppercase text-[11px]">
            Console
          </span>

          <div className="flex items-center gap-1 ml-1.5">
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
                  <span
                    className={`font-mono ${active ? 'opacity-90' : btn.badgeClass ?? 'opacity-75'}`}
                  >
                    {btn.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-[#2b313d] mx-1" />

          <button
            type="button"
            onClick={toggleCollapseDuplicates}
            title="Collapse identical log messages (Unity style)"
            className={`h-5 px-2 rounded text-[11px] flex items-center gap-1 transition-colors border ${
              collapseDuplicates
                ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                : 'bg-[#12151b] border-[#2b313d] text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Collapse</span>
          </button>

          <button
            type="button"
            onClick={toggleClearOnPlay}
            title="Clear console automatically when entering Play Mode"
            className={`h-5 px-2 rounded text-[11px] flex items-center gap-1 transition-colors border ${
              clearOnPlay
                ? 'bg-emerald-600/25 border-emerald-500/50 text-emerald-200'
                : 'bg-[#12151b] border-[#2b313d] text-gray-400 hover:text-gray-200'
            }`}
          >
            <Play className="w-2.5 h-2.5" />
            <span>Clear on Play</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
            onClick={handleClear}
            title="Clear Console"
            className="h-5 px-2 rounded bg-[#12151b] border border-[#2b313d] text-gray-300 hover:text-white hover:bg-[#252b36] flex items-center gap-1 text-[11px] transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Log List */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-[11px]"
      >
        {displayedEntries.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs font-sans">
            No console messages
          </div>
        ) : (
          displayedEntries.map(({ entry, count }) => {
            const style = LEVEL_STYLES[entry.level];
            const Icon = style.icon;
            const isSelected = selectedId === entry.id;
            return (
              <div
                key={entry.id}
                onClick={() => setSelectedId(isSelected ? null : entry.id)}
                className={`px-2.5 py-1 flex items-start gap-2 leading-relaxed cursor-pointer ${style.row} ${
                  isSelected ? 'ring-1 ring-inset ring-blue-500/60 bg-blue-500/10' : ''
                }`}
              >
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${style.iconClass}`} />
                <span className="text-gray-500 shrink-0">[{formatTimestamp(entry.timestamp)}]</span>
                {entry.source && (
                  <span className="px-1 py-0 rounded bg-[#232834] text-gray-300 shrink-0">
                    {entry.source}
                  </span>
                )}
                <span className="flex-1 break-all whitespace-pre-wrap select-text">
                  {entry.message}
                </span>
                {count > 1 && (
                  <span className="px-1.5 py-0 rounded-full bg-[#2a3140] text-gray-200 text-[10px] font-semibold shrink-0">
                    {count}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Unity-style Selected Entry / Stack Trace Drawer */}
      {selectedEntry && (
        <div className="h-28 shrink-0 border-t border-[#2b313d] bg-[#10131a] flex flex-col">
          <div className="h-6 px-2.5 bg-[#181c24] border-b border-[#232834] flex items-center justify-between text-[10px] text-gray-400">
            <span>
              {selectedEntry.level.toUpperCase()} • {selectedEntry.source || 'Runtime'} •{' '}
              {formatTimestamp(selectedEntry.timestamp)}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopySelected}
                className="px-1.5 py-0.5 rounded bg-[#232834] hover:bg-[#2e3545] text-gray-200 inline-flex items-center gap-1"
              >
                <Copy className="w-2.5 h-2.5" />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="p-0.5 text-gray-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          <pre className="flex-1 overflow-auto p-2 text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all select-text">
            {selectedEntry.message}
            {selectedEntry.stack ? `\n\n${selectedEntry.stack}` : ''}
          </pre>
        </div>
      )}
    </div>
  );
};
