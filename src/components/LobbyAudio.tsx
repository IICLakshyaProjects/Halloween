"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

const DEFAULT_TRACKS = ["/theojt-spooky-music-theme-121127.mp3", "/1.mp3"];

export type LobbyAudioHandle = {
  play: () => void;
};

/** Plays a lobby playlist in order, returning to its first track after the last one. */
const LobbyAudio = forwardRef<LobbyAudioHandle, { active: boolean; src?: string; tracks?: string[] }>(function LobbyAudio({ active, src, tracks }, ref) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeTracks = useMemo(() => src ? [src] : tracks ?? DEFAULT_TRACKS, [src, tracks]);
  const playlistKey = activeTracks.join("|");
  const [trackIndex, setTrackIndex] = useState(0);
  const currentTrack = activeTracks[trackIndex] ?? activeTracks[0];

  useEffect(() => {
    setTrackIndex(0);
  }, [playlistKey]);

  useImperativeHandle(ref, () => ({
    play: () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.muted = false;
      void audio.play().catch(() => {
        // The active-state handler retries on the next trusted interaction if needed.
      });
    },
  }), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = src ? 0.6 : 0.35;
    audio.muted = false;
    if (!active) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    const start = () => {
      if (audio.paused) {
        void audio.play().catch(() => {
          // A blocked autoplay attempt is retried on the next trusted interaction.
        });
      }
    };
    const gestures = ["pointerdown", "pointerup", "keydown", "click", "touchend"] as const;
    audio.addEventListener("canplay", start);
    gestures.forEach((event) => document.addEventListener(event, start, { capture: true, passive: true }));
    start();
    return () => {
      audio.removeEventListener("canplay", start);
      gestures.forEach((event) => document.removeEventListener(event, start, true));
      audio.pause();
    };
  }, [active, currentTrack, src]);

  const playNextTrack = () => {
    if (activeTracks.length > 1) setTrackIndex((index) => (index + 1) % activeTracks.length);
  };

  return <audio key={currentTrack} ref={audioRef} src={currentTrack} autoPlay={active} loop={activeTracks.length === 1} onEnded={playNextTrack} preload={active ? "auto" : "none"} hidden />;
});

LobbyAudio.displayName = "LobbyAudio";

export default LobbyAudio;
