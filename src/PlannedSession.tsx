import React, { useState, useEffect, useRef } from "react";
import type {
  YouTubePlayer,
  YouTubeWindow,
  VideoHistoryItem,
  IntervalBlock,
  FlatInterval,
  QueuedVideo,
} from "./types";
import {
  formatTime,
  formatDuration,
  flattenIntervals,
  generateId,
  fetchVideoData,
  loadYouTubeApi,
} from "./utils";
import { useVideoHistory } from "./useVideoHistory";
import VideoInput from "./components/VideoInput";

declare const window: YouTubeWindow;

// PlannedSession lets the user build a sequence of interval blocks
// (e.g. 2x 25/5 then 5x 45/15) and a video playlist, then run through
// the entire session. Videos auto-advance when they end and loop the
// playlist if it's shorter than the session. The video plays during work
// intervals and pauses during breaks, same as the quick session.
//
// Two phases:
// 1. Planning — build interval blocks + video queue, then start
// 2. Running — timer counts down through flattened intervals, videos play
const PlannedSession: React.FC = () => {
  // --- Phase ---
  const [phase, setPhase] = useState<"planning" | "running">("planning");

  // --- Interval builder (planning phase) ---
  const [intervalBlocks, setIntervalBlocks] = useState<IntervalBlock[]>([]);
  const [newWorkMinutes, setNewWorkMinutes] = useState<number>(25);
  const [newBreakMinutes, setNewBreakMinutes] = useState<number>(5);
  const [newRepeat, setNewRepeat] = useState<number>(2);

  // --- Video queue (planning phase) ---
  const [videoQueue, setVideoQueue] = useState<QueuedVideo[]>([]);

  // --- Running phase state ---
  const [flatIntervals, setFlatIntervals] = useState<FlatInterval[]>([]);
  const [currentIntervalIndex, setCurrentIntervalIndex] = useState<number>(0);
  const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [sessionComplete, setSessionComplete] = useState<boolean>(false);

  // --- YouTube player ---
  const [apiLoaded, setApiLoaded] = useState<boolean>(false);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const programmaticChangeRef = useRef<boolean>(false);
  const isRunningRef = useRef<boolean>(false);
  // We need a ref for currentVideoIndex too, since the onStateChange handler
  // captures a stale closure and needs to read the latest value.
  const currentVideoIndexRef = useRef<number>(0);
  const videoQueueRef = useRef<QueuedVideo[]>([]);

  // --- Timer refs ---
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const endTimeRef = useRef<number>(0);

  // --- Video history (shared with Quick Session) ---
  const { videoHistory, addToHistory, removeFromHistory, clearHistory } =
    useVideoHistory();

  // --- YouTube API loading ---
  useEffect(() => {
    loadYouTubeApi().then(() => setApiLoaded(true));
  }, []);

  // Keep refs in sync with state for use in closure-captured handlers
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);
  useEffect(() => {
    currentVideoIndexRef.current = currentVideoIndex;
  }, [currentVideoIndex]);
  useEffect(() => {
    videoQueueRef.current = videoQueue;
  }, [videoQueue]);

  // --- Player resize ---
  const resizePlayer = () => {
    if (
      playerRef.current &&
      playerRef.current.setSize &&
      playerContainerRef.current
    ) {
      const width = playerContainerRef.current.clientWidth;
      const height = playerContainerRef.current.clientHeight;
      playerRef.current.setSize(width, height);
    }
  };

  useEffect(() => {
    const handleResize = () => resizePlayer();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- Visibility detection (same as QuickSession) ---
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && isRunning && !sessionComplete) {
        const now = Date.now();
        const remaining = endTimeRef.current - now;
        setTimeLeft(Math.max(0, Math.ceil(remaining / 1000)));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isRunning, sessionComplete]);

  // --- Interval block management ---

  const addIntervalBlock = () => {
    if (newWorkMinutes < 1 || newBreakMinutes < 1 || newRepeat < 1) return;
    const block: IntervalBlock = {
      id: generateId(),
      workMinutes: newWorkMinutes,
      breakMinutes: newBreakMinutes,
      repeat: newRepeat,
    };
    setIntervalBlocks((prev) => [...prev, block]);
  };

  const removeIntervalBlock = (id: string) => {
    setIntervalBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const moveIntervalBlock = (index: number, direction: "up" | "down") => {
    setIntervalBlocks((prev) => {
      const newBlocks = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newBlocks.length) return prev;
      [newBlocks[index], newBlocks[targetIndex]] = [
        newBlocks[targetIndex],
        newBlocks[index],
      ];
      return newBlocks;
    });
  };

  // --- Video queue management ---

  const addVideoToQueue = async (videoId: string, url: string) => {
    const { title, thumbnail } = await fetchVideoData(videoId);
    const video: QueuedVideo = { id: videoId, url, title, thumbnail };
    setVideoQueue((prev) => [...prev, video]);
    await addToHistory(videoId, url);
  };

  const removeVideoFromQueue = (index: number) => {
    setVideoQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const moveVideoInQueue = (index: number, direction: "up" | "down") => {
    setVideoQueue((prev) => {
      const newQueue = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newQueue.length) return prev;
      [newQueue[index], newQueue[targetIndex]] = [
        newQueue[targetIndex],
        newQueue[index],
      ];
      return newQueue;
    });
  };

  const handleVideoSubmit = async (videoId: string, url: string) => {
    await addVideoToQueue(videoId, url);
  };

  const handleLoadFromHistory = async (item: VideoHistoryItem) => {
    await addVideoToQueue(item.id, item.url);
  };

  // --- Start session ---

  const startSession = () => {
    if (intervalBlocks.length === 0) return;
    const flat = flattenIntervals(intervalBlocks);
    setFlatIntervals(flat);
    setCurrentIntervalIndex(0);
    setTimeLeft(flat[0].durationMinutes * 60);
    setSessionComplete(false);
    setCurrentVideoIndex(0);
    setPhase("running");
    // We start in a paused state; user clicks Start to begin.
    // This gives them a moment to see the layout before it starts.
    setIsRunning(false);
  };

  // --- Create/load YouTube player for running phase ---
  // We create the player when the running phase starts and a video is queued
  useEffect(() => {
    if (phase !== "running" || !apiLoaded || videoQueue.length === 0) return;

    const firstVideoId = videoQueue[0].id;

    if (playerRef.current) {
      playerRef.current.loadVideoById(firstVideoId);
      resizePlayer();
    } else {
      // Small delay to ensure the DOM element exists after phase transition
      const timeout = setTimeout(() => {
        playerRef.current = new window.YT.Player("yt-player-planned", {
          videoId: firstVideoId,
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
              // When video ends, advance to next video in queue (loop if exhausted)
              if (event.data === 0) {
                const queue = videoQueueRef.current;
                if (queue.length > 0) {
                  const nextIdx =
                    (currentVideoIndexRef.current + 1) % queue.length;
                  setCurrentVideoIndex(nextIdx);
                  event.target.loadVideoById(queue[nextIdx].id);
                }
              }

              // Sync user play/pause with timer (same as QuickSession)
              if (!programmaticChangeRef.current) {
                if (event.data === 1 && !isRunningRef.current) {
                  setIsRunning(true);
                }
                if (event.data === 2 && isRunningRef.current) {
                  setIsRunning(false);
                }
              }
            },
          },
        });
      }, 50);
      return () => clearTimeout(timeout);
    }
    // videoQueue is accessed via ref in the onStateChange handler closure.
    // We only want to (re)create the player when phase or API state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, apiLoaded]);

  // --- Sync video playback with timer state ---
  const currentInterval =
    flatIntervals.length > 0 ? flatIntervals[currentIntervalIndex] : null;
  const isWorkInterval = currentInterval?.type === "work";

  useEffect(() => {
    if (phase !== "running") return;
    if (playerRef.current && playerRef.current.playVideo) {
      programmaticChangeRef.current = true;
      if (isWorkInterval && isRunning) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
      setTimeout(() => {
        programmaticChangeRef.current = false;
      }, 100);
    }
  }, [isWorkInterval, isRunning, phase]);

  // --- Timer logic (same timestamp approach as QuickSession) ---
  useEffect(() => {
    if (phase !== "running" || !isRunning || sessionComplete) return;

    if (!intervalRef.current) {
      startTimeRef.current = Date.now();
      endTimeRef.current = startTimeRef.current + timeLeft * 1000;
    }

    intervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const remainingMs = endTimeRef.current - now;
      if (remainingMs <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setTimeLeft(0);

        // Advance to next interval
        const nextIndex = currentIntervalIndex + 1;
        if (nextIndex >= flatIntervals.length) {
          setSessionComplete(true);
          setIsRunning(false);
        } else {
          setCurrentIntervalIndex(nextIndex);
          setTimeLeft(flatIntervals[nextIndex].durationMinutes * 60);
        }
        return;
      }
      setTimeLeft(Math.ceil(remainingMs / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    phase,
    isRunning,
    sessionComplete,
    currentIntervalIndex,
    flatIntervals,
    // timeLeft is intentionally omitted — including it would restart the
    // interval on every tick, defeating the timestamp-based approach.
  ]);

  // --- Document title ---
  useEffect(() => {
    if (phase !== "running") {
      document.title = "Plan Session | Pomodoro";
      return;
    }
    if (sessionComplete) {
      document.title = "Session Complete!";
    } else if (isRunning && currentInterval) {
      const formattedTime = formatTime(timeLeft);
      const status = currentInterval.type === "work" ? "Work" : "Break";
      document.title = `${formattedTime} - ${status} | Planned Session`;
    } else {
      document.title = "Planned Session | Pomodoro";
    }
    return () => {
      document.title = "Pomodoro YouTube Player";
    };
  }, [phase, timeLeft, isRunning, sessionComplete, currentInterval]);

  // --- Timer controls ---

  const toggleTimer = () => {
    if (sessionComplete) {
      // Restart from the beginning
      setCurrentIntervalIndex(0);
      setTimeLeft(flatIntervals[0].durationMinutes * 60);
      setSessionComplete(false);
      setCurrentVideoIndex(0);
      if (videoQueue.length > 0 && playerRef.current) {
        playerRef.current.loadVideoById(videoQueue[0].id);
      }
    }
    setIsRunning(!isRunning);
  };

  const skipInterval = () => {
    if (sessionComplete) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const nextIndex = currentIntervalIndex + 1;
    if (nextIndex >= flatIntervals.length) {
      setSessionComplete(true);
      setIsRunning(false);
    } else {
      setCurrentIntervalIndex(nextIndex);
      setTimeLeft(flatIntervals[nextIndex].durationMinutes * 60);
      startTimeRef.current = Date.now();
      endTimeRef.current =
        startTimeRef.current +
        flatIntervals[nextIndex].durationMinutes * 60 * 1000;
    }
  };

  const cancelSession = () => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Destroy the player so it gets recreated fresh next time
    playerRef.current = null;
    setPhase("planning");
    setSessionComplete(false);
  };

  // --- Planning phase summary ---
  const flat = flattenIntervals(intervalBlocks);
  const workIntervalCount = flat.filter((i) => i.type === "work").length;
  const totalMinutes = flat.reduce((sum, i) => sum + i.durationMinutes, 0);

  // --- Render ---

  // ==============================
  // RUNNING PHASE
  // ==============================
  if (phase === "running") {
    const totalIntervals = flatIntervals.length;
    const currentDuration = currentInterval
      ? currentInterval.durationMinutes * 60
      : 0;
    const progress =
      currentDuration > 0
        ? Math.min(1, Math.max(0, 1 - timeLeft / currentDuration))
        : 0;

    // Count how many work intervals we've completed (for the "pomodoro X of Y" display)
    const workIntervals = flatIntervals.filter((i) => i.type === "work");
    const currentWorkNumber = isWorkInterval
      ? flatIntervals
          .slice(0, currentIntervalIndex + 1)
          .filter((i) => i.type === "work").length
      : flatIntervals
          .slice(0, currentIntervalIndex)
          .filter((i) => i.type === "work").length;

    return (
      <>
        {/* Timer display */}
        <div className="w-full mb-8">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Progress bar */}
            <div
              className="h-1 bg-slate-100 relative"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label="Interval progress"
            >
              <div
                className="absolute left-0 top-0 h-1 bg-slate-900 transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                }}
              />
            </div>

            <div className="px-5 py-4 border-b border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full border ${
                      isWorkInterval
                        ? "text-red-700 border-red-200 bg-red-50"
                        : "text-green-700 border-green-200 bg-green-50"
                    }`}
                  >
                    {isWorkInterval ? "Work" : "Break"}
                  </span>
                  {currentInterval && (
                    <span className="text-xs text-slate-500">
                      {currentInterval.durationMinutes}m
                    </span>
                  )}
                </div>
                <div className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50">
                  <span className="font-medium text-slate-700">Interval</span>
                  <span className="ml-2 font-semibold text-slate-900">
                    {currentIntervalIndex + 1}/{totalIntervals}
                  </span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="font-medium text-slate-700">Work</span>
                  <span className="ml-2 font-semibold text-slate-900">
                    {currentWorkNumber}/{workIntervals.length}
                  </span>
                </div>
              </div>

              <div className="text-center mb-2">
                {sessionComplete ? (
                  <div className="py-4">
                    <span className="text-4xl font-semibold text-slate-900">
                      Session Complete!
                    </span>
                  </div>
                ) : (
                  <span className="text-6xl font-semibold text-slate-900 font-mono tracking-tight">
                    {formatTime(timeLeft)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-center gap-3 p-4 bg-white relative">
              <button
                onClick={toggleTimer}
                className="px-6 py-2.5 rounded-md font-medium transition-colors duration-200 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white"
              >
                {isRunning ? "Pause" : sessionComplete ? "Restart" : "Start"}
              </button>
              <button
                onClick={cancelSession}
                className="border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-2.5 rounded-md font-medium transition-colors duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={skipInterval}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-50 transition-colors duration-200 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                disabled={sessionComplete}
                title="Skip to next interval"
              >
                <span className="text-xs font-normal">Skip</span>
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Upcoming intervals preview */}
        {!sessionComplete && currentIntervalIndex < flatIntervals.length - 1 && (
          <div className="w-full mb-6">
            <div className="text-xs text-slate-500 mb-2 font-medium">
              Coming up
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {flatIntervals
                .slice(currentIntervalIndex + 1, currentIntervalIndex + 9)
                .map((interval, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 text-xs rounded-md border ${
                      interval.type === "work"
                        ? "text-red-700 border-red-200 bg-red-50"
                        : "text-green-700 border-green-200 bg-green-50"
                    }`}
                  >
                    {interval.type === "work" ? "W" : "B"}{" "}
                    {interval.durationMinutes}m
                  </span>
                ))}
              {flatIntervals.length - currentIntervalIndex - 1 > 8 && (
                <span className="px-2 py-1 text-xs text-slate-400">
                  +{flatIntervals.length - currentIntervalIndex - 9} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Now playing indicator */}
        {videoQueue.length > 0 && (
          <div className="w-full mb-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium">Now playing:</span>
              <span className="truncate">
                {videoQueue[currentVideoIndex]?.title ||
                  videoQueue[currentVideoIndex]?.url ||
                  "Unknown"}
              </span>
              <span className="text-slate-300">
                ({currentVideoIndex + 1}/{videoQueue.length})
              </span>
            </div>
          </div>
        )}

        {/* YouTube player */}
        <div className="w-full relative overflow-hidden rounded-xl border border-slate-200 bg-black">
          {videoQueue.length === 0 ? (
            <div className="w-full h-64 flex flex-col items-center justify-center bg-slate-900 text-slate-300">
              <svg
                className="w-14 h-14 mb-3 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-center">No videos in queue</p>
            </div>
          ) : (
            <div
              className="aspect-video w-full h-full"
              ref={playerContainerRef}
            >
              <div id="yt-player-planned" className="w-full h-full"></div>
            </div>
          )}
        </div>
      </>
    );
  }

  // ==============================
  // PLANNING PHASE
  // ==============================
  return (
    <>
      {/* Interval builder */}
      <div className="w-full mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Plan Your Intervals
        </h2>

        {/* Add interval form */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="mb-1.5 text-sm font-medium text-slate-700 block">
                Work (min)
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={newWorkMinutes}
                onChange={(e) =>
                  setNewWorkMinutes(parseInt(e.target.value, 10) || 1)
                }
                className="p-2.5 border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 text-sm font-medium text-slate-700 block">
                Break (min)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={newBreakMinutes}
                onChange={(e) =>
                  setNewBreakMinutes(parseInt(e.target.value, 10) || 1)
                }
                className="p-2.5 border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 text-sm font-medium text-slate-700 block">
                Repeat
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={newRepeat}
                onChange={(e) =>
                  setNewRepeat(parseInt(e.target.value, 10) || 1)
                }
                className="p-2.5 border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
              />
            </div>
            <button
              onClick={addIntervalBlock}
              className="bg-slate-900 text-white px-4 py-2.5 rounded-md hover:bg-slate-800 transition-colors duration-200 font-medium cursor-pointer"
            >
              Add Interval
            </button>
          </div>

          {/* Preset row */}
          <div className="mt-3 flex gap-3 items-center">
            <div className="text-xs text-slate-500">Presets:</div>
            <div className="inline-flex items-center rounded-md border border-slate-300 p-0.5 bg-white">
              {[
                { w: 25, b: 5, r: 4, label: "25/5 ×4" },
                { w: 45, b: 15, r: 2, label: "45/15 ×2" },
                { w: 60, b: 30, r: 2, label: "60/30 ×2" },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setNewWorkMinutes(p.w);
                    setNewBreakMinutes(p.b);
                    setNewRepeat(p.r);
                  }}
                  className="text-slate-700 hover:bg-slate-50 px-3 py-1.5 text-sm rounded-[6px] cursor-pointer transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Interval blocks list */}
        {intervalBlocks.length > 0 && (
          <div className="space-y-2 mb-4">
            {intervalBlocks.map((block, index) => (
              <div
                key={block.id}
                className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-slate-400 w-6">
                    {index + 1}.
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs rounded-full border text-red-700 border-red-200 bg-red-50">
                      {block.workMinutes}m work
                    </span>
                    <span className="text-slate-400">/</span>
                    <span className="px-2 py-0.5 text-xs rounded-full border text-green-700 border-green-200 bg-green-50">
                      {block.breakMinutes}m break
                    </span>
                    <span className="text-slate-500 text-sm font-medium">
                      &times; {block.repeat}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveIntervalBlock(index, "up")}
                    disabled={index === 0}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer transition-colors"
                    title="Move up"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveIntervalBlock(index, "down")}
                    disabled={index === intervalBlocks.length - 1}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer transition-colors"
                    title="Move down"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeIntervalBlock(block.id)}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                    title="Remove"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {intervalBlocks.length > 0 && (
          <div className="text-sm text-slate-500">
            Total: {workIntervalCount} work session
            {workIntervalCount !== 1 ? "s" : ""}, ~
            {formatDuration(totalMinutes)}
          </div>
        )}

        {intervalBlocks.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            Add at least one interval block to plan your session.
          </div>
        )}
      </div>

      {/* Video playlist builder */}
      <div className="w-full mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Video Playlist
        </h2>

        <VideoInput
          videoHistory={videoHistory}
          onSubmit={handleVideoSubmit}
          onRemoveFromHistory={removeFromHistory}
          onClearHistory={clearHistory}
          onLoadFromHistory={handleLoadFromHistory}
          buttonLabel="Add to Queue"
          placeholder="Add a YouTube URL to the playlist"
          clearOnSubmit={true}
        />

        {/* Video queue */}
        {videoQueue.length > 0 ? (
          <div className="space-y-2 mb-3">
            {videoQueue.map((video, index) => (
              <div
                key={video.id + "-" + index}
                className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
              >
                <span className="text-sm font-mono text-slate-400 w-6 flex-shrink-0">
                  {index + 1}.
                </span>
                <div className="w-16 h-10 bg-slate-100 rounded overflow-hidden flex-shrink-0">
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt={video.title || "Thumbnail"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-slate-400"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {video.title || "Loading..."}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => moveVideoInQueue(index, "up")}
                    disabled={index === 0}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer transition-colors"
                    title="Move up"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveVideoInQueue(index, "down")}
                    disabled={index === videoQueue.length - 1}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer transition-colors"
                    title="Move down"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeVideoFromQueue(index)}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                    title="Remove"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400 text-sm border border-dashed border-slate-200 rounded-lg">
            Add videos above. They'll play in order, looping if the session
            outlasts the playlist.
          </div>
        )}
      </div>

      {/* Start session button */}
      <div className="w-full">
        <button
          onClick={startSession}
          disabled={intervalBlocks.length === 0}
          className="w-full bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition-colors duration-200 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-lg"
        >
          Start Session
          {intervalBlocks.length > 0 && (
            <span className="ml-2 font-normal text-slate-300">
              ({workIntervalCount} work session
              {workIntervalCount !== 1 ? "s" : ""}, ~
              {formatDuration(totalMinutes)})
            </span>
          )}
        </button>
      </div>

      {/* Instructions */}
      <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-200 w-full">
        <p className="text-slate-700">
          <span className="font-semibold">How to use:</span> Add interval
          blocks to define your work/break pattern (e.g. 2&times; 25/5 then
          3&times; 45/15). Optionally add YouTube videos to play during work.
          Hit Start Session and the timer will advance through each interval
          automatically.
        </p>
      </div>
    </>
  );
};

export default PlannedSession;
