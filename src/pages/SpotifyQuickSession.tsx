import React from "react";
import { usePomodoro } from "../hooks/usePomodoro";
import { useSpotifyProvider } from "../providers/useSpotifyProvider";
import TimerDisplay from "../components/TimerDisplay";
import PomodoroSettings from "../components/PomodoroSettings";

// =============================================================================
// SpotifyQuickSession — Quick pomodoro with Spotify playback control
// =============================================================================
//
// Connects to Spotify via PKCE OAuth, then uses the Spotify Web API to
// play during work intervals and pause during breaks. The user needs
// Spotify Premium and an active device.

const SpotifyQuickSession: React.FC = () => {
  const {
    provider,
    token,
    error,
    isLoading,
    userInfo,
    playbackState,
    handleLogin,
    handleLogout,
  } = useSpotifyProvider();

  const pom = usePomodoro({
    mode: "quick",
    provider: token ? provider : null,
    appTitle: "Pomodoro Spotify Player",
  });

  // ---- Render: Not connected ----
  if (!token) {
    return (
      <>
        {error && (
          <div className="w-full bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
            <strong className="font-bold">Error: </strong>
            <span>{error}</span>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center my-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
          </div>
        )}

        <div className="w-full text-center p-8 bg-white rounded-lg border border-slate-200">
          <p className="mb-6 text-slate-600">
            Connect your Spotify account to control playback during pomodoro sessions.
          </p>
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-full transition-all duration-300"
          >
            Connect with Spotify
          </button>
        </div>

        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200 w-full">
          <p className="text-slate-600 text-sm">
            <span className="font-semibold">Requirements:</span> You need Spotify Premium and an active Spotify device.
          </p>
        </div>
      </>
    );
  }

  // ---- Render: Connected ----
  return (
    <>
      {error && (
        <div className="w-full bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
          <strong className="font-bold">Error: </strong>
          <span>{error}</span>
        </div>
      )}

      {/* Account info */}
      <div className="w-full bg-white p-4 rounded-lg border border-slate-200 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {userInfo?.images && userInfo.images.length > 0 && (
              <img
                src={userInfo.images[0].url}
                alt="Profile"
                className="w-10 h-10 rounded-full"
              />
            )}
            <div>
              <p className="font-medium text-slate-900">{userInfo?.display_name || "Loading..."}</p>
              <p className="text-slate-500 text-sm">{userInfo?.email || ""}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-500 hover:text-slate-700 text-sm font-medium px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

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
        accentProgressClass="bg-green-500"
      />

      {/* Now Playing */}
      <div className="w-full bg-white p-4 rounded-lg border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Now Playing</h2>
        {playbackState ? (
          playbackState.message ? (
            <p className="text-center text-slate-500 py-4">{playbackState.message}</p>
          ) : playbackState.item ? (
            <div className="flex items-center gap-4">
              {playbackState.item.album?.images && playbackState.item.album.images.length > 0 && (
                <img
                  src={playbackState.item.album.images[0].url}
                  alt="Album Art"
                  className="w-16 h-16 rounded-md"
                />
              )}
              <div>
                <p className="font-medium text-slate-900">{playbackState.item.name}</p>
                <p className="text-slate-600 text-sm">
                  {playbackState.item.artists.map((a) => a.name).join(", ")}
                </p>
                {playbackState.item.album && (
                  <p className="text-slate-500 text-xs mt-0.5">{playbackState.item.album.name}</p>
                )}
                <p className="text-xs mt-1.5 inline-block px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">
                  {playbackState.is_playing ? (
                    <span className="flex items-center">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                      Playing
                    </span>
                  ) : "Paused"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-center text-slate-500 py-4">No track currently playing</p>
          )
        ) : (
          <p className="text-center text-slate-500 py-4">Loading playback information...</p>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200 w-full">
        <p className="text-slate-700">
          <span className="font-semibold">How it works:</span> Start playing music on any Spotify device,
          then use the Pomodoro timer. Music plays during work intervals and pauses during breaks.
        </p>
      </div>
    </>
  );
};

export default SpotifyQuickSession;
