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

// Define video history item interface
interface VideoHistoryItem {
  id: string;
  url: string;
  title?: string;
  thumbnail?: string;
  addedAt: number;
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
      },
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
  const [videoHistory, setVideoHistory] = useState<VideoHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
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

  // Load video history from localStorage on component mount
  useEffect(() => {
    const savedHistory = localStorage.getItem("pomodoro-video-history");
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setVideoHistory(parsedHistory);
      } catch (error) {
        console.error(
          "Failed to parse video history from localStorage:",
          error,
        );
      }
    }
  }, []);

  // Save video history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(
      "pomodoro-video-history",
      JSON.stringify(videoHistory),
    );
  }, [videoHistory]);

  // Function to fetch video title and thumbnail from YouTube Data API
  const fetchVideoData = async (
    videoId: string,
  ): Promise<{ title: string; thumbnail: string }> => {
    try {
      // Using the oEmbed API which doesn't require an API key
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
  };

  // Function to add video to history
  const addToHistory = async (id: string, url: string) => {
    const existingIndex = videoHistory.findIndex((item) => item.id === id);

    if (existingIndex !== -1) {
      // Move existing video to top
      const updatedHistory = [...videoHistory];
      const [existingItem] = updatedHistory.splice(existingIndex, 1);
      existingItem.addedAt = Date.now();
      updatedHistory.unshift(existingItem);
      setVideoHistory(updatedHistory);
    } else {
      // Fetch video title and thumbnail
      const { title, thumbnail } = await fetchVideoData(id);

      // Add new video to top
      const newItem: VideoHistoryItem = {
        id,
        url,
        title,
        thumbnail,
        addedAt: Date.now(),
      };
      setVideoHistory((prev) => [newItem, ...prev.slice(0, 19)]); // Keep only last 20 items
    }
  };

  // Function to remove video from history
  const removeFromHistory = (id: string) => {
    setVideoHistory((prev) => prev.filter((item) => item.id !== id));
  };

  // Function to clear all history
  const clearHistory = () => {
    setVideoHistory([]);
  };

  // Function to load video from history
  const loadFromHistory = async (item: VideoHistoryItem) => {
    setVideoUrl(item.url);
    setVideoId(item.id);
    setShowHistory(false);
    await addToHistory(item.id, item.url);
  };

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
  const handleUrlSubmit = async (): Promise<void> => {
    const id = extractVideoId(videoUrl);
    if (id) {
      setVideoId(id);
      await addToHistory(id, videoUrl);
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

  // Skip current session
  const skipSession = (): void => {
    if (timerComplete) return;

    // Clear current timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isWorking) {
      // Currently working, skip to break
      const nextPomodoro = currentPomodoro + 1;
      if (nextPomodoro >= totalPomodoros) {
        setTimerComplete(true);
        setIsRunning(false);
      } else {
        setIsWorking(false);
        setCurrentPomodoro(nextPomodoro);
        setTimeLeft(breakMinutes * 60);
        // Reset timer timestamps for next session
        startTimeRef.current = Date.now();
        endTimeRef.current = startTimeRef.current + breakMinutes * 60 * 1000;
      }
    } else {
      // Currently on break, skip to next work session
      setIsWorking(true);
      setTimeLeft(workMinutes * 60);
      // Reset timer timestamps for next session
      startTimeRef.current = Date.now();
      endTimeRef.current = startTimeRef.current + workMinutes * 60 * 1000;
    }
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

  // Progress info for current session
  const sessionTotalSeconds = isWorking ? workMinutes * 60 : breakMinutes * 60;
  const progress =
    sessionTotalSeconds > 0
      ? Math.min(1, Math.max(0, 1 - timeLeft / sessionTotalSeconds))
      : 0;

  return (
    <div className="flex flex-col items-center px-6 py-8 max-w-3xl mx-auto my-8">
      <h1 className="text-2xl font-semibold text-slate-900">
        Pomodoro YouTube Player
      </h1>
      <p className="mt-2 mb-6 text-sm text-slate-600 text-center">
        Minimal focus timer that plays your chosen YouTube video only while you
        work.
      </p>

      {/* Video URL input */}
      <div className="w-full mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={videoUrl}
            onChange={handleUrlChange}
            placeholder="Paste YouTube URL here"
            className="flex-1 px-3.5 py-2.5 bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          />
          <button
            onClick={handleUrlSubmit}
            className="bg-slate-900 text-white px-4 py-2.5 rounded-md hover:bg-slate-800 transition-colors duration-200 font-medium cursor-pointer"
          >
            Load Video
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-3 py-2.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors duration-200 font-medium cursor-pointer"
            title="Show video history"
            aria-expanded={showHistory}
            aria-controls="history-panel"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
          </button>
        </div>

        {/* Video History */}
        {showHistory && (
          <div
            id="history-panel"
            className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-slate-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                      Video History
                    </h3>
                    <p className="text-xs text-slate-500">
                      {videoHistory.length} video
                      {videoHistory.length !== 1 ? "s" : ""} saved
                    </p>
                  </div>
                </div>
                {videoHistory.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="px-3 py-1.5 bg-white text-red-600 text-sm font-medium rounded-md border border-slate-200 hover:border-red-200 hover:bg-red-50 transition-colors duration-200 cursor-pointer"
                  >
                    <span className="flex items-center space-x-2">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      <span>Clear All</span>
                    </span>
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {videoHistory.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl mx-auto mb-3 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h4 className="text-base font-medium text-slate-700 mb-1">
                    No videos yet
                  </h4>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    Add a YouTube URL above. Recently played videos will appear here.
                  </p>
                </div>
              ) : (
                <div className="p-2">
                  {videoHistory.map((item) => (
                    <div
                      key={item.id}
                      className={`group relative bg-white rounded-lg p-3 mb-2 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer`}
                      onClick={() => loadFromHistory(item)}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="relative flex-shrink-0">
                          <div className="w-20 h-12 bg-slate-100 rounded-md overflow-hidden">
                            {item.thumbnail ? (
                              <img
                                src={item.thumbnail}
                                alt={item.title || "Video thumbnail"}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`;
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                                <svg
                                  className="w-5 h-5 text-slate-500"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between">
                            <h4 className="text-sm font-medium text-slate-900 leading-tight line-clamp-2">
                              {item.title || (
                                <span className="text-slate-500 italic">
                                  Loading title...
                                </span>
                              )}
                            </h4>
                          </div>

                          <div className="flex items-center space-x-2 text-xs text-slate-500">
                            <div className="flex items-center space-x-1">
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
                                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.1a3 3 0 105.656-5.656l-1.102 1.1a3 3 0 01-5.656 0l4-4z"
                                />
                              </svg>
                              <span className="truncate max-w-32 lg:max-w-48">
                                {item.url}
                              </span>
                            </div>
                            <span className="text-slate-300">•</span>
                            <div className="flex items-center space-x-1">
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
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              <span>
                                {new Date(item.addedAt).toLocaleDateString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromHistory(item.id);
                          }}
                          className="flex-shrink-0 w-8 h-8 border border-transparent hover:border-red-200 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition-colors duration-150 cursor-pointer flex items-center justify-center"
                          title="Remove from history"
                          aria-label={`Remove ${item.title ?? 'video'} from history`}
                        >
                          <svg
                            className="w-4 h-4"
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
            </div>
          </div>
        )}
      </div>

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

      {/* Preset buttons - segmented control */}
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
              className={`px-6 py-2.5 rounded-md font-medium transition-colors duration-200 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white`}
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
              title={isWorking ? "Skip to break" : "Skip to next work session"}
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
      <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-slate-700">
          <span className="font-semibold">How to use:</span> Paste a YouTube music
          mix URL, configure your Pomodoro settings, and press Start. The music
          plays during work and pauses for breaks.
        </p>
      </div>
    </div>
  );
};

export default PomodoroYouTubePlayer;
