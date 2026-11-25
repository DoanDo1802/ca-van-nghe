import * as pc from 'playcanvas';
import { MultiplayerManager, type NetworkStageState } from '../../network/MultiplayerManager';

export interface StageMediaState {
  sourceType: 'media' | 'youtube';
  mediaUrl: string;
  domVideoFallback?: boolean;
  youtubeVideoId: string | null;
  youtubeQuality: string;
  title: string;
  isPlaying: boolean;
  isScreenOn: boolean;
  volume: number; // 0..1 (local client volume)
  isMuted: boolean; // local client mute
  currentTime?: number;
  timeUpdatedAt?: number;
}

export interface ScreenProjectionData {
  visible: boolean;
  matrix3d: string;
  tooSmall?: boolean;
}

const DEFAULT_LEFT_SPEAKER_POS = new pc.Vec3(-6.45, 1.5, -9.7);
const DEFAULT_RIGHT_SPEAKER_POS = new pc.Vec3(6.45, 1.5, -9.7);
const SPEAKER_EMIT_Y_OFFSET = 1.14; // Woofer/horn height above stage floor (0.36 + 1.14 = 1.5m)
const YT_STAGE_WIDTH = 1280;
const YT_STAGE_HEIGHT = 720;

const _c0 = new pc.Vec3();
const _c1 = new pc.Vec3();
const _c2 = new pc.Vec3();
const _c3 = new pc.Vec3();
const _s0 = new pc.Vec3();
const _s1 = new pc.Vec3();
const _s2 = new pc.Vec3();
const _s3 = new pc.Vec3();
const _screenPos = new pc.Vec3();

function solveHomographyMatrix3d(
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number
): string | null {
  // Maps (0,0)->(x0,y0), (w,0)->(x1,y1), (0,h)->(x2,y2), (w,h)->(x3,y3)
  const A: number[][] = [
    [0, 0, 1, 0, 0, 0, 0, 0, x0],
    [w, 0, 1, 0, 0, 0, -w * x1, 0, x1],
    [0, h, 1, 0, 0, 0, 0, -h * x2, x2],
    [w, h, 1, 0, 0, 0, -w * x3, -h * x3, x3],
    [0, 0, 0, 0, 0, 1, 0, 0, y0],
    [0, 0, 0, w, 0, 1, -w * y1, 0, y1],
    [0, 0, 0, 0, h, 1, 0, -h * y2, y2],
    [0, 0, 0, w, h, 1, -w * y3, -h * y3, y3],
  ];

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 8; col++) {
    let maxRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < 8; r++) {
      const v = Math.abs(A[r][col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = r;
      }
    }
    if (maxVal < 1e-8) return null;
    if (maxRow !== col) {
      const tmp = A[col];
      A[col] = A[maxRow];
      A[maxRow] = tmp;
    }
    const pivot = A[col][col];
    for (let c = col; c < 9; c++) A[col][c] /= pivot;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      if (factor === 0) continue;
      for (let c = col; c < 9; c++) {
        A[r][c] -= factor * A[col][c];
      }
    }
  }

  const a = A[0][8];
  const b = A[1][8];
  const c = A[2][8];
  const d = A[3][8];
  const e = A[4][8];
  const f = A[5][8];
  const g = A[6][8];
  const hh = A[7][8];

  // Column-major 4x4 CSS matrix3d
  return `matrix3d(${a.toFixed(6)},${d.toFixed(6)},0,${g.toFixed(8)},${b.toFixed(6)},${e.toFixed(6)},0,${hh.toFixed(8)},0,0,1,0,${c.toFixed(4)},${f.toFixed(4)},0,1)`;
}

function isAudioOnlyUrl(url: string): boolean {
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  return /\.(mp3|wav|ogg|aac|m4a|flac)$/.test(clean);
}

/**
 * Manages 3D spatial audio emitted from the 2 front stage speakers
 * (`PF_PA_Speaker (L Front)` & `PF_PA_Speaker (R Front)`) and renders
 * video onto `LED Screen Panel` in PlayCanvas Play Mode.
 *
 * Designed for online readiness:
 * - `mediaUrl`, `isPlaying`, `isScreenOn` represent syncable Stage State.
 * - `volume`, `isMuted` and HRTF 3D panning stay local per client.
 */
export class StageAudioManager {
  private readonly app: pc.Application;
  private readonly sceneRoot: pc.Entity;

  private screenEntity: pc.Entity | null = null;
  private originalScreenMat: pc.Material | null = null;
  private darkScreenMat: pc.StandardMaterial | null = null;
  private videoScreenMat: pc.StandardMaterial | null = null;
  private holeScreenMat: pc.ShaderMaterial | null = null;
  private videoTexture: pc.Texture | null = null;

  private leftSpeaker: pc.Entity | null = null;
  private rightSpeaker: pc.Entity | null = null;

  private videoEl: HTMLVideoElement | null = null;
  private videoReady = false;
  private videoHasFrames = false;

  private audioCtx: AudioContext | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private masterGain: GainNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private leftDirectGain: GainNode | null = null;
  private leftCrossGain: GainNode | null = null;
  private rightDirectGain: GainNode | null = null;
  private rightCrossGain: GainNode | null = null;
  private pannerLeft: PannerNode | null = null;
  private pannerRight: PannerNode | null = null;

  private state: StageMediaState = {
    sourceType: 'media',
    mediaUrl: '/media/bello-ballo.mp4',
    domVideoFallback: false,
    youtubeVideoId: null,
    youtubeQuality: 'hd720',
    title: 'Live Acoustic Session — Bello Ballo',
    isPlaying: true,
    isScreenOn: true,
    volume: 0.8,
    isMuted: false,
  };

  private destroyed = false;
  private pendingGestureResume = false;
  private pendingSeekSec: number | null = null;
  private lastYtTime = 0;
  private lastYtIsLive = false;
  private stageSyncTimer: number | null = null;
  private lastEmittedYtVolume = -1;
  private lastScreenProjectionSig = '';
  private lastUploadedVideoTime = -1;
  private cachedActiveCamera: pc.Entity | null = null;

  constructor(app: pc.Application, sceneRoot: pc.Entity) {
    this.app = app;
    this.sceneRoot = sceneRoot;
  }

  start(): void {
    this.leftSpeaker = this.findEntityByName('PF_PA_Speaker (L Front)');
    this.rightSpeaker = this.findEntityByName('PF_PA_Speaker (R Front)');
    this.screenEntity = this.findEntityByName('LED Screen Panel');

    // Only activate Cinema Main Stage audio/video pipeline in scenes containing LED Screen Panel
    if (!this.screenEntity) {
      this.dispatchProjectionIfChanged(false, '');
      return;
    }

    if (this.screenEntity?.render) {
      const mi = this.screenEntity.render.meshInstances[0];
      if (mi) {
        this.originalScreenMat = mi.material;
      }
    }

    this.darkScreenMat = new pc.StandardMaterial();
    this.darkScreenMat.diffuse = new pc.Color(0.03, 0.03, 0.04);
    this.darkScreenMat.emissive = new pc.Color(0.01, 0.01, 0.015);
    this.darkScreenMat.gloss = 0.1;
    this.darkScreenMat.update();

    // Transparent depth-writing punch-hole material so YouTube iframe behind <canvas>
    // shows through ONLY where no closer 3D object (like the player) occludes it.
    this.holeScreenMat = new pc.ShaderMaterial({
      uniqueName: 'StageScreenPunchHole',
      attributes: { aPosition: pc.SEMANTIC_POSITION },
      vertexGLSL: [
        'attribute vec3 aPosition;',
        'uniform mat4 matrix_model;',
        'uniform mat4 matrix_viewProjection;',
        'void main(void) {',
        '  gl_Position = matrix_viewProjection * matrix_model * vec4(aPosition, 1.0);',
        '}',
      ].join('\n'),
      fragmentGLSL: [
        'precision mediump float;',
        'void main(void) {',
        '  gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);',
        '}',
      ].join('\n'),
    });
    this.holeScreenMat.blendType = pc.BLEND_NONE;
    this.holeScreenMat.depthWrite = true;
    this.holeScreenMat.depthTest = true;
    this.holeScreenMat.cull = pc.CULLFACE_NONE;
    this.holeScreenMat.update();

    this.initMediaPipeline();
    window.addEventListener('pointerdown', this.onUserGesture, { passive: true });
    window.addEventListener('keydown', this.onUserGesture, { passive: true });
    window.addEventListener('focus', this.onUserGesture, { passive: true });
    document.addEventListener('visibilitychange', this.onUserGesture);
    window.addEventListener('cavannghe:youtube-time-update', this.onYoutubeTimeUpdate);

    const mp = MultiplayerManager.getInstance();
    const isGuestInRoom = mp.isConnected() && !mp.isHost() && !mp.isLocalAdmin();
    if (isGuestInRoom) {
      // Wait for Host's stage state before playing default local media from 00:00
      this.state.isPlaying = false;
    }

    this.applyMediaSource(this.state.mediaUrl);
    this.syncScreenVisual();

    mp.setOnRemoteStage((remote) => {
      this.applyRemoteState(remote);
    });

    mp.setOnRemoteStageLiveSync(() => {
      this.applyRemoteLiveSync();
    });

    mp.requestStageResync();

    this.stageSyncTimer = window.setInterval(() => {
      if (this.destroyed || !this.state.isPlaying || this.lastYtIsLive) return;
      if (this.canControlStage()) {
        this.broadcastIfHost(false);
      }
    }, 5000);
  }

  getState(): StageMediaState {
    return { ...this.state };
  }

  private canControlStage(): boolean {
    const mp = MultiplayerManager.getInstance();
    return !mp.isConnected() || mp.isHost() || mp.isLocalAdmin();
  }

  setMedia(url: string, title?: string): void {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!this.canControlStage()) return;
    this.state.sourceType = 'media';
    this.state.domVideoFallback = false;
    this.state.youtubeVideoId = null;
    this.state.mediaUrl = trimmed;
    if (title) this.state.title = title;
    this.state.isPlaying = true;
    this.state.isScreenOn = true;
    this.pendingSeekSec = null;
    this.lastYtTime = 0;
    this.lastYtIsLive = false;
    this.lastEmittedYtVolume = -1;
    this.ensureAudioGraph();
    this.applyMediaSource(trimmed);
    this.syncScreenVisual();
    this.syncGain();
    this.emitStateChanged();
    this.broadcastIfHost();
  }

  setYouTube(videoId: string, title?: string): void {
    const id = videoId.trim();
    if (!id) return;
    if (!this.canControlStage()) return;
    this.state.sourceType = 'youtube';
    this.state.domVideoFallback = false;
    this.state.youtubeVideoId = id;
    this.state.title = title || `YouTube (${id})`;
    this.state.isPlaying = true;
    this.state.isScreenOn = true;
    this.pendingSeekSec = null;
    this.lastYtTime = 0;
    this.lastYtIsLive = false;
    this.state.currentTime = 0;
    this.state.timeUpdatedAt = Date.now();
    if (this.videoEl) {
      this.videoEl.pause();
    }
    this.videoHasFrames = false;
    this.lastEmittedYtVolume = -1;
    this.syncScreenVisual();
    this.syncGain();
    this.emitStateChanged();
    this.broadcastIfHost();
  }

  setYouTubeQuality(quality: string): void {
    this.state.youtubeQuality = quality;
    this.emitStateChanged();
  }

  setPlaying(playing: boolean): void {
    if (!this.canControlStage()) return;
    this.state.isPlaying = playing;
    if (this.state.sourceType === 'media') {
      this.ensureAudioGraph();
      if (this.videoEl) {
        if (playing) {
          void this.tryPlayVideo();
        } else {
          this.videoEl.pause();
        }
      }
    }
    this.syncGain();
    this.emitStateChanged();
    this.broadcastIfHost();
  }

  setVolume(volume: number): void {
    this.state.volume = Math.max(0, Math.min(1, volume));
    if (this.state.volume > 0 && this.state.isMuted) {
      this.state.isMuted = false;
    }
    this.ensureAudioGraph();
    this.syncGain();
    this.emitStateChanged();
  }

  setMuted(muted: boolean): void {
    this.state.isMuted = muted;
    this.ensureAudioGraph();
    this.syncGain();
    this.emitStateChanged();
    if (this.canControlStage()) {
      this.broadcastIfHost();
    }
  }

  setScreenOn(on: boolean): void {
    if (!this.canControlStage()) return;
    this.state.isScreenOn = on;
    this.syncScreenVisual();
    this.syncGain();
    this.emitStateChanged();
    this.broadcastIfHost();
  }

  /** Host-only: seek local stream to live edge and notify all connected clients to update. */
  syncToLiveEdge(): void {
    if (!this.canControlStage()) return;
    if (this.state.sourceType === 'media' && this.state.mediaUrl.startsWith('blob:')) return;
    this.seekLocalToLiveEdge();
    MultiplayerManager.getInstance().broadcastStageLiveSync();
  }

  applyRemoteLiveSync(): void {
    if (this.destroyed) return;
    this.seekLocalToLiveEdge();
  }

  private seekLocalToLiveEdge(): void {
    if (this.state.sourceType === 'media' && !this.state.domVideoFallback && this.videoEl) {
      const v = this.videoEl;
      // Only seek to seekable.end for live streams (non-finite duration) to avoid jumping VODs to the end
      if (!Number.isFinite(v.duration) && v.seekable && v.seekable.length > 0) {
        const liveEnd = v.seekable.end(v.seekable.length - 1);
        if (Number.isFinite(liveEnd) && liveEnd > 0) {
          v.currentTime = liveEnd;
        }
      }
      if (this.state.isPlaying) {
        void this.tryPlayVideo();
      }
    }
    window.dispatchEvent(new CustomEvent('cavannghe:stage-sync-live'));
  }

  applyRemoteState(remote: NetworkStageState): void {
    if (this.destroyed) return;
    const mediaChanged =
      remote.sourceType !== this.state.sourceType ||
      remote.mediaUrl !== this.state.mediaUrl ||
      remote.youtubeVideoId !== this.state.youtubeVideoId;

    const expectedSec =
      typeof remote.currentTime === 'number' && !remote.isLive
        ? Math.max(
            0,
            remote.currentTime +
              (remote.isPlaying ? Math.max(0, (Date.now() - remote.updatedAt) / 1000) : 0)
          )
        : null;

    this.state.sourceType = remote.sourceType;
    this.state.mediaUrl = remote.mediaUrl;
    this.state.youtubeVideoId = remote.youtubeVideoId;
    this.state.title = remote.title;
    this.state.isPlaying = remote.isPlaying;
    this.state.isScreenOn = remote.isScreenOn;
    if (expectedSec !== null) {
      this.state.currentTime = expectedSec;
      this.state.timeUpdatedAt = Date.now();
    }
    if (typeof remote.isMuted === 'boolean') {
      this.state.isMuted = remote.isMuted;
    }

    if (remote.sourceType === 'youtube') {
      this.state.domVideoFallback = false;
      this.pendingSeekSec = null;
      this.videoEl?.pause();
      this.videoHasFrames = false;
      this.lastEmittedYtVolume = -1;
    } else if (mediaChanged) {
      this.state.domVideoFallback = false;
      this.pendingSeekSec = expectedSec;
      this.ensureAudioGraph();
      this.applyMediaSource(remote.mediaUrl);
    } else if (this.videoEl) {
      if (
        !this.state.domVideoFallback &&
        expectedSec !== null &&
        Number.isFinite(this.videoEl.duration) &&
        this.videoEl.duration > 1 &&
        (!remote.isPlaying || Math.abs(this.videoEl.currentTime - expectedSec) > 1.5)
      ) {
        this.videoEl.currentTime = Math.min(this.videoEl.duration - 0.5, expectedSec);
      }
      if (!this.state.domVideoFallback) {
        if (remote.isPlaying) void this.tryPlayVideo();
        else this.videoEl.pause();
      }
    }

    this.syncScreenVisual();
    this.syncGain();
    this.emitStateChanged();

    if (expectedSec !== null && (remote.sourceType === 'youtube' || this.state.domVideoFallback)) {
      window.dispatchEvent(
        new CustomEvent('cavannghe:stage-seek-time', {
          detail: { targetSec: expectedSec, isPlaying: remote.isPlaying },
        })
      );
    }
  }

  private broadcastIfHost(updatePresence = true): void {
    const mp = MultiplayerManager.getInstance();
    if (!mp.isConnected() || (!mp.isHost() && !mp.isLocalAdmin())) return;
    const currentTime =
      this.state.sourceType === 'media'
        ? this.videoEl && Number.isFinite(this.videoEl.duration)
          ? this.videoEl.currentTime
          : undefined
        : !this.lastYtIsLive
          ? this.lastYtTime
          : undefined;

    mp.broadcastStageState(
      {
        sourceType: this.state.sourceType,
        mediaUrl: this.state.mediaUrl,
        youtubeVideoId: this.state.youtubeVideoId,
        title: this.state.title,
        isPlaying: this.state.isPlaying,
        isScreenOn: this.state.isScreenOn,
        isMuted: this.state.isMuted,
        currentTime,
        isLive: this.state.sourceType === 'youtube' ? this.lastYtIsLive : false,
        updatedAt: Date.now(),
      },
      { updatePresence }
    );
  }

  update(): void {
    if (this.destroyed) return;

    // Upload current video frame to LED Screen Panel texture only when playing or frame time changed
    if (
      this.state.sourceType === 'media' &&
      !this.state.domVideoFallback &&
      this.state.isScreenOn &&
      this.videoReady &&
      this.videoHasFrames &&
      this.videoEl &&
      this.videoTexture &&
      this.videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      const curTime = this.videoEl.currentTime;
      if (!this.videoEl.paused || curTime !== this.lastUploadedVideoTime) {
        this.lastUploadedVideoTime = curTime;
        this.videoTexture.setSource(this.videoEl);
      }
    }

    const cam = this.findActiveCamera();

    // Update YouTube / DOM-fallback distance-based volume & 3D stage screen projection
    if (this.state.sourceType === 'youtube' || this.state.domVideoFallback) {
      this.emitScreenProjection(cam);
      const targetVol = this.computeYouTubeSpatialVolume(cam);
      if (targetVol !== this.lastEmittedYtVolume) {
        this.lastEmittedYtVolume = targetVol;
        window.dispatchEvent(
          new CustomEvent<number>('cavannghe:youtube-volume', { detail: targetVol })
        );
      }
    }

    // Update 3D AudioListener from active camera and PannerNodes from 2 front speakers
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;

    if (cam) {
      const pos = cam.getPosition();
      const fwd = cam.forward;
      const up = cam.up;
      const listener = this.audioCtx.listener;
      if (listener.positionX) {
        listener.positionX.value = pos.x;
        listener.positionY.value = pos.y;
        listener.positionZ.value = pos.z;
        listener.forwardX.value = fwd.x;
        listener.forwardY.value = fwd.y;
        listener.forwardZ.value = fwd.z;
        listener.upX.value = up.x;
        listener.upY.value = up.y;
        listener.upZ.value = up.z;
      }
    }

    this.updateSpeakerPannerPositions();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    MultiplayerManager.getInstance().setOnRemoteStage(null);
    MultiplayerManager.getInstance().setOnRemoteStageLiveSync(null);
    if (this.stageSyncTimer !== null) {
      window.clearInterval(this.stageSyncTimer);
      this.stageSyncTimer = null;
    }

    window.removeEventListener('pointerdown', this.onUserGesture);
    window.removeEventListener('keydown', this.onUserGesture);
    window.removeEventListener('focus', this.onUserGesture);
    document.removeEventListener('visibilitychange', this.onUserGesture);
    window.removeEventListener('cavannghe:youtube-time-update', this.onYoutubeTimeUpdate);

    if (this.screenEntity?.render && this.originalScreenMat) {
      for (const mi of this.screenEntity.render.meshInstances) {
        mi.material = this.originalScreenMat;
      }
    }

    if (this.videoEl) {
      this.videoEl.removeEventListener('canplay', this.onVideoCanPlay);
      this.videoEl.removeEventListener('loadeddata', this.onVideoLoadedData);
      this.videoEl.removeEventListener('error', this.onVideoError);
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
      this.videoEl = null;
    }

    try {
      this.mediaSource?.disconnect();
      this.masterGain?.disconnect();
      this.splitterNode?.disconnect();
      this.leftDirectGain?.disconnect();
      this.leftCrossGain?.disconnect();
      this.rightDirectGain?.disconnect();
      this.rightCrossGain?.disconnect();
      this.pannerLeft?.disconnect();
      this.pannerRight?.disconnect();
    } catch {
      // ignore
    }

    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.videoScreenMat?.destroy();
    this.videoScreenMat = null;
    this.darkScreenMat?.destroy();
    this.darkScreenMat = null;
    this.holeScreenMat?.destroy();
    this.holeScreenMat = null;
    this.videoTexture?.destroy();
    this.videoTexture = null;

    this.state = {
      sourceType: 'media',
      mediaUrl: '',
      domVideoFallback: false,
      youtubeVideoId: null,
      youtubeQuality: 'hd720',
      title: '',
      isPlaying: false,
      isScreenOn: false,
      volume: this.state.volume,
      isMuted: this.state.isMuted,
    };
    this.dispatchProjectionIfChanged(false, '');
    this.emitStateChanged();
  }

  private initMediaPipeline(): void {
    const video = document.createElement('video');
    video.loop = true;
    video.playsInline = true;
    video.muted = false; // Audio is routed through Web Audio PannerNodes
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.addEventListener('canplay', this.onVideoCanPlay);
    video.addEventListener('loadeddata', this.onVideoLoadedData);
    video.addEventListener('error', this.onVideoError);
    this.videoEl = video;

    this.videoTexture = new pc.Texture(this.app.graphicsDevice, {
      width: 512,
      height: 512,
      format: pc.PIXELFORMAT_RGBA8,
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    });

    this.videoScreenMat = new pc.StandardMaterial();
    this.videoScreenMat.diffuse = new pc.Color(0.03, 0.04, 0.06);
    this.videoScreenMat.emissive = new pc.Color(1, 1, 1);
    this.videoScreenMat.emissiveIntensity = 1.2;
    this.videoScreenMat.useLighting = false;
    this.videoScreenMat.emissiveMap = this.videoTexture;
    this.videoScreenMat.update();
  }

  private ensureAudioGraph(): void {
    if (this.audioCtx || !this.videoEl) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(this.videoEl);
    const masterGain = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);

    // True dual-speaker stereo separation with natural 15% PA crossfeed
    const leftDirect = ctx.createGain();
    leftDirect.gain.value = 0.85;
    const leftCross = ctx.createGain();
    leftCross.gain.value = 0.15;

    const rightDirect = ctx.createGain();
    rightDirect.gain.value = 0.85;
    const rightCross = ctx.createGain();
    rightCross.gain.value = 0.15;

    const createSpeakerPanner = (pos: pc.Vec3): PannerNode => {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 4.0;
      p.maxDistance = 36.0;
      p.rolloffFactor = 1.15;
      p.coneInnerAngle = 110;
      p.coneOuterAngle = 220;
      p.coneOuterGain = 0.45;
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
      p.orientationX.value = 0;
      p.orientationY.value = 0;
      p.orientationZ.value = 1; // Facing into the lounge (+Z)
      return p;
    };

    const pannerL = createSpeakerPanner(DEFAULT_LEFT_SPEAKER_POS);
    const pannerR = createSpeakerPanner(DEFAULT_RIGHT_SPEAKER_POS);

    source.connect(masterGain);
    masterGain.connect(splitter);

    // Channel 0 (Left) -> L speaker (85%) + R speaker (15%)
    splitter.connect(leftDirect, 0);
    leftDirect.connect(pannerL);
    splitter.connect(rightCross, 0);
    rightCross.connect(pannerR);

    // Channel 1 (Right) -> R speaker (85%) + L speaker (15%)
    splitter.connect(rightDirect, 1);
    rightDirect.connect(pannerR);
    splitter.connect(leftCross, 1);
    leftCross.connect(pannerL);

    pannerL.connect(ctx.destination);
    pannerR.connect(ctx.destination);

    this.audioCtx = ctx;
    this.mediaSource = source;
    this.masterGain = masterGain;
    this.splitterNode = splitter;
    this.leftDirectGain = leftDirect;
    this.leftCrossGain = leftCross;
    this.rightDirectGain = rightDirect;
    this.rightCrossGain = rightCross;
    this.pannerLeft = pannerL;
    this.pannerRight = pannerR;

    this.updateSpeakerPannerPositions();
    this.syncGain();
  }

  private applyMediaSource(url: string): void {
    if (!this.videoEl) return;
    this.videoReady = false;
    this.videoHasFrames = false;

    if (url.startsWith('blob:') || url.startsWith('data:')) {
      this.videoEl.removeAttribute('crossorigin');
    } else {
      this.videoEl.crossOrigin = 'anonymous';
    }

    this.videoEl.src = url;
    this.videoEl.load();

    if (this.state.isPlaying) {
      void this.tryPlayVideo();
    }
  }

  private onVideoLoadedData = (): void => {
    if (!this.videoEl || this.destroyed) return;
    this.videoHasFrames =
      !isAudioOnlyUrl(this.state.mediaUrl) &&
      this.videoEl.videoWidth > 0 &&
      this.videoEl.videoHeight > 0;
    this.syncScreenVisual();
  };

  private onVideoCanPlay = (): void => {
    if (this.destroyed) return;
    this.videoReady = true;
    if (
      this.pendingSeekSec !== null &&
      this.videoEl &&
      Number.isFinite(this.videoEl.duration) &&
      this.videoEl.duration > 1
    ) {
      this.videoEl.currentTime = Math.min(this.videoEl.duration - 0.5, this.pendingSeekSec);
      this.pendingSeekSec = null;
    }
    if (this.state.isPlaying && !this.state.domVideoFallback) {
      void this.tryPlayVideo();
    }
  };

  private onYoutubeTimeUpdate = (e: Event): void => {
    const detail = (e as CustomEvent<{ currentTime?: number; isLive?: boolean }>).detail;
    if (!detail) return;
    if (typeof detail.currentTime === 'number' && Number.isFinite(detail.currentTime)) {
      this.lastYtTime = detail.currentTime;
    }
    if (typeof detail.isLive === 'boolean') {
      this.lastYtIsLive = detail.isLive;
    }
  };

  private onVideoError = (): void => {
    if (this.destroyed || this.state.sourceType !== 'media') return;
    const url = this.state.mediaUrl;
    if (!url) return;

    const isExternalHttp = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
    if (!this.state.domVideoFallback && isExternalHttp && !isAudioOnlyUrl(url)) {
      // External video server likely lacks CORS headers for WebGL texImage2D;
      // fall back to punch-hole DOM <video> behind the transparent canvas.
      this.state.domVideoFallback = true;
      this.videoReady = false;
      this.videoHasFrames = false;
      if (this.videoEl) {
        this.videoEl.pause();
        this.videoEl.removeAttribute('src');
        this.videoEl.load();
      }
      this.lastEmittedYtVolume = -1;
      this.syncScreenVisual();
      this.syncGain();
      this.emitStateChanged();
      return;
    }

    window.dispatchEvent(
      new CustomEvent<string>('cavannghe:stage-media-error', {
        detail:
          'Không thể phát video/audio từ link này. Vui lòng kiểm tra lại đường dẫn trực tiếp (.mp4/.webm/.mp3) hoặc dùng link YouTube.',
      })
    );
  };

  private async tryPlayVideo(): Promise<void> {
    if (!this.videoEl || this.destroyed) return;
    try {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      await this.videoEl.play();
      this.pendingGestureResume = false;
    } catch {
      this.pendingGestureResume = true;
    }
  }

  private onUserGesture = (): void => {
    if (this.destroyed) return;
    this.ensureAudioGraph();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    if (this.state.isPlaying && (this.pendingGestureResume || this.videoEl?.paused)) {
      void this.tryPlayVideo();
    }
  };

  private dispatchProjectionIfChanged(visible: boolean, matrix3d: string, tooSmall = false): void {
    const sig = visible && matrix3d ? `${matrix3d}|${tooSmall ? '1' : '0'}` : 'hidden';
    if (sig === this.lastScreenProjectionSig) return;
    this.lastScreenProjectionSig = sig;
    window.dispatchEvent(
      new CustomEvent<ScreenProjectionData>('cavannghe:screen-projection', {
        detail: { visible, matrix3d, tooSmall },
      })
    );
  }

  private emitScreenProjection(cam: pc.Entity | null): void {
    if (!this.state.isScreenOn || !this.screenEntity || !cam?.camera) {
      this.dispatchProjectionIfChanged(false, '');
      return;
    }

    const camPos = cam.getPosition();
    _screenPos.copy(this.screenEntity.getPosition());
    // Screen faces +Z; hide if camera is behind the LED wall
    if (camPos.z <= _screenPos.z) {
      this.dispatchProjectionIfChanged(false, '');
      return;
    }

    const wt = this.screenEntity.getWorldTransform();
    wt.transformPoint(_c0.set(-0.5, 0.5, 0.52), _c0);
    wt.transformPoint(_c1.set(0.5, 0.5, 0.52), _c1);
    wt.transformPoint(_c2.set(-0.5, -0.5, 0.52), _c2);
    wt.transformPoint(_c3.set(0.5, -0.5, 0.52), _c3);

    cam.camera.worldToScreen(_c0, _s0);
    cam.camera.worldToScreen(_c1, _s1);
    cam.camera.worldToScreen(_c2, _s2);
    cam.camera.worldToScreen(_c3, _s3);

    if (_s0.z <= 0.1 || _s1.z <= 0.1 || _s2.z <= 0.1 || _s3.z <= 0.1) {
      this.dispatchProjectionIfChanged(false, '');
      return;
    }

    const matrix3d = solveHomographyMatrix3d(
      YT_STAGE_WIDTH,
      YT_STAGE_HEIGHT,
      _s0.x,
      _s0.y,
      _s1.x,
      _s1.y,
      _s2.x,
      _s2.y,
      _s3.x,
      _s3.y
    );

    const projW = Math.min(
      Math.hypot(_s1.x - _s0.x, _s1.y - _s0.y),
      Math.hypot(_s3.x - _s2.x, _s3.y - _s2.y)
    );
    const projH = Math.min(
      Math.hypot(_s2.x - _s0.x, _s2.y - _s0.y),
      Math.hypot(_s3.x - _s1.x, _s3.y - _s1.y)
    );
    const tooSmall = projW < 200 || projH < 200;

    this.dispatchProjectionIfChanged(Boolean(matrix3d), matrix3d ?? '', tooSmall);
  }

  private computeYouTubeSpatialVolume(cam: pc.Entity | null): number {
    if (!this.state.isPlaying || !this.state.isScreenOn || this.state.isMuted) {
      return 0;
    }
    if (!cam) {
      return Math.round(this.state.volume * 100);
    }
    const camPos = cam.getPosition();
    const lPos = this.leftSpeaker ? this.leftSpeaker.getPosition() : DEFAULT_LEFT_SPEAKER_POS;
    const rPos = this.rightSpeaker ? this.rightSpeaker.getPosition() : DEFAULT_RIGHT_SPEAKER_POS;

    const refDistance = 4.0;
    const maxDistance = 36.0;
    const rolloff = 1.15;

    const speakerAtten = (spkPos: pc.Vec3): number => {
      const d = camPos.distance(spkPos);
      if (d >= maxDistance) return 0;
      const distGain = refDistance / (refDistance + rolloff * Math.max(0, d - refDistance));
      // Directional cone: speakers face +Z into the lounge
      const dz = camPos.z - spkPos.z;
      const coneGain = dz >= 0 ? 1.0 : Math.max(0.45, 1.0 + dz * 0.1);
      return distGain * coneGain;
    };

    // Dual-speaker combined acoustic energy
    const attenL = speakerAtten(lPos);
    const attenR = speakerAtten(rPos);
    const combined = Math.min(1, (attenL + attenR) * 0.58);
    return Math.max(0, Math.min(100, Math.round(this.state.volume * combined * 100)));
  }

  private syncGain(): void {
    if (!this.masterGain || !this.audioCtx) return;
    const active =
      this.state.sourceType === 'media' &&
      !this.state.domVideoFallback &&
      this.state.isPlaying &&
      this.state.isScreenOn &&
      !this.state.isMuted;
    // Scale by 0.72 because two PannerNodes sum at the listener
    const target = active ? this.state.volume * 0.72 : 0;
    this.masterGain.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.04);
  }

  private syncScreenVisual(): void {
    if (!this.screenEntity?.render) return;
    let targetMat: pc.Material | null = this.originalScreenMat;

    if (!this.state.isScreenOn) {
      targetMat = this.darkScreenMat;
    } else if ((this.state.sourceType === 'youtube' || this.state.domVideoFallback) && this.holeScreenMat) {
      targetMat = this.holeScreenMat;
    } else if (this.state.sourceType === 'media' && this.videoHasFrames && this.videoScreenMat) {
      targetMat = this.videoScreenMat;
    }

    if (!targetMat) return;
    for (const mi of this.screenEntity.render.meshInstances) {
      mi.material = targetMat;
    }
  }

  private updateSpeakerPannerPositions(): void {
    if (this.pannerLeft) {
      const p = this.leftSpeaker ? this.leftSpeaker.getPosition() : DEFAULT_LEFT_SPEAKER_POS;
      const y = this.leftSpeaker ? p.y + SPEAKER_EMIT_Y_OFFSET : p.y;
      this.pannerLeft.positionX.value = p.x;
      this.pannerLeft.positionY.value = y;
      this.pannerLeft.positionZ.value = p.z;
    }
    if (this.pannerRight) {
      const p = this.rightSpeaker ? this.rightSpeaker.getPosition() : DEFAULT_RIGHT_SPEAKER_POS;
      const y = this.rightSpeaker ? p.y + SPEAKER_EMIT_Y_OFFSET : p.y;
      this.pannerRight.positionX.value = p.x;
      this.pannerRight.positionY.value = y;
      this.pannerRight.positionZ.value = p.z;
    }
  }

  private findActiveCamera(): pc.Entity | null {
    const cached = this.cachedActiveCamera;
    if (cached && cached.parent && cached.enabled && cached.camera?.enabled) {
      return cached;
    }
    let fallback: pc.Entity | null = null;
    const walk = (node: pc.Entity): pc.Entity | null => {
      if (node.camera && node.enabled) {
        if (node.name === 'Main Camera' || node.name === 'Player Camera') return node;
        if (!fallback) fallback = node;
      }
      for (const child of node.children) {
        if (child instanceof pc.Entity) {
          const found = walk(child);
          if (found) return found;
        }
      }
      return null;
    };
    const resolved = walk(this.sceneRoot) ?? fallback;
    this.cachedActiveCamera = resolved;
    return resolved;
  }

  private findEntityByName(name: string): pc.Entity | null {
    const walk = (node: pc.Entity): pc.Entity | null => {
      if (node.name === name) return node;
      for (const child of node.children) {
        if (child instanceof pc.Entity) {
          const found = walk(child);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(this.sceneRoot);
  }

  private emitStateChanged(): void {
    window.dispatchEvent(
      new CustomEvent<StageMediaState>('cavannghe:stage-audio-changed', {
        detail: this.getState(),
      })
    );
  }
}
