"use client";

import { useEffect, useRef } from "react";

const LOBBY_TRACKS = ["/theojt-spooky-music-theme-121127.mp3", "/first.mp3"];

/** The lobby alternates its tracks; an explicit source loops by itself during drawing. */
export default function LobbyAudio({ active, src }: { active: boolean; src?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.6;
    audio.muted = false;
    if (!active) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    let pending = false;
    let disposed = false;
    const tracks = src ? [src] : LOBBY_TRACKS;
    let trackIndex = 0;
    const start = () => {
      if (disposed || pending || !audio.paused) return;
      pending = true;
      void audio.play().catch(() => {
        // A blocked autoplay attempt is retried on the next trusted interaction.
      }).finally(() => { pending = false; });
    };
    const nextTrack = () => {
      if (disposed) return;
      trackIndex = (trackIndex + 1) % tracks.length;
      audio.src = tracks[trackIndex];
      audio.load();
      start();
    };
    audio.addEventListener("canplay", start);
    audio.addEventListener("ended", nextTrack);
    // Playback permission comes from the visitor's first interaction when autoplay is blocked.
    const gestures = ["pointerdown", "pointerup", "keydown", "click", "touchend"] as const;
    gestures.forEach((event) => document.addEventListener(event, start, { capture: true, passive: true }));
    // Keep one audio element alive across login and rules, preserving playback permission.
    audio.src = tracks[0];
    audio.load();
    start();
    return () => {
      disposed = true;
      audio.removeEventListener("canplay", start);
      audio.removeEventListener("ended", nextTrack);
      gestures.forEach((event) => document.removeEventListener(event, start, true));
      audio.pause();
    };
  }, [active, src]);

  return <audio ref={audioRef} src={src ?? LOBBY_TRACKS[0]} autoPlay={active} loop={!!src} preload={active ? "auto" : "none"} hidden />;
}
