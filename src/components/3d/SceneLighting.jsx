import React from 'react';

export default function SceneLighting({ isNightMode = false }) {
  const ambientIntensity = isNightMode ? 0.45 : 0.95;
  const ambientColor = isNightMode ? '#b0bec5' : '#fff3e0';
  const spotColor = isNightMode ? '#ff8a65' : '#ffb74d';
  const barColor = isNightMode ? '#00e5ff' : '#ffa726';
  const stageColor = isNightMode ? '#e040fb' : '#ff7043';

  return (
    <>
      {/* Ambient Base Light */}
      <ambientLight color={ambientColor} intensity={ambientIntensity} />

      {/* Main Directional Light with Shadows covering 38m x 34m */}
      <directionalLight
        position={[15, 18, 12]}
        intensity={isNightMode ? 1.0 : 2.0}
        color={spotColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={45}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />

      {/* Bar Spotlights */}
      <spotLight
        position={[-10.2, 5.5, -1.5]}
        target-position={[-10.2, 1.2, -1.5]}
        intensity={22}
        color={barColor}
        angle={0.65}
        penumbra={0.7}
      />
      <spotLight
        position={[-10.2, 5.5, 3.0]}
        target-position={[-10.2, 1.2, 3.0]}
        intensity={22}
        color={barColor}
        angle={0.65}
        penumbra={0.7}
      />

      {/* Dining Area Spotlights */}
      <spotLight
        position={[6.0, 5.2, 4.0]}
        target-position={[6.0, 0.75, 4.0]}
        intensity={25}
        color={spotColor}
        angle={0.55}
        penumbra={0.7}
      />
      <spotLight
        position={[7.2, 5.2, -2.0]}
        target-position={[7.2, 0.75, -2.0]}
        intensity={25}
        color={spotColor}
        angle={0.65}
        penumbra={0.7}
      />

      {/* Stage Theatrical Spotlights */}
      <spotLight
        position={[-3.0, 6.0, -8.0]}
        target-position={[-2.5, 1.5, -12.5]}
        intensity={35}
        color={stageColor}
        angle={0.6}
        penumbra={0.8}
      />
      <spotLight
        position={[3.0, 6.0, -8.0]}
        target-position={[2.5, 1.5, -12.5]}
        intensity={35}
        color={isNightMode ? '#00e5ff' : '#ffb300'}
        angle={0.6}
        penumbra={0.8}
      />

      {/* Reception Desk Spotlight */}
      <spotLight
        position={[0, 5.0, 9.5]}
        target-position={[0, 1.2, 11.5]}
        intensity={18}
        color="#ffe0b2"
        angle={0.6}
        penumbra={0.7}
      />

      {/* Floor Lamps Point Lights */}
      <pointLight position={[-7.2, 1.8, -4.5]} color="#ffb74d" intensity={12} distance={8} decay={2} />
      <pointLight position={[-7.2, 1.8,  5.5]} color="#ffb74d" intensity={12} distance={8} decay={2} />
      <pointLight position={[ 2.5, 1.8,  0.5]} color="#ffb74d" intensity={12} distance={8} decay={2} />
      <pointLight position={[12.5, 1.8,  0.5]} color="#ffb74d" intensity={12} distance={8} decay={2} />
    </>
  );
}
