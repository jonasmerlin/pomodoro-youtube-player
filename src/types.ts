// YouTube IFrame API player methods we use.
// The actual YT.Player has many more methods, but we only type what we need.
export interface YouTubePlayer {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState: () => number;
  setSize: (width: number, height: number) => void;
}

export interface YouTubeEvent {
  data: number;
  target: YouTubePlayer;
}

// A video the user has previously loaded, persisted in localStorage
export interface VideoHistoryItem {
  id: string;
  url: string;
  title?: string;
  thumbnail?: string;
  addedAt: number;
}

// Extends Window with the YouTube IFrame API globals.
// Used via `declare const window: YouTubeWindow` in files that create players.
export interface YouTubeWindow extends Window {
  YT: {
    Player: new (
      elementId: string,
      config: {
        height?: string | number;
        width?: string | number;
        videoId: string;
        playerVars: {
          autoplay: number;
          controls: number;
          rel: number;
        };
        events: {
          onStateChange: (event: YouTubeEvent) => void;
          onReady?: (event: { target: YouTubePlayer }) => void;
        };
      },
    ) => YouTubePlayer;
  };
  onYouTubeIframeAPIReady: () => void;
}

// --- Planned Session types ---

// One entry in the interval plan builder UI.
// "Do `repeat` repetitions of `workMinutes` work / `breakMinutes` break."
export interface IntervalBlock {
  id: string;
  workMinutes: number;
  breakMinutes: number;
  repeat: number;
}

// A single interval in the flattened sequence derived from IntervalBlock[].
// This is what the timer actually steps through during a running session.
export interface FlatInterval {
  type: "work" | "break";
  durationMinutes: number;
  blockIndex: number;
}

// A video in the planned session's playlist queue
export interface QueuedVideo {
  id: string;
  url: string;
  title?: string;
  thumbnail?: string;
}

export type ActiveTab = "quick" | "planned";
