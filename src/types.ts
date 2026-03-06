// =============================================================================
// Media Provider
// =============================================================================
//
// Common interface for all media sources (YouTube, Spotify, NTS).
// The pomodoro timer calls play()/pause() on the provider to sync media
// playback with work/break intervals. Each provider implements this contract
// differently — YouTube talks to a local IFrame API, Spotify calls a REST API,
// NTS manages an <audio> element — but the timer doesn't care about any of that.

export interface MediaProvider {
  play(): void | Promise<void>;
  pause(): void | Promise<void>;
  // Returns true when the provider is in a state where play/pause will work.
  // For YouTube: the player has been created. For Spotify: we have a valid token.
  // For NTS: always true (the <audio> element is always available).
  isReady(): boolean;
  // Optional hooks for bidirectional sync — when the user manually clicks
  // play/pause on the media player itself (e.g. YouTube controls), the
  // provider can notify the pomodoro timer. Only YouTube uses this today.
  setOnUserPlay?: (cb: (() => void) | null) => void;
  setOnUserPause?: (cb: (() => void) | null) => void;
  cleanup(): void;
}

// Which media source the user has selected at the top level.
export type MediaSource = "youtube" | "spotify" | "nts";

// Which session mode is active within a source.
export type SessionMode = "quick" | "planned";

// =============================================================================
// YouTube types
// =============================================================================

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

// =============================================================================
// Spotify types
// =============================================================================

export interface SpotifyImage {
  url: string;
  height?: number;
  width?: number;
}

export interface SpotifyArtist {
  name: string;
  id: string;
}

export interface SpotifyAlbum {
  name: string;
  id: string;
  images: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album?: SpotifyAlbum;
}

export interface SpotifyPlaybackState {
  device?: {
    id: string;
    name: string;
    type: string;
  };
  is_playing?: boolean;
  item?: SpotifyTrack;
  message?: string; // For "No active device found" message
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string;
  email: string;
  images?: SpotifyImage[];
}

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

// =============================================================================
// NTS types
// =============================================================================

export type NTSChannel = 1 | 2;

// =============================================================================
// Planned Session types
// =============================================================================

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

// A video in the planned session's playlist queue (YouTube only)
export interface QueuedVideo {
  id: string;
  url: string;
  title?: string;
  thumbnail?: string;
}
