import { useEffect, useRef, useCallback, useState } from "react";
import type { MediaProvider, YouTubePlayer, YouTubeWindow } from "../types";
import { loadYouTubeApi } from "../utils";

declare const window: YouTubeWindow;

// =============================================================================
// useYouTubeProvider — MediaProvider implementation for YouTube IFrame API
// =============================================================================
//
// Wraps the YouTube IFrame API into a MediaProvider that the usePomodoro hook
// can play/pause. Also handles:
//
// - Loading the IFrame API script (singleton, via loadYouTubeApi)
// - Creating the YT.Player instance on a given DOM element ID
// - Resizing the player to fill its container
// - Video looping (when a video ends, it restarts)
// - Bidirectional sync: the user clicking play/pause on the YouTube controls
//   triggers callbacks (setOnUserPlay / setOnUserPause) that the pomodoro
//   hook uses to start/stop the timer
// - A "programmatic change" guard to prevent feedback loops between the
//   pomodoro hook's play/pause calls and the onStateChange handler
//
// The hook returns the MediaProvider interface plus some extras the YouTube
// session pages need (apiLoaded, videoId setter, player container ref).

export interface UseYouTubeProviderOptions {
  // The DOM element ID where the player will be mounted (e.g. "yt-player-quick").
  // Different per page to avoid collisions.
  elementId: string;
}

export interface UseYouTubeProviderResult {
  provider: MediaProvider;
  apiLoaded: boolean;
  videoId: string;
  setVideoId: (id: string) => void;
  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  playerRef: React.RefObject<YouTubePlayer | null>;
}

export function useYouTubeProvider(
  options: UseYouTubeProviderOptions,
): UseYouTubeProviderResult {
  const { elementId } = options;

  const [apiLoaded, setApiLoaded] = useState(false);
  const [videoId, setVideoId] = useState("");

  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  // Guard to distinguish app-initiated play/pause from user-initiated.
  // When true, the onStateChange handler won't fire the user callbacks.
  const programmaticChangeRef = useRef(false);

  // Callbacks that the pomodoro hook will register via setOnUserPlay/setOnUserPause
  const onUserPlayRef = useRef<(() => void) | null>(null);
  const onUserPauseRef = useRef<(() => void) | null>(null);

  // Load the YouTube IFrame API script on mount
  useEffect(() => {
    loadYouTubeApi().then(() => setApiLoaded(true));
  }, []);

  // Resize the player iframe to fill its container element.
  // Called on window resize and after the player is created.
  const resizePlayer = useCallback(() => {
    if (playerRef.current?.setSize && playerContainerRef.current) {
      const width = playerContainerRef.current.clientWidth;
      const height = playerContainerRef.current.clientHeight;
      playerRef.current.setSize(width, height);
    }
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => resizePlayer();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [resizePlayer]);

  // Create or update the YouTube player when the video ID changes.
  // If a player already exists, just load the new video. Otherwise create
  // a new YT.Player on the target element.
  useEffect(() => {
    if (!apiLoaded || !videoId) return;

    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      resizePlayer();
    } else {
      playerRef.current = new window.YT.Player(elementId, {
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            resizePlayer();
          },
          onStateChange: (event) => {
            // Loop video when it ends
            if (event.data === 0) {
              event.target.playVideo();
            }

            // Only sync with user actions if this wasn't a programmatic change
            if (!programmaticChangeRef.current) {
              // YT PlayerState: 1 = playing, 2 = paused
              if (event.data === 1 && onUserPlayRef.current) {
                onUserPlayRef.current();
              }
              if (event.data === 2 && onUserPauseRef.current) {
                onUserPauseRef.current();
              }
            }
          },
        },
      });
    }
    // We only want to create/update the player when apiLoaded or videoId changes,
    // not when other things change, so we suppress the exhaustive-deps warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiLoaded, videoId, elementId]);

  // ---- Build the MediaProvider interface ----

  const play = useCallback(() => {
    if (playerRef.current?.playVideo) {
      programmaticChangeRef.current = true;
      playerRef.current.playVideo();
      setTimeout(() => { programmaticChangeRef.current = false; }, 100);
    }
  }, []);

  const pause = useCallback(() => {
    if (playerRef.current?.pauseVideo) {
      programmaticChangeRef.current = true;
      playerRef.current.pauseVideo();
      setTimeout(() => { programmaticChangeRef.current = false; }, 100);
    }
  }, []);

  const isReady = useCallback(() => {
    return !!playerRef.current?.playVideo;
  }, []);

  const setOnUserPlay = useCallback((cb: (() => void) | null) => {
    onUserPlayRef.current = cb;
  }, []);

  const setOnUserPause = useCallback((cb: (() => void) | null) => {
    onUserPauseRef.current = cb;
  }, []);

  const cleanup = useCallback(() => {
    playerRef.current = null;
  }, []);

  // We construct the provider object once and keep it stable via refs.
  // The play/pause/isReady functions are already stable callbacks.
  const providerRef = useRef<MediaProvider>({
    play,
    pause,
    isReady,
    setOnUserPlay,
    setOnUserPause,
    cleanup,
  });

  // Update the provider's methods if they change (they won't, since they're
  // all useCallback with empty deps, but this is defensive)
  useEffect(() => {
    providerRef.current.play = play;
    providerRef.current.pause = pause;
    providerRef.current.isReady = isReady;
    providerRef.current.setOnUserPlay = setOnUserPlay;
    providerRef.current.setOnUserPause = setOnUserPause;
    providerRef.current.cleanup = cleanup;
  }, [play, pause, isReady, setOnUserPlay, setOnUserPause, cleanup]);

  return {
    provider: providerRef.current,
    apiLoaded,
    videoId,
    setVideoId,
    playerContainerRef,
    playerRef,
  };
}
