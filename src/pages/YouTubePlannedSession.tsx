import React, { useState, useEffect, useRef } from "react";
import type {
  YouTubePlayer,
  YouTubeWindow,
  VideoHistoryItem,
  IntervalBlock,
  QueuedVideo,
} from "../types";
import {
  formatDuration,
  flattenIntervals,
  generateId,
  fetchVideoData,
  loadYouTubeApi,
} from "../utils";
import { usePomodoro } from "../hooks/usePomodoro";
import { useVideoHistory } from "../useVideoHistory";
import VideoInput from "../components/VideoInput";
import TimerDisplay from "../components/TimerDisplay";

declare const window: YouTubeWindow;

// =============================================================================
// YouTubePlannedSession — Multi-block interval planner with video playlist
// =============================================================================
//
// Two phases:
// 1. Planning — build interval blocks + video queue, then start
// 2. Running — timer counts down through flattened intervals, videos play
//
// The timer logic is handled by usePomodoro in "planned" mode. The video
// playlist management (auto-advance, loop) is YouTube-specific and stays here.

const YouTubePlannedSession: React.FC = () => {
  // ---- Phase ----
  const [phase, setPhase] = useState<"planning" | "running">("planning");

  // ---- Interval builder (planning phase) ----
  const [intervalBlocks, setIntervalBlocks] = useState<IntervalBlock[]>([]);
  const [newWorkMinutes, setNewWorkMinutes] = useState<number>(25);
  const [newBreakMinutes, setNewBreakMinutes] = useState<number>(5);
  const [newRepeat, setNewRepeat] = useState<number>(2);

  // ---- Video queue (planning phase) ----
  const [videoQueue, setVideoQueue] = useState<QueuedVideo[]>([]);

  // ---- Pomodoro timer (planned mode) ----
  // We pass an empty intervals array during planning, and the real flattened
  // intervals when the user starts the session.
  const pom = usePomodoro({
    mode: "planned",
    provider: null, // We handle video sync manually for the playlist
    intervals: [],
    appTitle: "Pomodoro YouTube Player",
  });

  // ---- YouTube player ----
  const [apiLoaded, setApiLoaded] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const programmaticChangeRef = useRef(false);
  const isRunningRef = useRef(false);
  const currentVideoIndexRef = useRef(0);
  const videoQueueRef = useRef<QueuedVideo[]>([]);

  // ---- Video history ----
  const { videoHistory, addToHistory, removeFromHistory, clearHistory } =
    useVideoHistory();

  // ---- YouTube API loading ----
  useEffect(() => {
    loadYouTubeApi().then(() => setApiLoaded(true));
  }, []);

  // Keep refs in sync
  useEffect(() => { isRunningRef.current = pom.isRunning; }, [pom.isRunning]);
  useEffect(() => { currentVideoIndexRef.current = currentVideoIndex; }, [currentVideoIndex]);
  useEffect(() => { videoQueueRef.current = videoQueue; }, [videoQueue]);

  // ---- Player resize ----
  const resizePlayer = () => {
    if (playerRef.current?.setSize && playerContainerRef.current) {
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

  // ---- Create YouTube player when running phase starts ----
  useEffect(() => {
    if (phase !== "running" || !apiLoaded || videoQueue.length === 0) return;

    const firstVideoId = videoQueue[0].id;

    if (playerRef.current) {
      playerRef.current.loadVideoById(firstVideoId);
      resizePlayer();
    } else {
      const timeout = setTimeout(() => {
        playerRef.current = new window.YT.Player("yt-player-planned", {
          videoId: firstVideoId,
          playerVars: { autoplay: 0, controls: 1, rel: 0 },
          events: {
            onReady: () => resizePlayer(),
            onStateChange: (event) => {
              // Auto-advance playlist when video ends
              if (event.data === 0) {
                const queue = videoQueueRef.current;
                if (queue.length > 0) {
                  const nextIdx = (currentVideoIndexRef.current + 1) % queue.length;
                  setCurrentVideoIndex(nextIdx);
                  event.target.loadVideoById(queue[nextIdx].id);
                }
              }
              // Bidirectional sync with timer
              if (!programmaticChangeRef.current) {
                if (event.data === 1 && !isRunningRef.current) {
                  pom.toggleTimer();
                }
                if (event.data === 2 && isRunningRef.current) {
                  pom.toggleTimer();
                }
              }
            },
          },
        });
      }, 50);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, apiLoaded]);

  // ---- Sync video playback with timer state ----
  const isWorkInterval = pom.currentInterval?.type === "work";

  useEffect(() => {
    if (phase !== "running") return;
    if (playerRef.current?.playVideo) {
      programmaticChangeRef.current = true;
      if (isWorkInterval && pom.isRunning) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
      setTimeout(() => { programmaticChangeRef.current = false; }, 100);
    }
  }, [isWorkInterval, pom.isRunning, phase]);

  // ---- Interval block management ----

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
      [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
      return newBlocks;
    });
  };

  // ---- Video queue management ----

  const addVideoToQueue = async (videoId: string, url: string) => {
    const { title, thumbnail } = await fetchVideoData(videoId);
    setVideoQueue((prev) => [...prev, { id: videoId, url, title, thumbnail }]);
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
      [newQueue[index], newQueue[targetIndex]] = [newQueue[targetIndex], newQueue[index]];
      return newQueue;
    });
  };

  const handleVideoSubmit = async (videoId: string, url: string) => {
    await addVideoToQueue(videoId, url);
  };

  const handleLoadFromHistory = async (item: VideoHistoryItem) => {
    await addVideoToQueue(item.id, item.url);
  };

  // ---- Start session ----

  const startSession = () => {
    if (intervalBlocks.length === 0) return;
    const flat = flattenIntervals(intervalBlocks);
    pom.startPlannedSession(flat);
    setCurrentVideoIndex(0);
    setPhase("running");
  };

  // ---- Cancel session ----

  const handleCancelSession = () => {
    pom.cancelPlannedSession();
    playerRef.current = null;
    setPhase("planning");
  };

  // ---- Planning phase summary ----
  const flat = flattenIntervals(intervalBlocks);
  const workIntervalCount = flat.filter((i) => i.type === "work").length;
  const totalMinutes = flat.reduce((sum, i) => sum + i.durationMinutes, 0);

  // ==============================
  // RUNNING PHASE
  // ==============================
  if (phase === "running") {
    const totalIntervals = pom.flatIntervals.length;
    const workIntervals = pom.flatIntervals.filter((i) => i.type === "work");
    const currentWorkNumber = pom.isWorking
      ? pom.flatIntervals
          .slice(0, pom.currentIntervalIndex + 1)
          .filter((i) => i.type === "work").length
      : pom.flatIntervals
          .slice(0, pom.currentIntervalIndex)
          .filter((i) => i.type === "work").length;

    return (
      <>
        {/* Timer display */}
        <TimerDisplay
          timeLeft={pom.timeLeft}
          isRunning={pom.isRunning}
          isWorking={pom.isWorking}
          timerComplete={pom.timerComplete}
          progress={pom.progress}
          currentPomodoro={0}
          totalPomodoros={0}
          plannedMode={true}
          currentIntervalIndex={pom.currentIntervalIndex}
          totalIntervals={totalIntervals}
          currentWorkNumber={currentWorkNumber}
          totalWorkIntervals={workIntervals.length}
          intervalDurationMinutes={pom.currentInterval?.durationMinutes}
          onToggleTimer={pom.toggleTimer}
          onResetTimer={pom.resetTimer}
          onSkipSession={pom.skipSession}
          onCancelSession={handleCancelSession}
          completeText="Session Complete!"
        />

        {/* Upcoming intervals preview */}
        {!pom.timerComplete && pom.currentIntervalIndex < pom.flatIntervals.length - 1 && (
          <div className="w-full mb-6">
            <div className="text-xs text-slate-500 mb-2 font-medium">Coming up</div>
            <div className="flex gap-1.5 flex-wrap">
              {pom.flatIntervals
                .slice(pom.currentIntervalIndex + 1, pom.currentIntervalIndex + 9)
                .map((interval, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 text-xs rounded-md border ${
                      interval.type === "work"
                        ? "text-red-700 border-red-200 bg-red-50"
                        : "text-green-700 border-green-200 bg-green-50"
                    }`}
                  >
                    {interval.type === "work" ? "W" : "B"} {interval.durationMinutes}m
                  </span>
                ))}
              {pom.flatIntervals.length - pom.currentIntervalIndex - 1 > 8 && (
                <span className="px-2 py-1 text-xs text-slate-400">
                  +{pom.flatIntervals.length - pom.currentIntervalIndex - 9} more
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
              <svg className="w-14 h-14 mb-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-center">No videos in queue</p>
            </div>
          ) : (
            <div className="aspect-video w-full h-full" ref={playerContainerRef}>
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
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Plan Your Intervals</h2>

        {/* Add interval form */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="mb-1.5 text-sm font-medium text-slate-700 block">Work (min)</label>
              <input type="number" min="1" max="120" value={newWorkMinutes}
                onChange={(e) => setNewWorkMinutes(parseInt(e.target.value, 10) || 1)}
                className="p-2.5 border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 text-sm font-medium text-slate-700 block">Break (min)</label>
              <input type="number" min="1" max="60" value={newBreakMinutes}
                onChange={(e) => setNewBreakMinutes(parseInt(e.target.value, 10) || 1)}
                className="p-2.5 border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 text-sm font-medium text-slate-700 block">Repeat</label>
              <input type="number" min="1" max="20" value={newRepeat}
                onChange={(e) => setNewRepeat(parseInt(e.target.value, 10) || 1)}
                className="p-2.5 border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
              />
            </div>
            <button onClick={addIntervalBlock}
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
                <button key={p.label}
                  onClick={() => { setNewWorkMinutes(p.w); setNewBreakMinutes(p.b); setNewRepeat(p.r); }}
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
              <div key={block.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-slate-400 w-6">{index + 1}.</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs rounded-full border text-red-700 border-red-200 bg-red-50">{block.workMinutes}m work</span>
                    <span className="text-slate-400">/</span>
                    <span className="px-2 py-0.5 text-xs rounded-full border text-green-700 border-green-200 bg-green-50">{block.breakMinutes}m break</span>
                    <span className="text-slate-500 text-sm font-medium">&times; {block.repeat}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveIntervalBlock(index, "up")} disabled={index === 0}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer transition-colors" title="Move up">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button onClick={() => moveIntervalBlock(index, "down")} disabled={index === intervalBlocks.length - 1}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer transition-colors" title="Move down">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <button onClick={() => removeIntervalBlock(block.id)}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors" title="Remove">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {intervalBlocks.length > 0 && (
          <div className="text-sm text-slate-500">
            Total: {workIntervalCount} work session{workIntervalCount !== 1 ? "s" : ""}, ~{formatDuration(totalMinutes)}
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
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Video Playlist</h2>

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
              <div key={video.id + "-" + index} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
                <span className="text-sm font-mono text-slate-400 w-6 flex-shrink-0">{index + 1}.</span>
                <div className="w-16 h-10 bg-slate-100 rounded overflow-hidden flex-shrink-0">
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt={video.title || "Thumbnail"} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{video.title || "Loading..."}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => moveVideoInQueue(index, "up")} disabled={index === 0}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer transition-colors" title="Move up">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button onClick={() => moveVideoInQueue(index, "down")} disabled={index === videoQueue.length - 1}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer transition-colors" title="Move down">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <button onClick={() => removeVideoFromQueue(index)}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors" title="Remove">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400 text-sm border border-dashed border-slate-200 rounded-lg">
            Add videos above. They'll play in order, looping if the session outlasts the playlist.
          </div>
        )}
      </div>

      {/* Start session button */}
      <div className="w-full">
        <button onClick={startSession} disabled={intervalBlocks.length === 0}
          className="w-full bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition-colors duration-200 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-lg"
        >
          Start Session
          {intervalBlocks.length > 0 && (
            <span className="ml-2 font-normal text-slate-300">
              ({workIntervalCount} work session{workIntervalCount !== 1 ? "s" : ""}, ~{formatDuration(totalMinutes)})
            </span>
          )}
        </button>
      </div>

      {/* Instructions */}
      <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-200 w-full">
        <p className="text-slate-700">
          <span className="font-semibold">How to use:</span> Add interval blocks to define your work/break pattern
          (e.g. 2&times; 25/5 then 3&times; 45/15). Optionally add YouTube videos to play during work.
          Hit Start Session and the timer will advance through each interval automatically.
        </p>
      </div>
    </>
  );
};

export default YouTubePlannedSession;
