"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Phone → desktop video over plain WebRTC, signalled through a Supabase Realtime broadcast channel
 * whose name is an unguessable per-pairing secret. The phone is the offerer and sends a 1 Hz
 * heartbeat on a data channel; the desktop treats a missing heartbeat (> 3 s) or a failed peer
 * connection as a disconnect.
 */
type Signal =
  | { t: "hello"; from: "phone"; session: string }
  | { t: "ready"; session: string }
  | { t: "offer"; session: string; sdp: RTCSessionDescriptionInit }
  | { t: "answer"; session: string; sdp: RTCSessionDescriptionInit }
  | { t: "ice"; session: string; from: "phone" | "desktop"; candidate: RTCIceCandidateInit }
  | { t: "bye"; session: string };

const HEARTBEAT_TIMEOUT_MS = 3000;

function joinChannel(name: string, onSignal: (s: Signal) => void): Promise<RealtimeChannel> {
  const ch = createClient().channel(`proctra-pair-${name}`, { config: { broadcast: { self: false, ack: false } } });
  ch.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload as Signal));
  return new Promise((resolve, reject) => {
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve(ch);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`Signalling ${status}`));
    });
  });
}
const send = (ch: RealtimeChannel, s: Signal) => ch.send({ type: "broadcast", event: "signal", payload: s });

export type LinkStatus = "waiting" | "connecting" | "connected" | "disconnected";

export class DesktopLink {
  private ch: RealtimeChannel | null = null;
  private pc: RTCPeerConnection | null = null;
  private session = "";
  private lastBeat = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  status: LinkStatus = "waiting";
  stream: MediaStream | null = null;

  constructor(
    private readonly channel: string,
    private readonly ice: RTCIceServer[],
    private readonly onChange: (status: LinkStatus, stream: MediaStream | null) => void,
  ) {}

  private set(status: LinkStatus) {
    if (status === this.status) return;
    this.status = status;
    this.onChange(status, this.stream);
  }

  async start() {
    this.ch = await joinChannel(this.channel, (s) => void this.onSignal(s));
    this.watchdog = setInterval(() => {
      if (this.status === "connected" && Date.now() - this.lastBeat > HEARTBEAT_TIMEOUT_MS) this.set("disconnected");
    }, 500);
  }

  private async onSignal(s: Signal) {
    if (!this.ch) return;
    if (s.t === "hello") {
      // New (or reconnecting) phone session: start a fresh peer connection.
      this.pc?.close();
      this.session = s.session;
      const pc = new RTCPeerConnection({ iceServers: this.ice });
      this.pc = pc;
      pc.onicecandidate = (e) => e.candidate && this.ch && send(this.ch, { t: "ice", session: this.session, from: "desktop", candidate: e.candidate.toJSON() });
      pc.ontrack = (e) => {
        this.stream = e.streams[0] ?? new MediaStream([e.track]);
        this.onChange(this.status, this.stream);
      };
      pc.ondatachannel = (e) => {
        e.channel.onmessage = () => {
          this.lastBeat = Date.now();
          if (this.status !== "connected") this.set("connected");
        };
      };
      pc.onconnectionstatechange = () => {
        if (pc !== this.pc) return;
        if (pc.connectionState === "connecting") this.set("connecting");
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) this.set("disconnected");
      };
      this.set("connecting");
      await send(this.ch, { t: "ready", session: this.session });
      return;
    }
    if (!this.pc || s.session !== this.session) return;
    if (s.t === "offer") {
      await this.pc.setRemoteDescription(s.sdp);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await send(this.ch, { t: "answer", session: this.session, sdp: answer });
    } else if (s.t === "ice" && s.from === "phone") {
      await this.pc.addIceCandidate(s.candidate).catch(() => {});
    } else if (s.t === "bye") {
      this.set("disconnected");
    }
  }

  close() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.pc?.close();
    void this.ch?.unsubscribe();
  }
}

export class PhoneLink {
  private ch: RealtimeChannel | null = null;
  private pc: RTCPeerConnection | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private readonly session = crypto.randomUUID();

  constructor(
    private readonly channel: string,
    private readonly ice: RTCIceServer[],
    private readonly stream: MediaStream,
    private readonly onChange: (status: LinkStatus) => void,
  ) {}

  async start() {
    this.ch = await joinChannel(this.channel, (s) => void this.onSignal(s));
    this.onChange("waiting");
    await this.hello();
  }

  /**
   * (Re)announce until the desktop answers "ready": broadcasts aren't stored, so a hello sent before
   * the desktop finished subscribing would otherwise be lost and pairing would hang.
   */
  async hello() {
    if (!this.ch) return;
    if (this.helloTimer) clearInterval(this.helloTimer);
    const say = () => this.ch && send(this.ch, { t: "hello", from: "phone", session: this.session });
    await say();
    this.helloTimer = setInterval(() => void say(), 2000);
  }

  private async onSignal(s: Signal) {
    if (!this.ch || ("session" in s && s.session !== this.session)) return;
    if (s.t === "ready") {
      if (this.helloTimer) clearInterval(this.helloTimer);
      this.helloTimer = null;
      this.pc?.close();
      const pc = new RTCPeerConnection({ iceServers: this.ice });
      this.pc = pc;
      this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream));
      const hb = pc.createDataChannel("hb");
      hb.onopen = () => {
        this.onChange("connected");
        if (this.beat) clearInterval(this.beat);
        this.beat = setInterval(() => hb.readyState === "open" && hb.send("1"), 1000);
      };
      pc.onicecandidate = (e) => e.candidate && this.ch && send(this.ch, { t: "ice", session: this.session, from: "phone", candidate: e.candidate.toJSON() });
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(pc.connectionState)) this.onChange("disconnected");
      };
      this.onChange("connecting");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await send(this.ch, { t: "offer", session: this.session, sdp: offer });
    } else if (s.t === "answer" && this.pc) {
      await this.pc.setRemoteDescription(s.sdp);
    } else if (s.t === "ice" && s.from === "desktop" && this.pc) {
      await this.pc.addIceCandidate(s.candidate).catch(() => {});
    }
  }

  close() {
    if (this.beat) clearInterval(this.beat);
    if (this.helloTimer) clearInterval(this.helloTimer);
    if (this.ch) void send(this.ch, { t: "bye", session: this.session });
    this.pc?.close();
    void this.ch?.unsubscribe();
  }
}
