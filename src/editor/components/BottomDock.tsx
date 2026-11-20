import React, { useMemo, useState } from 'react';
import { Clapperboard, FolderOpen, Terminal } from 'lucide-react';
import { useConsoleStore } from '../../store/useConsoleStore';
import { AssetBrowserPanel } from './AssetBrowserPanel';
import { ConsolePanel } from './ConsolePanel';
import { TimelinePanel } from './TimelinePanel';

export type BottomDockTab = 'assets' | 'animation' | 'console';

export const BottomDock: React.FC = () => {
  const [activeTab, setActiveTab] = useState<BottomDockTab>('assets');
  const entries = useConsoleStore((s) => s.entries);

  const { errorCount, warnCount } = useMemo(() => {
    let errors = 0;
    let warns = 0;
    for (const entry of entries) {
      if (entry.level === 'error') errors += 1;
      else if (entry.level === 'warn') warns += 1;
    }
    return { errorCount: errors, warnCount: warns };
  }, [entries]);

  const tabs: Array<{
    id: BottomDockTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'assets', label: 'Project / Assets', icon: FolderOpen },
    { id: 'animation', label: 'Animation', icon: Clapperboard },
    { id: 'console', label: 'Console', icon: Terminal },
  ];

  return (
    <div className="h-full flex flex-col bg-[#151820] text-xs">
      {/* Tab Bar */}
      <div className="h-8 shrink-0 px-2 bg-[#1b1f27] border-b border-[#2b313d] flex items-center gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`h-6 px-2.5 rounded-t flex items-center gap-1.5 text-[11px] font-medium transition-colors border-b-2 ${
                isActive
                  ? 'bg-[#151820] text-white border-blue-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#232834] border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.id === 'console' && errorCount > 0 && (
                <span className="px-1.5 py-0 rounded-full bg-red-500/20 text-red-300 font-mono text-[10px]">
                  {errorCount}
                </span>
              )}
              {tab.id === 'console' && errorCount === 0 && warnCount > 0 && (
                <span className="px-1.5 py-0 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                  {warnCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'assets' && <AssetBrowserPanel />}
        {activeTab === 'animation' && <TimelinePanel />}
        {activeTab === 'console' && <ConsolePanel />}
      </div>
    </div>
  );
};
