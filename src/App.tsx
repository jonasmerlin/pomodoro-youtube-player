import React, { useState, useEffect, useRef, type ChangeEvent } from "react";

// Define YouTube player interface
interface YouTubePlayer {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState: () => number;
  setSize: (width: number, height: number) => void;
}

// Define YouTube event interface
interface YouTubeEvent {
  data: number;
  target: YouTubePlayer;
}

// Define YouTube API interface
interface YouTubeWindow extends Window {
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
      }
    ) => YouTubePlayer;
  };
  onYouTubeIframeAPIReady: () => void;
}

declare const window: YouTubeWindow;

const PomodoroYouTubePlayer: React.FC = () => {
  // State for Pomodoro settings
  const [workMinutes, setWorkMinutes] = useState<number>(25);
  const [breakMinutes, setBreakMinutes] = useState<number>(5);
  const [totalPomodoros, setTotalPomodoros] = useState<number>(4);
  const [currentPomodoro, setCurrentPomodoro] = useState<number>(0);

  // State for YouTube video
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoId, setVideoId] = useState<string>("");
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const programmaticChangeRef = useRef<boolean>(false); // Track if changes are app-initiated
  const isRunningRef = useRef<boolean>(false); // Track current timer state for event handlers

  // Timer state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isWorking, setIsWorking] = useState<boolean>(true);
  const [timeLeft, setTimeLeft] = useState<number>(workMinutes * 60);
  const [timerComplete, setTimerComplete] = useState<boolean>(false);
  const intervalRef = useRef<number | null>(null);

  // Timestamp refs for accurate timing
  const startTimeRef = useRef<number>(0);
  const endTimeRef = useRef<number>(0);

  // YouTube API loading state
  const [apiLoaded, setApiLoaded] = useState<boolean>(false);

  // Extract YouTube video ID from URL
  const extractVideoId = (url: string): string | null => {
    const regExp =
      /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[7].length === 11 ? match[7] : null;
  };

  // Function to resize player
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

  // Load YouTube API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setApiLoaded(true);
      };
    } else {
      setApiLoaded(true);
    }

    return () => {
      window.onYouTubeIframeAPIReady = () => {};
    };
  }, []);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      resizePlayer();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Visibility detection to resync timer
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && isRunning && !timerComplete) {
        // Recalculate endTime based on current time
        const now = Date.now();
        const remaining = endTimeRef.current - now;
        setTimeLeft(Math.max(0, Math.ceil(remaining / 1000)));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isRunning, timerComplete]);

  // Initialize or update YouTube player when video ID changes
  useEffect(() => {
    if (apiLoaded && videoId) {
      if (playerRef.current) {
        playerRef.current.loadVideoById(videoId);
        resizePlayer();
      } else {
        playerRef.current = new window.YT.Player("youtube-player", {
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
                // When user plays the video, start the Pomodoro timer
                if (event.data === 1 && !isRunningRef.current) {
                  setIsRunning(true);
                }

                // When user pauses the video, pause the Pomodoro timer
                if (event.data === 2 && isRunningRef.current) {
                  setIsRunning(false);
                }
              }
            },
          },
        });
      }
    }
  }, [apiLoaded, videoId]);

  // Control video playback based on timer state
  useEffect(() => {
    if (playerRef.current && playerRef.current.playVideo) {
      programmaticChangeRef.current = true;
      if (isWorking && isRunning) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
      // Reset flag after a short delay
      setTimeout(() => {
        programmaticChangeRef.current = false;
      }, 100);
    }
  }, [isWorking, isRunning]);

  // Timer logic with timestamp-based accuracy
  useEffect(() => {
    if (isRunning && !timerComplete) {
      // On start or resume, set start and end timestamps
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

          // Switch states at end
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
  }, [
    isRunning,
    isWorking,
    breakMinutes,
    workMinutes,
    currentPomodoro,
    totalPomodoros,
    timerComplete,
  ]);

  // Handle URL input
  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setVideoUrl(e.target.value);
  };

  // Handle URL submission
  const handleUrlSubmit = (): void => {
    const id = extractVideoId(videoUrl);
    if (id) {
      setVideoId(id);
    } else {
      alert("Invalid YouTube URL. Please enter a valid URL.");
    }
  };

  // Start/pause timer
  const toggleTimer = (): void => {
    if (timerComplete) {
      setIsWorking(true);
      setCurrentPomodoro(0);
      setTimeLeft(workMinutes * 60);
      setTimerComplete(false);
    }
    setIsRunning(!isRunning);
  };

  // Reset timer
  const resetTimer = (): void => {
    setIsRunning(false);
    setIsWorking(true);
    setCurrentPomodoro(0);
    setTimeLeft(workMinutes * 60);
    setTimerComplete(false);
  };

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // Update document title with time left
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

  const setPreset = (workMins: number, breakMins: number): void => {
    setWorkMinutes(workMins);
    setBreakMinutes(breakMins);

    // Update the current timer display if not running
    if (!isRunning) {
      if (isWorking) {
        setTimeLeft(workMins * 60);
      } else {
        setTimeLeft(breakMins * 60);
      }
    }
  };

  return (
    <div className="flex flex-col items-center p-8 max-w-5xl mx-auto my-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl">
      <h1 className="text-3xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">
        Pomodoro YouTube Player
      </h1>

      {/* Video URL input */}
      <div className="w-full mb-8">
        <div className="flex gap-3 bg-white p-2 rounded-lg shadow-sm">
          <input
            type="text"
            value={videoUrl}
            onChange={handleUrlChange}
            placeholder="Paste YouTube URL here"
            className="flex-1 p-3 bg-transparent outline-none text-gray-700"
          />
          <button
            onClick={handleUrlSubmit}
            className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-6 py-3 rounded-lg hover:shadow-md transition-all duration-300 font-medium cursor-pointer"
          >
            Load Video
          </button>
        </div>
      </div>

      {/* Pomodoro settings */}
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
        <div className="bg-white p-4 rounded-xl shadow-sm">
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
            className="p-3 border border-gray-200 rounded-lg w-full focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none transition-all duration-200"
            disabled={isRunning}
          />
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
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
            className="p-3 border border-gray-200 rounded-lg w-full focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none transition-all duration-200"
            disabled={isRunning}
          />
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
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
            className="p-3 border border-gray-200 rounded-lg w-full focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none transition-all duration-200"
            disabled={isRunning}
          />
        </div>
      </div>

      {/* Preset buttons - Updated section */}
      <div className="w-full mb-8">
        <div className="flex gap-2 flex-row justify-start items-center">
          <div className="text-xs text-gray-600">Common Timings:</div>
          <button
            onClick={() => setPreset(25, 5)}
            className="bg-white border border-indigo-200 text-indigo-700 px-3 py-1 text-sm rounded-md hover:bg-indigo-50 transition-colors duration-200 shadow-sm disabled:opacity-40 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
            disabled={isRunning}
          >
            25/5
          </button>
          <button
            onClick={() => setPreset(45, 15)}
            className="bg-white border border-indigo-200 text-indigo-700 px-3 py-1 text-sm rounded-md hover:bg-indigo-50 transition-colors duration-200 shadow-sm disabled:opacity-40 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
            disabled={isRunning}
          >
            45/15
          </button>
          <button
            onClick={() => setPreset(60, 30)}
            className="bg-white border border-indigo-200 text-indigo-700 px-3 py-1 text-sm rounded-md hover:bg-indigo-50 transition-colors duration-200 shadow-sm disabled:opacity-40 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
            disabled={isRunning}
          >
            60/30
          </button>
        </div>
      </div>

      {/* Timer display */}
      <div className="w-full mb-8">
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-violet-50 p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                <div
                  className={`w-3 h-3 rounded-full mr-2 ${
                    isWorking ? "bg-red-500" : "bg-green-500"
                  } animate-pulse`}
                ></div>
                <span
                  className={`font-medium ${
                    isWorking ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {isWorking ? "WORK SESSION" : "BREAK TIME"}
                </span>
              </div>
              <div className="bg-white px-4 py-2 rounded-full shadow-sm">
                <span className="font-medium text-gray-600">Pomodoro</span>
                <span className="ml-2 font-bold text-indigo-700">
                  {currentPomodoro + 1}/{totalPomodoros}
                </span>
              </div>
            </div>

            <div className="text-center mb-6">
              <span className="text-6xl font-bold text-gray-800 font-mono tracking-wider">
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>

          <div className="flex justify-center gap-4 p-4 bg-white">
            <button
              onClick={toggleTimer}
              className={`px-8 py-3 rounded-lg font-medium shadow-sm transition-all duration-300 cursor-pointer ${
                isRunning
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:shadow-md text-white"
              }`}
            >
              {isRunning ? "Pause" : timerComplete ? "Restart" : "Start"}
            </button>
            <button
              onClick={resetTimer}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-8 py-3 rounded-lg font-medium shadow-sm transition-all duration-300 disabled:opacity-50 cursor-pointer"
              disabled={!isRunning && timeLeft === workMinutes * 60}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* YouTube player */}
      <div className="w-full relative overflow-hidden rounded-2xl shadow-lg bg-black">
        {!videoId ? (
          <div className="w-full h-64 flex flex-col items-center justify-center bg-gradient-to-r from-gray-800 to-gray-900 text-gray-300">
            <svg
              className="w-16 h-16 mb-4 text-gray-400"
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
              ></path>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <p className="text-center">Enter a YouTube URL to load a video</p>
          </div>
        ) : (
          <div className="aspect-video w-full h-full" ref={playerContainerRef}>
            <div id="youtube-player" className="w-full h-full"></div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-8 p-4 bg-white rounded-lg shadow-sm border-l-4 border-indigo-500">
        <p className="text-gray-700">
          <span className="font-bold text-indigo-700">How to use:</span> Paste a
          YouTube music mix URL, configure your Pomodoro settings, and press
          Start. The music will play only during work sessions and pause during
          breaks.
        </p>
      </div>
    </div>
  );
};

export default PomodoroYouTubePlayer;