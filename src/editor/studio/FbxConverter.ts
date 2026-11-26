/**
 * Editor-only client-side converter that turns downloaded `.fbx` or `.gltf` models
 * and Mixamo "Without Skin" `.fbx` animation clips into clean binary `.glb` buffers.
 *
 * Uses dynamic `import()` so Three.js loaders/exporters are NEVER bundled into
 * the standalone player (`dist-player` / `WebGamePlayer`).
 */

export interface ConvertedGlbPayload {
  glbBuffer: ArrayBuffer;
  suggestedFilename: string;
  sourceFormat: 'glb' | 'gltf' | 'fbx';
  clipNames: string[];
  hasMesh: boolean;
  warnings?: string[];
}

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'emissiveMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'specularMap',
] as const;

function hasValidTextureImageData(tex: import('three').Texture): boolean {
  const img = tex.image as
    | {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
        data?: ArrayBufferView;
        complete?: boolean;
      }
    | undefined;
  if (!img) return false;
  if (img.data && (img.width ?? 0) > 0 && (img.height ?? 0) > 0) {
    return true;
  }
  const w = img.naturalWidth ?? img.width ?? 0;
  const h = img.naturalHeight ?? img.height ?? 0;
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
    return img.complete && w > 0 && h > 0;
  }
  return w > 0 && h > 0;
}

function waitForImageElement(
  img: HTMLImageElement,
  timeoutMs = 5000
): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      img.removeEventListener('load', done);
      img.removeEventListener('error', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    img.addEventListener('load', done);
    img.addEventListener('error', done);
  });
}

async function awaitAndSanitizeTextures(
  rootObject: import('three').Object3D,
  managerDonePromise: Promise<void>
): Promise<number> {
  // Give LoadingManager a chance to finish decoding embedded blob: textures
  await managerDonePromise;

  const pendingImages: Promise<void>[] = [];
  const materials: Array<import('three').Material> = [];

  rootObject.traverse((obj) => {
    const mesh = obj as import('three').Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const arr = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of arr) {
      materials.push(mat);
      const rec = mat as unknown as Record<string, unknown>;
      for (const slot of TEXTURE_SLOTS) {
        const tex = rec[slot] as import('three').Texture | null | undefined;
        if (
          tex &&
          typeof HTMLImageElement !== 'undefined' &&
          tex.image instanceof HTMLImageElement &&
          !tex.image.complete
        ) {
          pendingImages.push(waitForImageElement(tex.image));
        }
      }
    }
  });

  if (pendingImages.length > 0) {
    await Promise.all(pendingImages);
  }

  let strippedInvalidCount = 0;
  for (const mat of materials) {
    const rec = mat as unknown as Record<string, unknown>;
    for (const slot of TEXTURE_SLOTS) {
      const tex = rec[slot] as import('three').Texture | null | undefined;
      if (!tex) continue;
      if (!hasValidTextureImageData(tex)) {
        rec[slot] = null;
        strippedInvalidCount++;
      }
    }
  }

  return strippedInvalidCount;
}

export async function convertDroppedFileToGlb(file: File): Promise<ConvertedGlbPayload> {
  const rawName = file.name || 'asset.glb';
  const ext = rawName.split('.').pop()?.toLowerCase() ?? '';
  const baseName = rawName.replace(/\.(glb|gltf|fbx)$/i, '').trim() || 'asset';
  const rawBuffer = await file.arrayBuffer();

  if (ext === 'glb') {
    const view = new DataView(rawBuffer);
    if (rawBuffer.byteLength < 12 || view.getUint32(0, true) !== 0x46546c67) {
      throw new Error(`File "${rawName}" không phải định dạng GLB nhị phân hợp lệ.`);
    }
    const meta = inspectGlbHeader(rawBuffer);
    return {
      glbBuffer: rawBuffer,
      suggestedFilename: `${baseName}.glb`,
      sourceFormat: 'glb',
      clipNames: meta.clipNames,
      hasMesh: meta.hasMesh,
    };
  }

  if (ext !== 'fbx' && ext !== 'gltf') {
    throw new Error(
      `Định dạng ".${ext}" chưa hỗ trợ. Vui lòng kéo thả file .glb, .gltf hoặc .fbx.`
    );
  }

  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

  let pendingManagerLoads = 0;
  let resolveManagerIdle: (() => void) | null = null;
  const manager = new THREE.LoadingManager();
  manager.onStart = (_url, itemsLoaded, itemsTotal) => {
    pendingManagerLoads = Math.max(0, itemsTotal - itemsLoaded);
  };
  manager.onProgress = (_url, itemsLoaded, itemsTotal) => {
    pendingManagerLoads = Math.max(0, itemsTotal - itemsLoaded);
    if (pendingManagerLoads === 0 && resolveManagerIdle) {
      resolveManagerIdle();
    }
  };
  manager.onLoad = () => {
    pendingManagerLoads = 0;
    if (resolveManagerIdle) resolveManagerIdle();
  };
  manager.onError = () => {
    // Allow fallback stripping in awaitAndSanitizeTextures instead of hanging
  };

  const waitForManagerIdle = (): Promise<void> => {
    if (pendingManagerLoads === 0) {
      // Yield one macrotask so FBXLoader's synchronous image.src assignments settle
      return new Promise((r) => setTimeout(r, 60));
    }
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolveManagerIdle = null;
        resolve();
      };
      resolveManagerIdle = done;
      const timer = setTimeout(done, 6000);
    });
  };

  let rootObject: import('three').Object3D;
  let animations: import('three').AnimationClip[] = [];
  const warnings: string[] = [];

  if (ext === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const loader = new FBXLoader(manager);
    const fbxGroup = loader.parse(rawBuffer, '');
    fbxGroup.name = fbxGroup.name || baseName;
    animations = Array.isArray(fbxGroup.animations) ? fbxGroup.animations : [];

    // Wait for embedded textures (blob: URLs) to decode & strip broken external texture slots
    const strippedCount = await awaitAndSanitizeTextures(fbxGroup, waitForManagerIdle());
    if (strippedCount > 0) {
      warnings.push(
        `Đã bỏ qua ${strippedCount} texture rời bị thiếu trong file FBX (giữ nguyên màu/texture nhúng sẵn).`
      );
    }

    // Convert legacy FBX Phong/Lambert materials to PBR MeshStandardMaterial for clean GLTFExporter output
    fbxGroup.traverse((obj) => {
      const mesh = obj as import('three').Mesh;
      if (!mesh.isMesh || !mesh.material) return;

      const convertMat = (m: import('three').Material): import('three').Material => {
        if ((m as import('three').MeshStandardMaterial).isMeshStandardMaterial) {
          return m;
        }
        const anyMat = m as unknown as Record<string, unknown>;
        const std = new THREE.MeshStandardMaterial({
          name: m.name || 'Material',
          roughness: 0.78,
          metalness: 0.04,
          side: m.side,
          transparent: Boolean(m.transparent),
          opacity: typeof m.opacity === 'number' ? m.opacity : 1,
          alphaTest: typeof m.alphaTest === 'number' ? m.alphaTest : 0,
        });
        if (anyMat.color && (anyMat.color as import('three').Color).isColor) {
          std.color.copy(anyMat.color as import('three').Color);
        }
        if (anyMat.map) {
          const mapTex = anyMat.map as import('three').Texture;
          mapTex.colorSpace = THREE.SRGBColorSpace;
          std.map = mapTex;
        }
        if (anyMat.normalMap) {
          std.normalMap = anyMat.normalMap as import('three').Texture;
        }
        if (anyMat.emissiveMap) {
          std.emissiveMap = anyMat.emissiveMap as import('three').Texture;
        }
        if (anyMat.alphaMap) {
          std.alphaMap = anyMat.alphaMap as import('three').Texture;
        }
        return std;
      };

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(convertMat);
      } else {
        mesh.material = convertMat(mesh.material);
      }
    });

    // Ensure clean clip names (Mixamo often names clips "mixamo.com")
    animations.forEach((clip, idx) => {
      if (!clip.name || clip.name === 'mixamo.com' || clip.name === 'Take 001') {
        clip.name =
          animations.length === 1 ? baseName.replace(/\s+/g, '_') : `${baseName}_${idx + 1}`;
      }
    });

    rootObject = fbxGroup;
  } else {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader(manager);
    const gltf = await loader.parseAsync(rawBuffer, '');
    rootObject = gltf.scene;
    animations = gltf.animations || [];
    const strippedCount = await awaitAndSanitizeTextures(rootObject, waitForManagerIdle());
    if (strippedCount > 0) {
      warnings.push(`Đã bỏ qua ${strippedCount} texture rời bị thiếu.`);
    }
  }

  let hasMesh = false;
  rootObject.traverse((obj) => {
    if ((obj as import('three').Mesh).isMesh) {
      hasMesh = true;
    }
  });

  rootObject.updateMatrixWorld(true);

  const exporter = new GLTFExporter();
  const exported = await exporter.parseAsync(rootObject, {
    binary: true,
    animations,
    includeCustomExtensions: false,
  });

  if (!(exported instanceof ArrayBuffer)) {
    throw new Error(`Chuyển đổi "${rawName}" sang GLB thất bại.`);
  }

  return {
    glbBuffer: exported,
    suggestedFilename: `${baseName}.glb`,
    sourceFormat: ext,
    clipNames: animations.map((a) => a.name),
    hasMesh,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function inspectGlbHeader(glbBuffer: ArrayBuffer): { clipNames: string[]; hasMesh: boolean } {
  try {
    const view = new DataView(glbBuffer);
    const jsonLen = view.getUint32(12, true);
    const jsonBytes = new Uint8Array(glbBuffer, 20, jsonLen);
    const text = new TextDecoder('utf-8').decode(jsonBytes);
    const parsed = JSON.parse(text) as {
      animations?: Array<{ name?: string }>;
      meshes?: unknown[];
    };
    const clipNames = (parsed.animations ?? []).map(
      (a, idx) => a.name || `Track_${idx}`
    );
    const hasMesh = Array.isArray(parsed.meshes) && parsed.meshes.length > 0;
    return { clipNames, hasMesh };
  } catch {
    return { clipNames: [], hasMesh: true };
  }
}
