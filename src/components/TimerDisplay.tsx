import React from "react";
import { formatTime } from "../utils";

// =============================================================================
// TimerDisplay — Shared timer UI used by all session pages
// =============================================================================
//
// Shows the countdown timer, work/break badge, pomodoro counter, progress bar,
// and the Start/Pause / Reset / Skip controls. Accepts all its data as props
// from the usePomodoro hook — it has zero internal state.
//
// The component supports two display modes:
// 1. Quick mode: shows "Pomodoro X/Y" in the counter badge
// 2. Planned mode: shows "Interval X/Y | Work X/Y" with per-interval info
//
// The accent color (for progress bar and active badges) is passed as a CSS
// class string so each source can customize it.

export interface TimerDisplayProps {
  // Timer state from usePomodoro
  timeLeft: number;
  isRunning: boolean;
  isWorking: boolean;
  timerComplete: boolean;
  progress: number;
  // Quick mode counter info
  currentPomodoro: number;
  totalPomodoros: number;
  // Planned mode counter info (optional — only shown when provided)
  plannedMode?: boolean;
  currentIntervalIndex?: number;
  totalIntervals?: number;
  currentWorkNumber?: number;
  totalWorkIntervals?: number;
  intervalDurationMinutes?: number;
  // Controls
  onToggleTimer: () => void;
  onResetTimer: () => void;
  onSkipSession: () => void;
  // For quick mode: reset button is disabled when timer is at initial state
  workMinutes?: number;
  // For planned mode: show Cancel instead of Reset
  onCancelSession?: () => void;
  // "Session Complete!" text override
  completeText?: string;
  // Accent color classes (defaults to slate)
  accentProgressClass?: string; // e.g. "bg-red-500" for the progress bar fill
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timeLeft,
  isRunning,
  isWorking,
  timerComplete,
  progress,
  currentPomodoro,
  totalPomodoros,
  plannedMode = false,
  currentIntervalIndex = 0,
  totalIntervals = 0,
  currentWorkNumber = 0,
  totalWorkIntervals = 0,
  intervalDurationMinutes,
  onToggleTimer,
  onResetTimer,
  onSkipSession,
  workMinutes = 25,
  onCancelSession,
  completeText = "Session Complete!",
  accentProgressClass = "bg-slate-900",
}) => {
  return (
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
            className={`absolute left-0 top-0 h-1 ${accentProgressClass} transition-[width] duration-500`}
            style={{
              width: `${Math.min(100, Math.max(0, progress * 100))}%`,
            }}
          />
        </div>

        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 text-xs rounded-full border ${
                  isWorking
                    ? "text-red-700 border-red-200 bg-red-50"
                    : "text-green-700 border-green-200 bg-green-50"
                }`}
              >
                {isWorking ? "Work" : "Break"}
              </span>
              {plannedMode && intervalDurationMinutes !== undefined && (
                <span className="text-xs text-slate-500">
                  {intervalDurationMinutes}m
                </span>
              )}
            </div>
            <div className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50">
              {plannedMode ? (
                <>
                  <span className="font-medium text-slate-700">Interval</span>
                  <span className="ml-2 font-semibold text-slate-900">
                    {currentIntervalIndex + 1}/{totalIntervals}
                  </span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="font-medium text-slate-700">Work</span>
                  <span className="ml-2 font-semibold text-slate-900">
                    {currentWorkNumber}/{totalWorkIntervals}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-700">Pomodoro</span>
                  <span className="ml-2 font-semibold text-slate-900">
                    {currentPomodoro + 1}/{totalPomodoros}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="text-center mb-2">
            {timerComplete ? (
              <div className="py-4">
                <span className="text-4xl font-semibold text-slate-900">
                  {completeText}
                </span>
              </div>
            ) : (
              <span className="text-6xl font-semibold text-slate-900 font-mono tracking-tight">
                {formatTime(timeLeft)}
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-center gap-3 p-4 bg-white relative">
          <button
            onClick={onToggleTimer}
            className="px-6 py-2.5 rounded-md font-medium transition-colors duration-200 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white"
          >
            {isRunning ? "Pause" : timerComplete ? "Restart" : "Start"}
          </button>
          {onCancelSession ? (
            <button
              onClick={onCancelSession}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-2.5 rounded-md font-medium transition-colors duration-200 cursor-pointer"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onResetTimer}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-2.5 rounded-md font-medium transition-colors duration-200 disabled:opacity-50 cursor-pointer"
              disabled={!isRunning && timeLeft === workMinutes * 60}
            >
              Reset
            </button>
          )}
          <button
            onClick={onSkipSession}
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
  );
};

export default TimerDisplay;
