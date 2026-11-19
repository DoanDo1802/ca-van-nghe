import React from 'react';
import AtmosphericRoom from './AtmosphericRoom';

/**
 * Static Architectural Shell of Ca Van Nghe Lounge
 * The dynamic and movable furniture is managed by DecoWorld / DEFAULT_LOUNGE_DECO_ITEMS
 */
export default function CaVanNgheLounge({
  onSelectObject,
  stageVideoId,
  isStageVideoMuted,
  isScreenOn,
  isAnyModalOpen,
  onOpenStageScreenModal
}) {
  return (
    <group position={[0, 0, 0]}>
      {/* 38m x 34m Expanded Room Shell, Floor, Stage Platform & Lights */}
      <AtmosphericRoom
        stageVideoId={stageVideoId}
        isStageVideoMuted={isStageVideoMuted}
        isScreenOn={isScreenOn}
        isAnyModalOpen={isAnyModalOpen}
        onOpenStageScreenModal={onOpenStageScreenModal}
      />
    </group>
  );
}
