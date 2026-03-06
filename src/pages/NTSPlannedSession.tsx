import React, { useState } from "react";
import type { IntervalBlock } from "../types";
import { formatDuration, flattenIntervals, generateId } from "../utils";
import { usePomodoro } from "../hooks/usePomodoro";
import { useNTSProvider } from "../providers/useNTSProvider";
import TimerDisplay from "../components/TimerDisplay";

// =============================================================================
// NTSPlannedSession — planned interval session with NTS Radio
// =============================================================================
//
// Same interval builder as SpotifyPlannedSession but uses NTS live stream
// instead of Spotify playback. Includes channel 1/2 selector.

const NTSPlannedSession: React.FC = () => {
  const [phase, setPhase] = useState<"planning" | "running">("planning");

  // ---- Interval builder ----
  const [intervalBlocks, setIntervalBlocks] = useState<IntervalBlock[]>([]);
  const [newWorkMinutes, setNewWorkMinutes] = useState<number>(25);
  const [newBreakMinutes, setNewBreakMinutes] = useState<number>(5);
  const [newRepeat, setNewRepeat] = useState<number>(2);

  // ---- NTS provider ----
  const { provider, audioRef, channel, setChannel } = useNTSProvider();

  // ---- Pomodoro timer ----
  const pom = usePomodoro({
    mode: "planned",
    provider,
    intervals: [],
    appTitle: "Pomodoro NTS Player",
  });

  // ---- Interval management ----
  const addIntervalBlock = () => {
    if (newWorkMinutes < 1 || newBreakMinutes < 1 || newRepeat < 1) return;
    setIntervalBlocks((prev) => [...prev, {
      id: generateId(),
      workMinutes: newWorkMinutes,
      breakMinutes: newBreakMinutes,
      repeat: newRepeat,
    }]);
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

  const startSession = () => {
    if (intervalBlocks.length === 0) return;
    pom.startPlannedSession(flattenIntervals(intervalBlocks));
    setPhase("running");
  };

  const handleCancelSession = () => {
    pom.cancelPlannedSession();
    setPhase("planning");
  };

  const flat = flattenIntervals(intervalBlocks);
  const workIntervalCount = flat.filter((i) => i.type === "work").length;
  const totalMinutes = flat.reduce((sum, i) => sum + i.durationMinutes, 0);

  // ---- Running phase ----
  if (phase === "running") {
    const totalIntervals = pom.flatIntervals.length;
    const workIntervals = pom.flatIntervals.filter((i) => i.type === "work");
    const currentWorkNumber = pom.isWorking
      ? pom.flatIntervals.slice(0, pom.currentIntervalIndex + 1).filter((i) => i.type === "work").length
      : pom.flatIntervals.slice(0, pom.currentIntervalIndex).filter((i) => i.type === "work").length;

    return (
      <>
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
          accentProgressClass="bg-white"
        />

        {/* Upcoming intervals */}
        {!pom.timerComplete && pom.currentIntervalIndex < pom.flatIntervals.length - 1 && (
          <div className="w-full mb-6">
            <div className="text-xs text-slate-500 mb-2 font-medium">Coming up</div>
            <div className="flex gap-1.5 flex-wrap">
              {pom.flatIntervals.slice(pom.currentIntervalIndex + 1, pom.currentIntervalIndex + 9).map((interval, i) => (
                <span key={i} className={`px-2 py-1 text-xs rounded-md border ${
                  interval.type === "work" ? "text-red-700 border-red-200 bg-red-50" : "text-green-700 border-green-200 bg-green-50"
                }`}>
                  {interval.type === "work" ? "W" : "B"} {interval.durationMinutes}m
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stream status */}
        <div className="w-full bg-white p-4 rounded-lg border border-slate-200">
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${pom.isRunning && pom.isWorking ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} />
            <span className="text-slate-700 text-sm">
              {pom.isRunning && pom.isWorking
                ? `NTS ${channel} — Live`
                : pom.isRunning && !pom.isWorking
                  ? "On break — stream paused"
                  : pom.timerComplete ? "Session complete!" : "Idle"}
            </span>
          </div>
        </div>

        <audio ref={audioRef} preload="none" />
      </>
    );
  }

  // ---- Planning phase ----
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

      {/* Interval builder */}
      <div className="w-full mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Plan Your Intervals</h2>

        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="mb-1.5 text-sm font-medium text-slate-700 block">Work (min)</label>
              <input type="number" min="1" max="120" value={newWorkMinutes}
                onChange={(e) => setNewWorkMinutes(parseInt(e.target.value, 10) || 1)}
                className="p-2.5 border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none" />
            </div>
            <div>
              <label className="mb-1.5 text-sm font-medium text-slate-700 block">Break (min)</label>
              <input type="number" min="1" max="60" value={newBreakMinutes}
                onChange={(e) => setNewBreakMinutes(parseInt(e.target.value, 10) || 1)}
                className="p-2.5 border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none" />
            </div>
            <div>
              <label className="mb-1.5 text-sm font-medium text-slate-700 block">Repeat</label>
              <input type="number" min="1" max="20" value={newRepeat}
                onChange={(e) => setNewRepeat(parseInt(e.target.value, 10) || 1)}
                className="p-2.5 border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none" />
            </div>
            <button onClick={addIntervalBlock}
              className="bg-slate-900 text-white px-4 py-2.5 rounded-md hover:bg-slate-800 transition-colors duration-200 font-medium cursor-pointer">
              Add Interval
            </button>
          </div>

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
                  className="text-slate-700 hover:bg-slate-50 px-3 py-1.5 text-sm rounded-[6px] cursor-pointer transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

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
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer" title="Move up">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button onClick={() => moveIntervalBlock(index, "down")} disabled={index === intervalBlocks.length - 1}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer" title="Move down">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <button onClick={() => removeIntervalBlock(block.id)}
                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer" title="Remove">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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

      {/* Start session button */}
      <div className="w-full">
        <button onClick={startSession} disabled={intervalBlocks.length === 0}
          className="w-full bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition-colors duration-200 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-lg">
          Start Session
          {intervalBlocks.length > 0 && (
            <span className="ml-2 font-normal text-slate-300">
              ({workIntervalCount} work session{workIntervalCount !== 1 ? "s" : ""}, ~{formatDuration(totalMinutes)})
            </span>
          )}
        </button>
      </div>

      <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-200 w-full">
        <p className="text-slate-700">
          <span className="font-semibold">How to use:</span> Pick a channel, add interval blocks,
          then hit Start Session. NTS plays during work and pauses during breaks.
        </p>
      </div>

      <audio ref={audioRef} preload="none" />
    </>
  );
};

export default NTSPlannedSession;
