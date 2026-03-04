import { useState, useEffect } from "react";
import type { VideoHistoryItem } from "./types";
import { fetchVideoData } from "./utils";

const STORAGE_KEY = "pomodoro-video-history";
const MAX_HISTORY = 20;

// Manages the list of previously-loaded YouTube videos, persisted in localStorage.
// Both the Quick Session and Planned Session tabs share the same history list,
// so this hook reads/writes to a single localStorage key.
//
// The history is capped at MAX_HISTORY items. Adding an already-existing video
// bumps it to the top. New videos get their title and thumbnail fetched via
// the YouTube oEmbed API (no API key needed).
export function useVideoHistory() {
  const [videoHistory, setVideoHistory] = useState<VideoHistoryItem[]>([]);

  // Load saved history from localStorage on first mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setVideoHistory(JSON.parse(saved));
      } catch (error) {
        console.error("Failed to parse video history:", error);
      }
    }
  }, []);

  // Persist to localStorage whenever history changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videoHistory));
  }, [videoHistory]);

  // Add a video to history, or bump it to the top if it already exists.
  // Fetches title/thumbnail via oEmbed for new videos.
  const addToHistory = async (id: string, url: string) => {
    const existingIndex = videoHistory.findIndex((item) => item.id === id);

    if (existingIndex !== -1) {
      // Move existing video to top with updated timestamp
      const updatedHistory = [...videoHistory];
      const [existingItem] = updatedHistory.splice(existingIndex, 1);
      existingItem.addedAt = Date.now();
      updatedHistory.unshift(existingItem);
      setVideoHistory(updatedHistory);
    } else {
      const { title, thumbnail } = await fetchVideoData(id);
      const newItem: VideoHistoryItem = {
        id,
        url,
        title,
        thumbnail,
        addedAt: Date.now(),
      };
      setVideoHistory((prev) => [newItem, ...prev.slice(0, MAX_HISTORY - 1)]);
    }
  };

  const removeFromHistory = (id: string) => {
    setVideoHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const clearHistory = () => {
    setVideoHistory([]);
  };

  return { videoHistory, addToHistory, removeFromHistory, clearHistory };
}
