import React from "react";
import type { VideoHistoryItem } from "../types";
import { usePomodoro } from "../hooks/usePomodoro";
import { useYouTubeProvider } from "../providers/useYouTubeProvider";
import { useVideoHistory } from "../useVideoHistory";
import VideoInput from "../components/VideoInput";
import TimerDisplay from "../components/TimerDisplay";
import PomodoroSettings from "../components/PomodoroSettings";

// =============================================================================
// YouTubeQuickSession — Quick pomodoro with a single YouTube video
// =============================================================================
//
// This is the refactored version of the original QuickSession.tsx. It composes
// the shared usePomodoro hook with the YouTube-specific provider, and uses
// the shared TimerDisplay + PomodoroSettings components for the UI.
//
// Behavior is identical to the original: paste a YouTube URL, configure work/
// break/pomodoros, press Start. The video plays during work and pauses for
// breaks. Clicking play/pause on the YouTube player starts/stops the timer.

const YouTubeQuickSession: React.FC = () => {
  // YouTube provider: manages the YT IFrame API player
  const {
    provider,
    videoId,
    setVideoId,
    playerContainerRef,
  } = useYouTubeProvider({ elementId: "yt-player-quick" });

  // Pomodoro timer: timestamp-based, syncs with the YouTube provider
  const pom = usePomodoro({
    mode: "quick",
    provider,
    appTitle: "Pomodoro YouTube Player",
  });

  // Video history: shared localStorage persistence
  const { videoHistory, addToHistory, removeFromHistory, clearHistory } =
    useVideoHistory();

  // ---- Video input handlers ----

  const handleVideoSubmit = async (id: string, url: string) => {
    setVideoId(id);
    await addToHistory(id, url);
  };

  const handleLoadFromHistory = async (item: VideoHistoryItem) => {
    setVideoId(item.id);
    await addToHistory(item.id, item.url);
  };

  // ---- Render ----

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
      <PomodoroSettings
        workMinutes={pom.workMinutes}
        breakMinutes={pom.breakMinutes}
        totalPomodoros={pom.totalPomodoros}
        isRunning={pom.isRunning}
        isWorking={pom.isWorking}
        onWorkMinutesChange={pom.setWorkMinutes}
        onBreakMinutesChange={pom.setBreakMinutes}
        onTotalPomodorosChange={pom.setTotalPomodoros}
        onPreset={pom.setPreset}
      />

      {/* Timer display */}
      <TimerDisplay
        timeLeft={pom.timeLeft}
        isRunning={pom.isRunning}
        isWorking={pom.isWorking}
        timerComplete={pom.timerComplete}
        progress={pom.progress}
        currentPomodoro={pom.currentPomodoro}
        totalPomodoros={pom.totalPomodoros}
        onToggleTimer={pom.toggleTimer}
        onResetTimer={pom.resetTimer}
        onSkipSession={pom.skipSession}
        workMinutes={pom.workMinutes}
      />

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
            <p className="text-center">Enter a YouTube URL to load a video</p>
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

export default YouTubeQuickSession;
