import React from "react";
import { usePomodoro } from "../hooks/usePomodoro";
import { useNTSProvider } from "../providers/useNTSProvider";
import TimerDisplay from "../components/TimerDisplay";
import PomodoroSettings from "../components/PomodoroSettings";

// =============================================================================
// NTSQuickSession — quick pomodoro with NTS Radio live stream
// =============================================================================
//
// Plays NTS live stream during work periods and pauses (disconnects) during
// breaks. The user can pick between NTS 1 and NTS 2. Since NTS is a live
// stream there's no "track" info — we just show channel status.

const NTSQuickSession: React.FC = () => {
  const { provider, audioRef, channel, setChannel } = useNTSProvider();

  const pom = usePomodoro({
    mode: "quick",
    provider,
    appTitle: "Pomodoro NTS Player",
  });

  return (
    <>
      {/* NTS Channel Selector */}
      <div className="w-full mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Channel</h2>
          <div className="flex gap-3">
            <button
              onClick={() => setChannel(1)}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer border ${
                channel === 1
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              NTS 1
            </button>
            <button
              onClick={() => setChannel(2)}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer border ${
                channel === 2
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              NTS 2
            </button>
          </div>
        </div>
      </div>

      {/* Pomodoro Settings */}
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

      {/* Timer */}
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
        accentProgressClass="bg-white"
      />

      {/* Stream status */}
      <div className="w-full bg-white p-4 rounded-lg border border-slate-200 mt-2">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Stream Status</h2>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${pom.isRunning && pom.isWorking ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} />
          <span className="text-slate-700 text-sm">
            {pom.isRunning && pom.isWorking
              ? `NTS ${channel} — Live`
              : pom.isRunning && !pom.isWorking
                ? "On break — stream paused"
                : "Idle"}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          NTS Radio is a live broadcast — audio reconnects to the live edge each work period.
        </p>
      </div>

      {/* Hidden audio element — required by useNTSProvider */}
      <audio ref={audioRef} preload="none" />
    </>
  );
};

export default NTSQuickSession;
