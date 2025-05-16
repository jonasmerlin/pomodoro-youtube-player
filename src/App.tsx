import React, { useState, useEffect, useRef, type ChangeEvent } from 'react';

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
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoId, setVideoId] = useState<string>('');
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Timer state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isWorking, setIsWorking] = useState<boolean>(true);
  const [timeLeft, setTimeLeft] = useState<number>(workMinutes * 60);
  const [timerComplete, setTimerComplete] = useState<boolean>(false);
  const intervalRef = useRef<number | null>(null);
  
  // YouTube API loading state
  const [apiLoaded, setApiLoaded] = useState<boolean>(false);
  
  // Extract YouTube video ID from URL
  const extractVideoId = (url: string): string | null => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };
  
  // Function to resize player
  const resizePlayer = () => {
    if (playerRef.current && playerRef.current.setSize && playerContainerRef.current) {
      const width = playerContainerRef.current.clientWidth;
      const height = playerContainerRef.current.clientHeight;
      playerRef.current.setSize(width, height);
    }
  };
  
  // Load YouTube API
  useEffect(() => {
    // Load YouTube API if not already loaded
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
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
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      resizePlayer();
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Initialize or update YouTube player when video ID changes
  useEffect(() => {
    if (apiLoaded && videoId) {
      if (playerRef.current) {
        playerRef.current.loadVideoById(videoId);
        resizePlayer();
      } else {
        // Create player without specific dimensions - will size to container
        playerRef.current = new window.YT.Player('youtube-player', {
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
              // If video ends (state = 0) and we're in a work session, restart it
              if (event.data === 0 && isWorking && isRunning) {
                event.target.playVideo();
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
      if (isWorking && isRunning) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    }
  }, [isWorking, isRunning]);
  
  // Timer logic
  useEffect(() => {
    if (isRunning && !timerComplete) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            if (!intervalRef.current) return 0;

            clearInterval(intervalRef.current);
            
            // If we're working, switch to break (or next pomodoro)
            if (isWorking) {
              const nextPomodoro = currentPomodoro + 1;
              
              // Check if we've completed all pomodoros
              if (nextPomodoro >= totalPomodoros) {
                setTimerComplete(true);
                setIsRunning(false);
                return 0;
              }
              
              setIsWorking(false);
              setCurrentPomodoro(nextPomodoro);
              return breakMinutes * 60;
            } else {
              // If we're on break, switch back to work
              setIsWorking(true);
              return workMinutes * 60;
            }
          }
          return prevTime - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isWorking, timeLeft, breakMinutes, workMinutes, currentPomodoro, totalPomodoros, timerComplete]);
  
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
      alert('Invalid YouTube URL. Please enter a valid URL.');
    }
  };
  
  // Start/pause timer
  const toggleTimer = (): void => {
    if (timerComplete) {
      // Reset timer if complete
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
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="flex flex-col items-center p-8 max-w-5xl mx-auto my-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl">
      <h1 className="text-3xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">Pomodoro YouTube Player</h1>
      
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
            className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-6 py-3 rounded-lg hover:shadow-md transition-all duration-300 font-medium"
          >
            Load Video
          </button>
        </div>
      </div>
      
      {/* Pomodoro settings */}
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <label className="mb-2 font-medium text-gray-700 block">Work Minutes</label>
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
          <label className="mb-2 font-medium text-gray-700 block">Break Minutes</label>
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
          <label className="mb-2 font-medium text-gray-700 block">Number of Pomodoros</label>
          <input
            type="number"
            min="1"
            max="10"
            value={totalPomodoros}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTotalPomodoros(parseInt(e.target.value, 10))}
            className="p-3 border border-gray-200 rounded-lg w-full focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none transition-all duration-200"
            disabled={isRunning}
          />
        </div>
      </div>
      
      {/* Timer display */}
      <div className="w-full mb-8">
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-violet-50 p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${isWorking ? "bg-red-500" : "bg-green-500"} animate-pulse`}></div>
                <span className={`font-medium ${isWorking ? "text-red-600" : "text-green-600"}`}>
                  {isWorking ? "WORK SESSION" : "BREAK TIME"}
                </span>
              </div>
              <div className="bg-white px-4 py-2 rounded-full shadow-sm">
                <span className="font-medium text-gray-600">Pomodoro</span>
                <span className="ml-2 font-bold text-indigo-700">{currentPomodoro + 1}/{totalPomodoros}</span>
              </div>
            </div>
            
            <div className="text-center mb-6">
              <span className="text-6xl font-bold text-gray-800 font-mono tracking-wider">{formatTime(timeLeft)}</span>
            </div>
          </div>
          
          <div className="flex justify-center gap-4 p-4 bg-white">
            <button
              onClick={toggleTimer}
              className={`px-8 py-3 rounded-lg font-medium shadow-sm transition-all duration-300 ${
                isRunning 
                  ? "bg-amber-500 hover:bg-amber-600 text-white" 
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:shadow-md text-white"
              }`}
            >
              {isRunning ? "Pause" : timerComplete ? "Restart" : "Start"}
            </button>
            <button
              onClick={resetTimer}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-8 py-3 rounded-lg font-medium shadow-sm transition-all duration-300 disabled:opacity-50"
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
            <svg className="w-16 h-16 mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
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
          <span className="font-bold text-indigo-700">How to use:</span> Paste a YouTube music mix URL, configure your Pomodoro settings, 
          and press Start. The music will play only during work sessions and pause during breaks.
        </p>
      </div>
    </div>
  );
};

export default PomodoroYouTubePlayer;