import React, { type ChangeEvent } from "react";

// =============================================================================
// PomodoroSettings — Shared settings panel for Quick Session mode
// =============================================================================
//
// Renders the work minutes / break minutes / total pomodoros number inputs
// plus the preset buttons (25/5, 45/15, 60/30). All state comes from the
// usePomodoro hook via props. Disabled when the timer is running.

export interface PomodoroSettingsProps {
  workMinutes: number;
  breakMinutes: number;
  totalPomodoros: number;
  isRunning: boolean;
  isWorking: boolean;
  onWorkMinutesChange: (v: number) => void;
  onBreakMinutesChange: (v: number) => void;
  onTotalPomodorosChange: (v: number) => void;
  onPreset: (workMins: number, breakMins: number) => void;
}

const PomodoroSettings: React.FC<PomodoroSettingsProps> = ({
  workMinutes,
  breakMinutes,
  totalPomodoros,
  isRunning,
  onWorkMinutesChange,
  onBreakMinutesChange,
  onTotalPomodorosChange,
  onPreset,
}) => {
  return (
    <>
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
              onWorkMinutesChange(parseInt(e.target.value, 10));
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
              onBreakMinutesChange(parseInt(e.target.value, 10));
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
              onTotalPomodorosChange(parseInt(e.target.value, 10))
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
                  onClick={() => onPreset(p.w, p.b)}
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
    </>
  );
};

export default PomodoroSettings;
