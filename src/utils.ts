import type { IntervalBlock, FlatInterval, YouTubeWindow } from "./types";

// --- YouTube URL parsing ---

// Extracts the 11-character YouTube video ID from various URL formats:
// youtube.com/watch?v=XXX, youtu.be/XXX, youtube.com/embed/XXX, etc.
export function extractVideoId(url: string): string | null {
  const regExp =
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[7].length === 11 ? match[7] : null;
}

// --- Time formatting ---

// Formats seconds into MM:SS for the timer display
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

// Formats total minutes as "Xh Ym" for the planned session summary
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// --- Video data fetching ---

// Fetches video title and thumbnail using the YouTube oEmbed API.
// This doesn't require an API key. Falls back gracefully on failure.
export async function fetchVideoData(
  videoId: string,
): Promise<{ title: string; thumbnail: string }> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || "Unknown Title",
        thumbnail:
          data.thumbnail_url ||
          `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      };
    }
  } catch (error) {
    console.error("Failed to fetch video data:", error);
  }
  return {
    title: "Unknown Title",
    thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
  };
}

// --- Planned session interval helpers ---

// Expands IntervalBlock[] into a flat sequence of work/break intervals.
// Each block generates `repeat` work intervals, each followed by a break.
// The trailing break after the very last work interval is removed —
// the session ends immediately after the final work period.
export function flattenIntervals(blocks: IntervalBlock[]): FlatInterval[] {
  const result: FlatInterval[] = [];
  blocks.forEach((block, blockIndex) => {
    for (let i = 0; i < block.repeat; i++) {
      result.push({
        type: "work",
        durationMinutes: block.workMinutes,
        blockIndex,
      });
      result.push({
        type: "break",
        durationMinutes: block.breakMinutes,
        blockIndex,
      });
    }
  });
  // Remove trailing break — session ends after the last work interval
  if (result.length > 0 && result[result.length - 1].type === "break") {
    result.pop();
  }
  return result;
}

// --- ID generation ---

let idCounter = 0;

// Simple unique ID generator for IntervalBlock React keys.
// Not crypto-safe, just needs to be unique within a session.
export function generateId(): string {
  return `block-${Date.now()}-${++idCounter}`;
}

// --- YouTube IFrame API loader ---

// Module-level promise so the API script is only loaded once across the
// entire app lifecycle, regardless of how many components request it.
let apiReadyPromise: Promise<void> | null = null;

// Loads the YouTube IFrame API script if it hasn't been loaded yet.
// Returns a promise that resolves when window.YT.Player is available.
// Safe to call multiple times — subsequent calls return the same promise.
export function loadYouTubeApi(): Promise<void> {
  const ytWindow = window as unknown as YouTubeWindow;

  // API already loaded (e.g., from a previous tab mount)
  if (ytWindow.YT?.Player) return Promise.resolve();

  // Script tag already inserted, waiting for it to load
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    ytWindow.onYouTubeIframeAPIReady = () => {
      resolve();
    };
  });
  return apiReadyPromise;
}
