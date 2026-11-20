import React, { useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { BottomDock } from './components/BottomDock';
import { HierarchyPanel } from './components/HierarchyPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { TopToolbar } from './components/TopToolbar';
import { ViewportPanel } from './components/ViewportPanel';
import { useEngineSync } from './hooks/useEngineSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export const EditorApp: React.FC = () => {
  useEngineSync();
  useKeyboardShortcuts();

  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  return (
    <div className="h-screen w-screen flex flex-col bg-[#12151b] text-gray-200 overflow-hidden select-none">
      <TopToolbar viewportSize={viewportSize} />

      <div className="flex-1 min-h-0">
        <Group orientation="vertical" className="h-full w-full">
          <Panel defaultSize="74%" minSize="35%">
            <Group orientation="horizontal" className="h-full w-full">
              <Panel defaultSize="18%" minSize="12%" maxSize="35%">
                <HierarchyPanel />
              </Panel>

              <Separator className="w-1 bg-[#1e222b] hover:bg-blue-500/70 transition-colors cursor-col-resize" />

              <Panel defaultSize="60%" minSize="30%">
                <ViewportPanel onViewportResize={setViewportSize} />
              </Panel>

              <Separator className="w-1 bg-[#1e222b] hover:bg-blue-500/70 transition-colors cursor-col-resize" />

              <Panel defaultSize="22%" minSize="15%" maxSize="40%">
                <InspectorPanel />
              </Panel>
            </Group>
          </Panel>

          <Separator className="h-1 bg-[#1e222b] hover:bg-blue-500/70 transition-colors cursor-row-resize" />

          <Panel defaultSize="26%" minSize="12%" maxSize="50%">
            <BottomDock />
          </Panel>
        </Group>
      </div>
    </div>
  );
};

export default EditorApp;
