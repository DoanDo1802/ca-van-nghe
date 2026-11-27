import fs from 'node:fs';
import path from 'node:path';

/**
 * Extracts lightweight meshless GLB animation packs (nodes + animations + only referenced accessors)
 * from Character.glb and Tyler.glb so any character model can use all built-in locomotion & emote
 * animations without downloading heavy character textures/meshes.
 */
function extractMeshlessAnimGlb(srcGlbPath, outGlbPath, keepAnimNames) {
  const buf = fs.readFileSync(srcGlbPath);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    throw new Error(`Not a valid GLB: ${srcGlbPath}`);
  }
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binChunkHeaderOffset = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binChunkHeaderOffset);
  const binStart = binChunkHeaderOffset + 8;
  const bin = buf.subarray(binStart, binStart + binLen);

  const keepSet = keepAnimNames ? new Set(keepAnimNames) : null;
  const selectedAnims = (gltf.animations || []).filter((a) => !keepSet || keepSet.has(a.name));
  if (selectedAnims.length === 0) {
    throw new Error(`No matching animations found in ${srcGlbPath}`);
  }

  // Collect only accessors used by the selected animations
  const usedAccessors = new Set();
  for (const anim of selectedAnims) {
    for (const sampler of anim.samplers || []) {
      if (typeof sampler.input === 'number') usedAccessors.add(sampler.input);
      if (typeof sampler.output === 'number') usedAccessors.add(sampler.output);
    }
  }

  const sortedOldAccessors = Array.from(usedAccessors).sort((a, b) => a - b);
  const accessorRemap = new Map();
  const newAccessors = [];
  const newBufferViews = [];
  const binaryChunks = [];
  let byteOffset = 0;

  for (const oldAccIdx of sortedOldAccessors) {
    const oldAcc = gltf.accessors[oldAccIdx];
    const oldBv = gltf.bufferViews[oldAcc.bufferView];

    const compBytes =
      oldAcc.componentType === 5126
        ? 4
        : oldAcc.componentType === 5123 || oldAcc.componentType === 5122
          ? 2
          : 1;
    const typeCount =
      oldAcc.type === 'SCALAR'
        ? 1
        : oldAcc.type === 'VEC2'
          ? 2
          : oldAcc.type === 'VEC3'
            ? 3
            : oldAcc.type === 'VEC4' || oldAcc.type === 'MAT2'
              ? 4
              : oldAcc.type === 'MAT3'
                ? 9
                : 16;
    const elemSize = compBytes * typeCount;
    const stride = oldBv.byteStride || elemSize;
    const start = (oldBv.byteOffset || 0) + (oldAcc.byteOffset || 0);
    const packedByteLength = oldAcc.count * elemSize;
    const packed = Buffer.alloc(packedByteLength);

    for (let i = 0; i < oldAcc.count; i++) {
      const srcOff = start + i * stride;
      bin.copy(packed, i * elemSize, srcOff, srcOff + elemSize);
    }

    // Pad to 4-byte alignment
    const pad = (4 - (packedByteLength % 4)) % 4;
    const padBuf = pad > 0 ? Buffer.alloc(pad) : null;

    const newBvIdx = newBufferViews.length;
    newBufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: packedByteLength,
    });
    binaryChunks.push(packed);
    if (padBuf) binaryChunks.push(padBuf);
    byteOffset += packedByteLength + pad;

    const newAcc = {
      ...oldAcc,
      bufferView: newBvIdx,
    };
    delete newAcc.byteOffset;
    delete newAcc.sparse;

    accessorRemap.set(oldAccIdx, newAccessors.length);
    newAccessors.push(newAcc);
  }

  // Strip mesh/skin/camera/extensions from nodes while keeping exact hierarchy & rest transforms
  const cleanNodes = (gltf.nodes || []).map((n) => {
    const copy = {};
    if (n.name !== undefined) copy.name = n.name;
    if (n.children) copy.children = [...n.children];
    if (n.translation) copy.translation = [...n.translation];
    if (n.rotation) copy.rotation = [...n.rotation];
    if (n.scale) copy.scale = [...n.scale];
    if (n.matrix) copy.matrix = [...n.matrix];
    return copy;
  });

  const cleanAnimations = selectedAnims.map((anim) => ({
    name: anim.name,
    samplers: (anim.samplers || []).map((s) => ({
      input: accessorRemap.get(s.input),
      output: accessorRemap.get(s.output),
      interpolation: s.interpolation || 'LINEAR',
    })),
    channels: (anim.channels || [])
      .filter((ch) => ch.target && ch.target.path !== 'weights')
      .map((ch) => ({
        sampler: ch.sampler,
        target: {
          node: ch.target.node,
          path: ch.target.path,
        },
      })),
  }));

  const newGltf = {
    asset: { version: '2.0', generator: 'CaVanNghe-AnimPackExtractor' },
    scene: gltf.scene ?? 0,
    scenes: (gltf.scenes || [{ nodes: [0] }]).map((s) => ({
      name: s.name || 'Scene',
      nodes: s.nodes ? [...s.nodes] : [],
    })),
    nodes: cleanNodes,
    animations: cleanAnimations,
    accessors: newAccessors,
    bufferViews: newBufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  let jsonBuf = Buffer.from(JSON.stringify(newGltf), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad > 0) {
    jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  }
  const binBuf = Buffer.concat(binaryChunks);

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuf.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  fs.mkdirSync(path.dirname(outGlbPath), { recursive: true });
  fs.writeFileSync(
    outGlbPath,
    Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBuf])
  );
  console.log(
    `Extracted ${cleanAnimations.length} clips -> ${outGlbPath} (${(totalLength / 1024).toFixed(1)} KB)`
  );
}

extractMeshlessAnimGlb(
  path.resolve('public/models/Character.glb'),
  path.resolve('public/animations/core_locomotion.glb'),
  [
    'A_TPose',
    'Idle_Loop',
    'Walk_Loop',
    'Running',
    'Jumping',
    'JumpWhileRun',
    'Crouch_Idle_Loop',
    'Sitting_Idle_Loop',
    'Idle_Talking_Loop',
    'Dance_Loop',
    'Interact',
  ]
);

extractMeshlessAnimGlb(
  path.resolve('public/models/Tyler.glb'),
  path.resolve('public/animations/core_emotes.glb'),
  [
    'Idle_Loop',
    'Walk_Loop',
    'Running',
    'Jumping',
    'Singing',
    'Samba_Dancing',
    'Slide_Hip_Hop_Dance',
    'Swing_Dancing',
    'Wave_Hip_Hop_Dance',
    'Dancing_Twerk',
  ]
);
