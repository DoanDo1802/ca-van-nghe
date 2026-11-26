import { DebugLogger } from '../utils/debugLogger';

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const credentialUrl = import.meta.env.VITE_VOICE_TURN_CREDENTIAL_URL?.trim();
let cachedServers: RTCIceServer[] = [];
let refreshAt = 0;
let pendingRefresh: Promise<void> | null = null;

function isTurnServer(server: unknown): server is RTCIceServer {
  if (!server || typeof server !== 'object') return false;
  const { urls, username, credential } = server as RTCIceServer;
  const values = Array.isArray(urls) ? urls : [urls];
  return values.length > 0 &&
    values.every((url) => typeof url === 'string' && /^turns?:\S+$/i.test(url)) &&
    typeof username === 'string' && Boolean(username) &&
    typeof credential === 'string' && Boolean(credential);
}

function isValidIceServer(server: unknown): server is RTCIceServer {
  if (!server || typeof server !== 'object') return false;
  const { urls } = server as RTCIceServer;
  const values = Array.isArray(urls) ? urls : [urls];
  if (values.length === 0) return false;
  if (values.every((url) => typeof url === 'string' && /^stuns?:\S+$/i.test(url))) {
    return true;
  }
  return isTurnServer(server);
}

async function refreshTurnServers(url: string): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('TURN credential request failed');
    const { iceServers, expiresAt } = await response.json();
    if (!Array.isArray(iceServers) || !iceServers.length ||
        !iceServers.every(isValidIceServer) || !iceServers.some(isTurnServer) ||
        !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 30_000) {
      throw new Error('Invalid TURN credential response');
    }
    cachedServers = iceServers;
    refreshAt = expiresAt - 30_000;
  } catch {
    cachedServers = [];
    refreshAt = Date.now() + 15_000;
    DebugLogger.warn('VoiceICE', 'Unable to load TURN credentials. Using STUN.');
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getVoiceRtcConfig(): Promise<RTCConfiguration> {
  if (credentialUrl && Date.now() >= refreshAt) {
    pendingRefresh ??= refreshTurnServers(credentialUrl).finally(() => { pendingRefresh = null; });
    await pendingRefresh;
  }
  return { iceServers: [...STUN_SERVERS, ...cachedServers] };
}

// Trickle ICE can arrive while TURN credentials or the remote SDP are still pending.
const pendingCandidates = new WeakMap<RTCPeerConnection, RTCIceCandidateInit[]>();

export async function addRemoteIceCandidate(
  peer: RTCPeerConnection,
  candidate: RTCIceCandidateInit,
  isReplay = false
): Promise<void> {
  const queueCandidate = () => {
    const pending = pendingCandidates.get(peer) ?? [];
    if (pending.length < 64) pending.push(candidate);
    pendingCandidates.set(peer, pending);
  };

  if (!peer.remoteDescription || peer.signalingState === 'have-local-offer') {
    queueCandidate();
    return;
  }
  try {
    await peer.addIceCandidate(candidate);
  } catch {
    if (!isReplay) queueCandidate();
  }
}

export async function setVoiceRemoteDescription(
  peer: RTCPeerConnection,
  description: RTCSessionDescriptionInit
): Promise<void> {
  await peer.setRemoteDescription(description);
  const pending = pendingCandidates.get(peer) ?? [];
  pendingCandidates.delete(peer);
  for (const candidate of pending) {
    await addRemoteIceCandidate(peer, candidate, true);
  }
}
