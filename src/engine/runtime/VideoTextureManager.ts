import * as pc from 'playcanvas';

export interface VideoTextureHandle {
  texture: pc.Texture;
  material: pc.StandardMaterial;
  destroy: () => void;
}

/**
 * Creates a looping muted HTMLVideoElement backed `pc.Texture` + emissive `pc.StandardMaterial`
 * for in-world LED screens (e.g. `/media/bello-ballo.mp4`).
 */
export function createVideoScreenMaterial(
  app: pc.Application,
  videoUrl: string
): VideoTextureHandle {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.autoplay = true;

  const texture = new pc.Texture(app.graphicsDevice, {
    width: 512,
    height: 512,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });

  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(0.03, 0.04, 0.06);
  material.emissive = new pc.Color(0.03, 0.04, 0.06);
  material.emissiveIntensity = 1.15;
  material.useLighting = false;
  material.update();

  let videoReady = false;
  const onCanPlay = () => {
    if (!videoReady) {
      videoReady = true;
      material.emissive = new pc.Color(1, 1, 1);
      material.emissiveMap = texture;
      material.update();
    }
    void video.play().catch(() => {
      /* Autoplay may wait for user gesture; will play on interaction */
    });
  };
  video.addEventListener('canplay', onCanPlay);
  void video.play().catch(() => {
    /* Ignore autoplay restriction until user interacts */
  });

  const onUpdate = () => {
    if (videoReady && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      texture.setSource(video);
    }
  };
  app.on('update', onUpdate);

  const destroy = () => {
    app.off('update', onUpdate);
    video.removeEventListener('canplay', onCanPlay);
    video.pause();
    video.removeAttribute('src');
    video.load();
    material.destroy();
    texture.destroy();
  };

  return { texture, material, destroy };
}
