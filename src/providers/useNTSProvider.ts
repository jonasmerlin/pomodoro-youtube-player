import { useRef, useCallback, useState } from "react";
import type { MediaProvider, NTSChannel } from "../types";

// =============================================================================
// useNTSProvider — MediaProvider implementation for NTS Radio live streams
// =============================================================================
//
// The simplest of the three providers. NTS Radio is a live audio stream, so
// play() connects to the live edge (busts cache with a timestamp query param),
// and pause() disconnects entirely (clears the src so the next play reconnects
// fresh to the live stream rather than resuming from a stale buffer position).
//
// Supports NTS Channel 1 and Channel 2 via a channel selector.
//
// The hook returns the MediaProvider interface plus:
// - audioRef: the caller must render <audio ref={audioRef} /> in their JSX
// - channel / setChannel: for the channel selector UI

const NTS_STREAM_URLS: Record<NTSChannel, string> = {
  1: "https://stream-relay-geo.ntslive.net/stream",
  2: "https://stream-relay-geo.ntslive.net/stream2",
};

export interface UseNTSProviderResult {
  provider: MediaProvider;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  channel: NTSChannel;
  setChannel: (ch: NTSChannel) => void;
}

export function useNTSProvider(): UseNTSProviderResult {
  const [channel, setChannel] = useState<NTSChannel>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Reconnect to the live edge. We append a cache-busting param so the
  // browser doesn't serve a buffered copy from a previous session.
  const play = useCallback(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const streamUrl = NTS_STREAM_URLS[channel];
    audio.src = `${streamUrl}?t=${Date.now()}`;
    audio.load();
    audio.play().catch((err) => {
      console.error("Failed to play NTS audio:", err);
    });
  }, [channel]);

  // Stop playback and clear the source so the next start reconnects to live.
  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current.load();
  }, []);

  // The <audio> element is always available, so isReady is always true.
  const isReady = useCallback(() => true, []);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
  }, []);

  // Build a stable provider ref
  const providerRef = useRef<MediaProvider>({ play, pause, isReady, cleanup });
  // Keep methods up to date (play depends on channel)
  providerRef.current.play = play;
  providerRef.current.pause = pause;
  providerRef.current.isReady = isReady;
  providerRef.current.cleanup = cleanup;

  return {
    provider: providerRef.current,
    audioRef,
    channel,
    setChannel,
  };
}
