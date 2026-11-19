import React, { useMemo } from 'react';

export default function SceneLighting({ isNightMode = false }) {
  const ambientIntensity = isNightMode ? 0.45 : 0.95;
  const ambientColor = isNightMode ? '#b0bec5' : '#fff3e0';
  const spotColor = isNightMode ? '#ff8a65' : '#ffb74d';
  const barColor = isNightMode ? '#00e5ff' : '#ffa726';
  const stageColor = isNightMode ? '#e040fb' : '#ff7043';

  const spotLights = useMemo(() => [
    // Bar Spotlight
    { key: 'bar', pos: [-10.2, 5.8, 0.8], target: [-10.2, 1.2, 0.8], intensity: 28, color: barColor, angle: 0.8, penumbra: 0.75 },
    // Reception Desk Spotlight
    { key: 'reception', pos: [0, 5.0, 9.5], target: [0, 1.2, 11.5], intensity: 18, color: '#ffe0b2', angle: 0.6, penumbra: 0.7 }
  ], [barColor]);

  const pointLights = useMemo(() => [
    [-7.2, 1.8, -4.5],
    [-7.2, 1.8, 5.5],
    [2.5, 1.8, 0.5]
  ], []);

  return (
    <>
      <ambientLight color={ambientColor} intensity={ambientIntensity} />

      <directionalLight
        position={[15, 18, 12]}
        intensity={isNightMode ? 1.0 : 2.0}
        color={spotColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={45}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />

      {spotLights.map((l) => (
        <spotLight
          key={l.key}
          position={l.pos}
          target-position={l.target}
          intensity={l.intensity}
          color={l.color}
          angle={l.angle}
          penumbra={l.penumbra}
        />
      ))}

      {pointLights.map((pos, idx) => (
        <pointLight key={`lamp_pt_${idx}`} position={pos} color="#ffb74d" intensity={12} distance={8} decay={2} />
      ))}
    </>
  );
}
