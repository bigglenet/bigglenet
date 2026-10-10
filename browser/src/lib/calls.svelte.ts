// Voice and video calls. Everyone in a call connects straight to everyone else (WebRTC); the
// server keeps track of who's in each call and passes connection details between them.
//
// Who starts each connection: someone joining connects to everyone already in the call. If two
// people's offers cross, the one whose username sorts first wins.
import { account } from './account.svelte';
import { api, errorText } from './api';
import { chats, type CallMember } from './chats.svelte';
import { SERVER } from './config';
import { social } from './social.svelte';

const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
// Everyone sends to everyone, so keep video modest.
const VIDEO: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 }, facingMode: 'user' };
/** Tell the server we're still here this often. It drops people after 45 seconds. */
const PING_MS = 15_000;
const RING_MS = 45_000;
/** Give up on a call nobody answers. */
const NO_ANSWER_MS = 45_000;
/** If nobody's connected to someone after this long, connect to them ourselves. */
const FALLBACK_MS = 3_000;

type Signal =
  | { t: 'offer' | 'answer'; sdp: string }
  | { t: 'ice'; c: RTCIceCandidateInit[] }
  | { t: 'state'; audio: boolean; video: boolean };

export type Remote = {
  username: string;
  stream: MediaStream | null;
  audio: boolean;
  video: boolean;
  state: 'connecting' | 'connected' | 'lost';
  speaking: boolean;
};

type Peer = {
  pc: RTCPeerConnection;
  offerer: boolean;
  createdAt: number;
  /** Their connection details that arrived before their offer or answer. */
  early: RTCIceCandidateInit[];
  /** Ours, waiting to go out together. */
  outbox: RTCIceCandidateInit[];
  /** Our offer or answer has gone, so our connection details can follow. */
  ready: boolean;
  flush?: ReturnType<typeof setTimeout>;
  meter?: Meter;
};

const me = () => account.user?.username ?? '';

class Calls {
  /** The chat whose call we're in. */
  chatId = $state<number | null>(null);
  joinedAt = $state(0);
  micOn = $state(false);
  cameraOn = $state(false);
  /** Our own camera, to show ourselves. */
  preview = $state.raw<MediaStream | null>(null);
  remotes = $state<Remote[]>([]);
  speaking = $state(false);
  /** Someone calling us. */
  ringing = $state<{ chatId: number; from: string; video: boolean } | null>(null);
  /** A short note: "Ben declined", "No answer", "Couldn't use your camera". */
  notice = $state('');
  /** The call window is big. */
  expanded = $state(false);

  private mic: MediaStreamTrack | null = null;
  private camera: MediaStreamTrack | null = null;
  private peers = new Map<string, Peer>();
  /** Connection details from someone we have no connection with yet. */
  private orphans = new Map<string, RTCIceCandidateInit[]>();
  /** The server has us in the call. */
  private live = false;
  private hadCompany = false;
  private rejoining = false;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private noAnswerTimer: ReturnType<typeof setTimeout> | undefined;
  private ringTimer: ReturnType<typeof setTimeout> | undefined;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private fallbacks = new Map<string, ReturnType<typeof setTimeout>>();
  private ringtone = new Ringtone();
  private myMeter: Meter | undefined;
  private meterTimer: ReturnType<typeof setInterval> | undefined;

  get chat() {
    return chats.get(this.chatId);
  }

  /** Whether calls can work here at all. */
  get supported() {
    return typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  say(text: string) {
    this.notice = text;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = ''), 6000);
  }

  // --- Joining and leaving ---

  /** Start or join the call in a chat. */
  async join(chatId: number, video: boolean) {
    if (this.chatId === chatId) return;
    if (!this.supported) return this.say("Calls don't work in this browser.");
    if (this.chatId !== null) await this.leave();
    if (this.ringing?.chatId === chatId) this.stopRinging();
    this.chatId = chatId;
    this.joinedAt = Date.now();
    this.remotes = [];
    this.hadCompany = false;
    this.expanded = video;
    await this.getMedia(video);
    if (this.chatId !== chatId) return;
    try {
      const { members } = await api<{ members: string[] }>('POST', `/api/chats/${chatId}/call`, { action: 'join', video: this.cameraOn });
      if (this.chatId !== chatId) return;
      this.live = true;
      for (const name of members) this.offer(name);
    } catch (e) {
      if (this.chatId === chatId) this.cleanup();
      return this.say(errorText(e));
    }
    this.pingTimer = setInterval(() => this.ping(), PING_MS);
    this.meterTimer = setInterval(() => this.measure(), 150);
    addEventListener('pagehide', this.onPageHide);
    this.checkCompany();
  }

  async leave(notice?: string) {
    const chatId = this.chatId;
    if (chatId === null) return;
    this.cleanup();
    if (notice) this.say(notice);
    await api('POST', `/api/chats/${chatId}/call`, { action: 'leave' }).catch(() => {});
  }

  private cleanup() {
    clearInterval(this.pingTimer);
    clearInterval(this.meterTimer);
    clearTimeout(this.noAnswerTimer);
    for (const t of this.fallbacks.values()) clearTimeout(t);
    this.fallbacks.clear();
    for (const name of [...this.peers.keys()]) this.drop(name);
    this.orphans.clear();
    this.mic?.stop();
    this.camera?.stop();
    this.mic = this.camera = null;
    this.myMeter?.close();
    this.myMeter = undefined;
    this.preview = null;
    this.micOn = this.cameraOn = this.speaking = false;
    this.remotes = [];
    this.chatId = null;
    this.live = false;
    this.expanded = false;
    removeEventListener('pagehide', this.onPageHide);
  }

  // Closing the window: say goodbye without waiting for an answer.
  private onPageHide = () => {
    if (this.chatId === null || !account.token) return;
    fetch(`${SERVER}/api/chats/${this.chatId}/call`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
      body: JSON.stringify({ action: 'leave' }),
    }).catch(() => {});
  };

  private async ping() {
    const chatId = this.chatId;
    if (chatId === null) return;
    try {
      const { members } = await api<{ members: CallMember[] }>('POST', `/api/chats/${chatId}/call`, { action: 'ping' });
      if (this.chatId === chatId) this.onCall(chatId, members);
    } catch {}
  }

  private async getMedia(video: boolean) {
    const media = navigator.mediaDevices;
    try {
      const stream = await media.getUserMedia({ audio: AUDIO, video: video ? VIDEO : false });
      this.mic = stream.getAudioTracks()[0] ?? null;
      this.camera = stream.getVideoTracks()[0] ?? null;
    } catch {
      if (video) {
        try {
          this.mic = (await media.getUserMedia({ audio: AUDIO })).getAudioTracks()[0] ?? null;
          this.say("Couldn't use your camera, so you're on voice only.");
        } catch {}
      }
      if (!this.mic) this.say("Couldn't use your microphone. Others won't hear you.");
    }
    this.micOn = !!this.mic;
    this.cameraOn = !!this.camera;
    this.preview = this.camera ? new MediaStream([this.camera]) : null;
    if (this.mic) this.myMeter = Meter.for(new MediaStream([this.mic]));
  }

  // --- Mic and camera ---

  async toggleMic() {
    if (this.mic) {
      this.mic.enabled = !this.mic.enabled;
      this.micOn = this.mic.enabled;
    } else {
      try {
        this.mic = (await navigator.mediaDevices.getUserMedia({ audio: AUDIO })).getAudioTracks()[0];
      } catch {
        return this.say("Couldn't use your microphone.");
      }
      if (this.chatId === null) return this.mic.stop();
      this.micOn = true;
      this.myMeter = Meter.for(new MediaStream([this.mic]));
      for (const p of this.peers.values()) sender(p.pc, 'audio')?.replaceTrack(this.mic);
    }
    this.shareState();
  }

  async toggleCamera() {
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
      this.preview = null;
      this.cameraOn = false;
      for (const p of this.peers.values()) sender(p.pc, 'video')?.replaceTrack(null);
    } else {
      try {
        this.camera = (await navigator.mediaDevices.getUserMedia({ video: VIDEO })).getVideoTracks()[0];
      } catch {
        return this.say("Couldn't use your camera.");
      }
      if (this.chatId === null) return this.camera.stop();
      this.preview = new MediaStream([this.camera]);
      this.cameraOn = true;
      for (const p of this.peers.values()) sender(p.pc, 'video')?.replaceTrack(this.camera);
    }
    this.shareState();
  }

  private shareState(to?: string) {
    const data: Signal = { t: 'state', audio: this.micOn, video: this.cameraOn };
    for (const name of to ? [to] : this.peers.keys()) this.signal(name, data);
  }

  // --- Ringing ---

  accept() {
    const r = this.ringing;
    if (r) this.join(r.chatId, r.video);
  }

  decline() {
    const r = this.ringing;
    if (!r) return;
    this.stopRinging();
    api('POST', `/api/chats/${r.chatId}/call`, { action: 'decline' }).catch(() => {});
  }

  private ring(chatId: number, from: string, video: boolean) {
    this.ringing = { chatId, from, video };
    this.ringtone.start();
    clearTimeout(this.ringTimer);
    this.ringTimer = setTimeout(() => this.stopRinging(), RING_MS);
  }

  private stopRinging() {
    this.ringing = null;
    this.ringtone.stop();
    clearTimeout(this.ringTimer);
  }

  // --- Live events ---

  /** Who's in a chat's call changed. */
  onCall(chatId: number, members: CallMember[], ring?: { from: string; video: boolean }) {
    const chat = chats.get(chatId);
    if (chat) {
      chat.call = members;
      if (!members.length) chat.callStarted = null;
      else chat.callStarted ??= Date.now();
    } else {
      chats.refresh();
    }
    const here = new Set(members.map((m) => m.username));

    if (ring && ring.from !== me() && this.chatId !== chatId) this.ring(chatId, ring.from, ring.video);
    // Stop ringing when the caller gives up, or we answered on another device.
    if (this.ringing?.chatId === chatId && (!members.length || here.has(me()))) this.stopRinging();

    if (this.chatId !== chatId || !this.live) return;
    // The server forgot us (the computer slept, say): join again.
    if (!here.has(me())) return void this.rejoin();
    for (const name of [...this.peers.keys()]) if (!here.has(name)) this.drop(name);
    this.remotes = this.remotes.filter((r) => here.has(r.username));
    for (const m of members) {
      const r = this.remotes.find((x) => x.username === m.username);
      if (!r && m.username !== me()) this.remotes.push(blankRemote(m.username, m.video));
      // Normally they connect to us when they join. In case that never happens, the one whose
      // name sorts first connects.
      if (m.username !== me() && !this.peers.has(m.username) && me() < m.username && !this.fallbacks.has(m.username)) {
        this.fallbacks.set(
          m.username,
          setTimeout(() => {
            this.fallbacks.delete(m.username);
            if (this.chatId === chatId && !this.peers.has(m.username) && this.chat?.call.some((x) => x.username === m.username)) this.offer(m.username);
          }, FALLBACK_MS),
        );
      }
    }
    this.checkCompany();
  }

  onDeclined(chatId: number, username: string) {
    if (this.chatId !== chatId) return;
    const name = social.nameOf(username);
    if (this.chat?.kind === 'direct' && !this.hadCompany) this.leave(`${name} can't talk right now.`);
    else this.say(`${name} declined.`);
  }

  async onSignal(chatId: number, from: string, data: Record<string, unknown>) {
    if (this.chatId !== chatId || from === me()) return;
    const s = data as Signal;
    try {
      if (s.t === 'offer') await this.onOffer(from, s.sdp);
      else if (s.t === 'answer') {
        const peer = this.peers.get(from);
        if (!peer?.offerer || peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: s.sdp });
        await this.addEarly(peer);
      } else if (s.t === 'ice') {
        const peer = this.peers.get(from);
        if (!peer) this.orphans.set(from, [...(this.orphans.get(from) ?? []), ...s.c]);
        else if (!peer.pc.remoteDescription) peer.early.push(...s.c);
        else for (const c of s.c) await peer.pc.addIceCandidate(c).catch(() => {});
      } else if (s.t === 'state') {
        const r = this.remotes.find((x) => x.username === from);
        if (r) {
          r.audio = !!s.audio;
          r.video = !!s.video;
        }
      }
    } catch {}
  }

  // --- Connections ---

  private rejoin() {
    if (this.rejoining || this.chatId === null) return;
    this.rejoining = true;
    const chatId = this.chatId;
    api<{ members: string[] }>('POST', `/api/chats/${chatId}/call`, { action: 'join', video: this.cameraOn })
      .then(({ members }) => {
        if (this.chatId === chatId) for (const name of members) if (this.peers.get(name)?.pc.connectionState !== 'connected') this.offer(name);
      })
      .catch(() => {
        if (this.chatId === chatId) this.leave('You were disconnected from the call.');
      })
      .finally(() => (this.rejoining = false));
  }

  /** Leave alone with nobody answering, or once everyone else has gone. */
  private checkCompany() {
    const others = (this.chat?.call ?? []).filter((m) => m.username !== me());
    if (others.length) {
      this.hadCompany = true;
      clearTimeout(this.noAnswerTimer);
      this.noAnswerTimer = undefined;
    } else if (this.hadCompany) {
      this.leave();
    } else if (!this.noAnswerTimer) {
      this.noAnswerTimer = setTimeout(() => this.leave('No answer.'), NO_ANSWER_MS);
    }
  }

  private makePeer(username: string, offerer: boolean): Peer {
    this.drop(username);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer: Peer = { pc, offerer, createdAt: Date.now(), early: this.orphans.get(username) ?? [], outbox: [], ready: false };
    this.orphans.delete(username);
    this.peers.set(username, peer);
    let remote = this.remotes.find((r) => r.username === username);
    if (!remote) {
      const m = this.chat?.call.find((x) => x.username === username);
      this.remotes.push(blankRemote(username, !!m?.video));
    }
    remote = this.remotes.find((r) => r.username === username)!;
    remote.state = 'connecting';

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      peer.outbox.push(e.candidate.toJSON());
      this.flushIce(username, peer);
    };
    pc.ontrack = (e) => {
      const r = this.remotes.find((x) => x.username === username);
      if (!r || this.peers.get(username) !== peer) return;
      const tracks = (r.stream?.getTracks() ?? []).filter((t) => t.kind !== e.track.kind);
      r.stream = new MediaStream([...tracks, e.track]);
      if (e.track.kind === 'audio') {
        peer.meter?.close();
        peer.meter = Meter.for(new MediaStream([e.track]));
      }
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(username) !== peer) return;
      const r = this.remotes.find((x) => x.username === username);
      const state = pc.connectionState;
      if (r) r.state = state === 'connected' ? 'connected' : state === 'failed' || state === 'disconnected' ? 'lost' : r.state;
      if (state === 'connected') this.shareState(username);
      // Try again from scratch if the connection breaks for good.
      if (state === 'failed' && peer.offerer) setTimeout(() => this.peers.get(username) === peer && this.offer(username), 1000);
    };
    return peer;
  }

  private drop(username: string) {
    const peer = this.peers.get(username);
    if (!peer) return;
    this.peers.delete(username);
    clearTimeout(peer.flush);
    peer.meter?.close();
    peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.onconnectionstatechange = null;
    peer.pc.close();
  }

  private async offer(username: string) {
    const peer = this.makePeer(username, true);
    const { pc } = peer;
    // Always offer both, so the camera can come on later without starting over.
    pc.addTransceiver(this.mic ?? 'audio', { direction: 'sendrecv' });
    pc.addTransceiver(this.camera ?? 'video', { direction: 'sendrecv' });
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (this.peers.get(username) !== peer) return;
      await this.signal(username, { t: 'offer', sdp: pc.localDescription!.sdp });
      peer.ready = true;
      this.flushIce(username, peer);
    } catch {}
  }

  private async onOffer(from: string, sdp: string) {
    const current = this.peers.get(from);
    // Both of us offered at once: the name that sorts first wins, unless ours is stuck.
    if (current?.offerer && current.pc.signalingState === 'have-local-offer' && me() < from && Date.now() - current.createdAt < 10_000) return;
    const peer = this.makePeer(from, false);
    const { pc } = peer;
    await pc.setRemoteDescription({ type: 'offer', sdp });
    for (const t of pc.getTransceivers()) {
      t.direction = 'sendrecv';
      await t.sender.replaceTrack(t.receiver.track.kind === 'audio' ? this.mic : this.camera);
    }
    await pc.setLocalDescription(await pc.createAnswer());
    if (this.peers.get(from) !== peer) return;
    await this.signal(from, { t: 'answer', sdp: pc.localDescription!.sdp });
    peer.ready = true;
    this.flushIce(from, peer);
    await this.addEarly(peer);
  }

  private async addEarly(peer: Peer) {
    const early = peer.early.splice(0);
    for (const c of early) await peer.pc.addIceCandidate(c).catch(() => {});
  }

  /** Send connection details in small batches, after our offer or answer. */
  private flushIce(username: string, peer: Peer) {
    if (!peer.ready || peer.flush || !peer.outbox.length) return;
    peer.flush = setTimeout(() => {
      peer.flush = undefined;
      if (this.peers.get(username) !== peer) return;
      const c = peer.outbox.splice(0);
      if (c.length) this.signal(username, { t: 'ice', c });
    }, 150);
  }

  private async signal(to: string, data: Signal) {
    const chatId = this.chatId;
    if (chatId === null) return;
    await api('POST', `/api/chats/${chatId}/signal`, { to, data }).catch(() => {});
  }

  /** Who's talking. */
  private measure() {
    this.speaking = this.micOn && (this.myMeter?.level() ?? 0) > 0.04;
    for (const r of this.remotes) {
      const level = this.peers.get(r.username)?.meter?.level() ?? 0;
      const speaking = r.audio && level > 0.04;
      if (r.speaking !== speaking) r.speaking = speaking;
    }
  }
}

const blankRemote = (username: string, video: boolean): Remote => ({ username, stream: null, audio: true, video, state: 'connecting', speaking: false });

const sender = (pc: RTCPeerConnection, kind: 'audio' | 'video') => pc.getTransceivers().find((t) => t.receiver.track.kind === kind)?.sender;

let audioContext: AudioContext | null = null;
function sharedAudio(): AudioContext | null {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  } catch {
    return null;
  }
}

/** How loud a stream is. */
class Meter {
  private source: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  private data: Uint8Array<ArrayBuffer>;

  private constructor(ctx: AudioContext, stream: MediaStream) {
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.data = new Uint8Array(this.analyser.fftSize);
    this.source.connect(this.analyser);
  }

  static for(stream: MediaStream): Meter | undefined {
    const ctx = sharedAudio();
    try {
      return ctx ? new Meter(ctx, stream) : undefined;
    } catch {
      return undefined;
    }
  }

  level(): number {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (const v of this.data) sum += ((v - 128) / 128) ** 2;
    return Math.sqrt(sum / this.data.length);
  }

  close() {
    this.source.disconnect();
  }
}

/** A gentle two-note ring, made on the spot so there's no sound file to ship. */
class Ringtone {
  private timer: ReturnType<typeof setInterval> | undefined;

  start() {
    this.stop();
    const ring = () => {
      const ctx = sharedAudio();
      if (!ctx) return;
      [0, 0.22].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = ctx.currentTime + delay;
        osc.type = 'sine';
        osc.frequency.value = i ? 660 : 880;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.22);
      });
    };
    ring();
    this.timer = setInterval(ring, 2200);
  }

  stop() {
    clearInterval(this.timer);
  }
}

export const calls = new Calls();
