"use client";

import { useEffect, useRef, useState } from "react";
import { useProctoring } from "@/components/candidate/use-proctoring";

/** Mounts the real proctoring hook on the fake camera; ?token= is a candidate invite token. */
export function ProctorHarness() {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [token] = useState(() => (typeof location === "undefined" ? "" : (new URLSearchParams(location.search).get("token") ?? "")));
  const [startedAt, setStartedAt] = useState(0);
  const [active, setActive] = useState(true);
  useEffect(() => {
    void navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((s) => {
      setStream(s);
      if (video.current) video.current.srcObject = s;
      setStartedAt(Date.now());
    });
  }, []);
  return (
    <main className="p-6">
      <video ref={video} autoPlay muted playsInline className="w-64" />
      {stream && token ? <Runner token={token} stream={stream} video={video} startedAt={startedAt} active={active} /> : null}
      <button data-testid="stop" onClick={() => setActive(false)}>
        Stop
      </button>
    </main>
  );
}

function Runner(props: { token: string; stream: MediaStream; video: React.RefObject<HTMLVideoElement | null>; startedAt: number; active: boolean }) {
  const { proctor } = useProctoring({ ...props, screen: null, config: { gaze_tracking: true, object_detection: false, record_video: false, show_live_warnings: true } });
  const [status, setStatus] = useState("");
  useEffect(() => {
    const id = setInterval(() => setStatus(JSON.stringify(proctor.current?.status ?? {})), 500);
    return () => clearInterval(id);
  }, [proctor]);
  return <p data-testid="proctor-status">{status}</p>;
}
