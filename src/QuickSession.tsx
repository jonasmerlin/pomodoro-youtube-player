import React, { useState, useEffect, useRef, type ChangeEvent } from "react";
import type { YouTubePlayer, YouTubeWindow, VideoHistoryItem } from "./types";
import { formatTime, loadYouTubeApi } from "./utils";
import { useVideoHistory } from "./useVideoHistory";
import VideoInput from "./components/VideoInput";

declare const window: YouTubeWindow;

// QuickSession is the original "single video + pomodoro timer" mode.
// It's essentially the same code that was in the monolithic App.tsx,
// just extracted to its own component and wired to the shared VideoInput
// and useVideoHistory hook. Behavior is identical to the original.
const QuickSession: React.FC = () => {
  // --- Pomodoro settings ---
  const [workMinutes, setWorkMinutes] = useState<number>(25);
  const [breakMinutes, setBreakMinutes] = useState<number>(5);
  const [totalPomodoros, setTotalPomodoros] = useState<number>(4);
  const [currentPomodoro, setCurrentPomodoro] = useState<number>(0);

  // --- YouTube video ---
  const [videoId, setVideoId] = useState<string>("");
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether a play/pause change was initiated by the app (not the user
  // clicking the YouTube controls). Prevents feedback loops where the app
  // pauses the video, which triggers onStateChange, which pauses the timer, etc.
  const programmaticChangeRef = useRef<boolean>(false);
  // Mirrors `isRunning` state into a ref so the YouTube onStateChange handler
  // (which captures a stale closure) can read the current value.
  const isRunningRef = useRef<boolean>(false);

  // --- Timer state ---
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isWorking, setIsWorking] = useState<boolean>(true);
  const [timeLeft, setTimeLeft] = useState<number>(workMinutes * 60);
  const [timerComplete, setTimerComplete] = useState<boolean>(false);
  const intervalRef = useRef<number | null>(null);
  // Timestamp-based timing: we record when the current interval started and
  // when it should end. Each tick computes remaining = endTime - now, which
  // is immune to setInterval drift and browser throttling.
  const startTimeRef = useRef<number>(0);
  const endTimeRef = useRef<number>(0);

  // --- YouTube API ---
  const [apiLoaded, setApiLoaded] = useState<boolean>(false);

  // --- Video history (shared with the Planned Session tab) ---
  const { videoHistory, addToHistory, removeFromHistory, clearHistory } =
    useVideoHistory();

  // Load YouTube IFrame API on mount
  useEffect(() => {
    loadYouTubeApi().then(() => setApiLoaded(true));
  }, []);

  // Keep isRunningRef in sync with isRunning state
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // Resize the YouTube player iframe to fill its container.
  // Called on window resize and after the player is created.
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

  // Handle window resize
  useEffect(() => {
    const handleResize = () => resizePlayer();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Visibility detection: when the user switches back to this tab,
  // recalculate timeLeft from the end timestamp to correct for browser
  // throttling of setInterval in background tabs.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && isRunning && !timerComplete) {
        const now = Date.now();
        const remaining = endTimeRef.current - now;
        setTimeLeft(Math.max(0, Math.ceil(remaining / 1000)));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isRunning, timerComplete]);

  // Initialize or update YouTube player when video ID changes.
  // If a player already exists, just load the new video into it.
  // Otherwise, create a new YT.Player on the #yt-player-quick div.
  useEffect(() => {
    if (apiLoaded && videoId) {
      if (playerRef.current) {
        playerRef.current.loadVideoById(videoId);
        resizePlayer();
      } else {
        playerRef.current = new window.YT.Player("yt-player-quick", {
          videoId: videoId,
          playerVars: {
            autoplay: isWorking && isRunning ? 1 : 0,
            controls: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              resizePlayer();
            },
            onStateChange: (event) => {
              // Loop video when it ends (regardless of timer state)
              if (event.data === 0) {
                event.target.playVideo();
              }

              // Only sync with controls if change wasn't initiated by the app
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
      }
    }
    // We only want to create/update the player when apiLoaded or videoId changes,
    // not on timer state changes — hence isRunning/isWorking are omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiLoaded, videoId]);

  // Sync video playback with timer state:
  // play during work, pause during break or when timer is paused.
  useEffect(() => {
    if (playerRef.current && playerRef.current.playVideo) {
      programmaticChangeRef.current = true;
      if (isWorking && isRunning) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
      setTimeout(() => {
        programmaticChangeRef.current = false;
      }, 100);
    }
  }, [isWorking, isRunning]);

  // Timer logic with timestamp-based accuracy.
  // On start/resume, captures start and end timestamps. Each tick computes
  // remaining time from the end timestamp, so drift doesn't accumulate.
  // When the interval completes, it either switches work<->break or
  // marks the session complete if all pomodoros are done.
  useEffect(() => {
    if (isRunning && !timerComplete) {
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

          if (isWorking) {
            const nextPomodoro = currentPomodoro + 1;
            if (nextPomodoro >= totalPomodoros) {
              setTimerComplete(true);
              setIsRunning(false);
            } else {
              setIsWorking(false);
              setCurrentPomodoro(nextPomodoro);
              setTimeLeft(breakMinutes * 60);
            }
          } else {
            setIsWorking(true);
            setTimeLeft(workMinutes * 60);
          }
          return;
        }
        setTimeLeft(Math.ceil(remainingMs / 1000));
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isRunning,
    isWorking,
    breakMinutes,
    workMinutes,
    currentPomodoro,
    totalPomodoros,
    timerComplete,
    // timeLeft is intentionally omitted — including it would restart the
    // interval on every tick, defeating the timestamp-based approach.
  ]);

  // --- Video input handlers ---

  const handleVideoSubmit = async (id: string, url: string) => {
    setVideoId(id);
    await addToHistory(id, url);
  };

  const handleLoadFromHistory = async (item: VideoHistoryItem) => {
    setVideoId(item.id);
    await addToHistory(item.id, item.url);
  };

  // --- Timer controls ---

  const toggleTimer = (): void => {
    if (timerComplete) {
      setIsWorking(true);
      setCurrentPomodoro(0);
      setTimeLeft(workMinutes * 60);
      setTimerComplete(false);
    }
    setIsRunning(!isRunning);
  };

  const resetTimer = (): void => {
    setIsRunning(false);
    setIsWorking(true);
    setCurrentPomodoro(0);
    setTimeLeft(workMinutes * 60);
    setTimerComplete(false);
  };

  const skipSession = (): void => {
    if (timerComplete) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isWorking) {
      const nextPomodoro = currentPomodoro + 1;
      if (nextPomodoro >= totalPomodoros) {
        setTimerComplete(true);
        setIsRunning(false);
      } else {
        setIsWorking(false);
        setCurrentPomodoro(nextPomodoro);
        setTimeLeft(breakMinutes * 60);
        startTimeRef.current = Date.now();
        endTimeRef.current = startTimeRef.current + breakMinutes * 60 * 1000;
      }
    } else {
      setIsWorking(true);
      setTimeLeft(workMinutes * 60);
      startTimeRef.current = Date.now();
      endTimeRef.current = startTimeRef.current + workMinutes * 60 * 1000;
    }
  };

  // --- Document title ---

  useEffect(() => {
    const formattedTime = formatTime(timeLeft);
    const status = isWorking ? "Work" : "Break";

    if (timerComplete) {
      document.title = "Pomodoro Complete";
    } else if (isRunning) {
      document.title = `${formattedTime} - ${status} | Pomodoro`;
    } else {
      document.title = "Pomodoro YouTube Player";
    }

    return () => {
      document.title = "Pomodoro YouTube Player";
    };
  }, [timeLeft, isWorking, isRunning, timerComplete]);

  // --- Preset helper ---

  const setPreset = (workMins: number, breakMins: number): void => {
    setWorkMinutes(workMins);
    setBreakMinutes(breakMins);
    if (!isRunning) {
      if (isWorking) {
        setTimeLeft(workMins * 60);
      } else {
        setTimeLeft(breakMins * 60);
      }
    }
  };

  // --- Derived values ---

  const sessionTotalSeconds = isWorking ? workMinutes * 60 : breakMinutes * 60;
  const progress =
    sessionTotalSeconds > 0
      ? Math.min(1, Math.max(0, 1 - timeLeft / sessionTotalSeconds))
      : 0;

  // --- Render ---

  return (
    <>
      {/* Video URL input */}
      <VideoInput
        videoHistory={videoHistory}
        onSubmit={handleVideoSubmit}
        onRemoveFromHistory={removeFromHistory}
        onClearHistory={clearHistory}
        onLoadFromHistory={handleLoadFromHistory}
        buttonLabel="Load Video"
      />

      {/* Pomodoro settings */}
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <label className="mb-2 font-medium text-gray-700 block">
            Work Minutes
          </label>
          <input
            type="number"
            min="1"
            max="60"
            value={workMinutes}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setWorkMinutes(parseInt(e.target.value, 10));
              if (!isRunning && isWorking) {
                setTimeLeft(parseInt(e.target.value, 10) * 60);
              }
            }}
            className="p-3 border border-gray-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none transition-all duration-200"
            disabled={isRunning}
          />
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <label className="mb-2 font-medium text-gray-700 block">
            Break Minutes
          </label>
          <input
            type="number"
            min="1"
            max="30"
            value={breakMinutes}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setBreakMinutes(parseInt(e.target.value, 10));
              if (!isRunning && !isWorking) {
                setTimeLeft(parseInt(e.target.value, 10) * 60);
              }
            }}
            className="p-3 border border-gray-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none transition-all duration-200"
            disabled={isRunning}
          />
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <label className="mb-2 font-medium text-gray-700 block">
            Number of Pomodoros
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={totalPomodoros}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setTotalPomodoros(parseInt(e.target.value, 10))
            }
            className="p-3 border border-gray-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none transition-all duration-200"
            disabled={isRunning}
          />
        </div>
      </div>

      {/* Preset buttons */}
      <div className="w-full mb-8">
        <div className="flex gap-3 flex-row items-center">
          <div className="text-xs text-slate-600">Common:</div>
          <div className="inline-flex items-center rounded-md border border-slate-300 p-0.5 bg-white">
            {[
              { w: 25, b: 5, label: "25/5" },
              { w: 45, b: 15, label: "45/15" },
              { w: 60, b: 30, label: "60/30" },
            ].map((p) => {
              const active = workMinutes === p.w && breakMinutes === p.b;
              return (
                <button
                  key={p.label}
                  onClick={() => setPreset(p.w, p.b)}
                  className={`${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  } px-3 py-1.5 text-sm rounded-[6px] cursor-pointer transition-colors`}
                  disabled={isRunning}
                  aria-pressed={active}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

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
            aria-label="Session progress"
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
              <div className="flex items-center">
                <span
                  className={`px-2 py-0.5 text-xs rounded-full border ${
                    isWorking
                      ? "text-red-700 border-red-200 bg-red-50"
                      : "text-green-700 border-green-200 bg-green-50"
                  }`}
                >
                  {isWorking ? "Work" : "Break"}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50">
                <span className="font-medium text-slate-700">Pomodoro</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {currentPomodoro + 1}/{totalPomodoros}
                </span>
              </div>
            </div>

            <div className="text-center mb-2">
              <span className="text-6xl font-semibold text-slate-900 font-mono tracking-tight">
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>

          <div className="flex justify-center gap-3 p-4 bg-white relative">
            <button
              onClick={toggleTimer}
              className="px-6 py-2.5 rounded-md font-medium transition-colors duration-200 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white"
            >
              {isRunning ? "Pause" : timerComplete ? "Restart" : "Start"}
            </button>
            <button
              onClick={resetTimer}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-2.5 rounded-md font-medium transition-colors duration-200 disabled:opacity-50 cursor-pointer"
              disabled={!isRunning && timeLeft === workMinutes * 60}
            >
              Reset
            </button>
            <button
              onClick={skipSession}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-50 transition-colors duration-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 cursor-pointer flex items-center gap-1"
              disabled={timerComplete}
              title={
                isWorking ? "Skip to break" : "Skip to next work session"
              }
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

      {/* YouTube player */}
      <div className="w-full relative overflow-hidden rounded-xl border border-slate-200 bg-black">
        {!videoId ? (
          <div className="w-full h-64 flex flex-col items-center justify-center bg-slate-900 text-slate-300">
            <svg
              className="w-14 h-14 mb-3 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
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
            <p className="text-center">
              Enter a YouTube URL to load a video
            </p>
          </div>
        ) : (
          <div
            className="aspect-video w-full h-full"
            ref={playerContainerRef}
          >
            <div id="yt-player-quick" className="w-full h-full"></div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-slate-700">
          <span className="font-semibold">How to use:</span> Paste a YouTube
          music mix URL, configure your Pomodoro settings, and press Start.
          The music plays during work and pauses for breaks.
        </p>
      </div>
    </>
  );
};

export default QuickSession;
