import React, { useRef, useEffect } from 'react';
import { TransformControls } from '@react-three/drei';
import Model from './Model';

function DecoItem({
  item,
  isSelected,
  onSelect,
  onUpdate,
  gizmoMode = 'translate',
  snapEnabled = true,
  isDecoMode,
  onInteractiveClick,
  onTransformStart,
  onTransformEnd
}) {
  const groupRef = useRef();
  const transformRef = useRef();

  // Sync TransformControls drag state & update final coordinates
  useEffect(() => {
    const controls = transformRef.current;
    if (!controls) return;

    const handleDragging = (e) => {
      if (e.value) {
        if (onTransformStart) onTransformStart();
      } else {
        if (onTransformEnd) onTransformEnd();
        if (groupRef.current) {
          const p = groupRef.current.position;
          const r = groupRef.current.rotation;

          let finalX = Number(p.x.toFixed(2));
          let finalY = Number(p.y.toFixed(2));
          let finalZ = Number(p.z.toFixed(2));
          let finalRotY = Number(r.y.toFixed(2));

          if (snapEnabled) {
            // Absolute 0.25m grid snap to guarantee 100% straight alignment across chairs/counters
            finalX = Math.round(finalX / 0.25) * 0.25;
            finalZ = Math.round(finalZ / 0.25) * 0.25;
            // Angle snap: 15° (Math.PI / 12)
            const angleStep = Math.PI / 12;
            finalRotY = Math.round(finalRotY / angleStep) * angleStep;

            // Direct snap on 3D object
            groupRef.current.position.set(finalX, finalY, finalZ);
            groupRef.current.rotation.set(0, finalRotY, 0);
          }

          onUpdate(item.id, {
            position: [
              Number(finalX.toFixed(2)),
              finalY,
              Number(finalZ.toFixed(2))
            ],
            rotation: [
              0,
              Number(finalRotY.toFixed(2)),
              0
            ]
          });
        }
      }
    };

    controls.addEventListener('dragging-changed', handleDragging);
    return () => controls.removeEventListener('dragging-changed', handleDragging);
  }, [isSelected, isDecoMode, item.id, onTransformStart, onTransformEnd, onUpdate]);

  return (
    <>
      <group
        ref={groupRef}
        position={item.position}
        rotation={item.rotation}
        scale={item.scale || [1, 1, 1]}
        onClick={(e) => {
          e.stopPropagation();
          if (isDecoMode) {
            onSelect(item.id);
          } else if (item.interactiveId && onInteractiveClick) {
            onInteractiveClick(item.interactiveId);
          }
        }}
        onPointerOver={(e) => {
          if (isDecoMode) {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={() => {
          if (isDecoMode) {
            document.body.style.cursor = 'default';
          }
        }}
      >
        <Model
          url={item.url}
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          scale={[1, 1, 1]}
        />

        {/* Visual bounding wireframe indicator when selected */}
        {isDecoMode && isSelected && (
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[1.3, 1.1, 1.3]} />
            <meshBasicMaterial
              color="#f59e0b"
              wireframe
              transparent
              opacity={0.85}
            />
          </mesh>
        )}
      </group>

      {/* 3D Transform Gizmo */}
      {isDecoMode && isSelected && groupRef.current && (
        <TransformControls
          ref={transformRef}
          object={groupRef.current}
          mode={gizmoMode}
          size={0.78}
          space="world"
          translationSnap={snapEnabled ? 0.25 : null}
          rotationSnap={snapEnabled ? Math.PI / 12 : null}
        />
      )}
    </>
  );
}

export default function DecoWorld({
  decoItems = [],
  selectedDecoId,
  onSelectDeco,
  onUpdateDeco,
  gizmoMode = 'translate',
  snapEnabled = true,
  isDecoMode = false,
  onInteractiveClick,
  onTransformStart,
  onTransformEnd
}) {
  return (
    <group>
      {/* Invisible floor click-catcher to deselect when clicking on empty floor */}
      {isDecoMode && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.005, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectDeco(null);
          }}
          visible={false}
        >
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial />
        </mesh>
      )}

      {/* Render all placed items */}
      {decoItems.map((item) => (
        <DecoItem
          key={item.id}
          item={item}
          isSelected={selectedDecoId === item.id}
          onSelect={onSelectDeco}
          onUpdate={onUpdateDeco}
          gizmoMode={gizmoMode}
          snapEnabled={snapEnabled}
          isDecoMode={isDecoMode}
          onInteractiveClick={onInteractiveClick}
          onTransformStart={onTransformStart}
          onTransformEnd={onTransformEnd}
        />
      ))}
    </group>
  );
}
