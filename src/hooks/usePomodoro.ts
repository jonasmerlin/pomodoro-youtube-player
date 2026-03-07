import { useState, useEffect, useRef, useCallback } from "react";
import type { MediaProvider, FlatInterval } from "../types";
import { formatTime } from "../utils";

// =============================================================================
// usePomodoro — The shared pomodoro timer engine
// =============================================================================
//
// This hook encapsulates ALL timer logic used by every session page (YouTube,
// Spotify, NTS — both Quick and Planned modes). The timer is timestamp-based:
// on start/resume it records endTime = now + remaining, and each tick computes
// remaining = endTime - now. This is immune to setInterval drift and browser
// throttling of background tabs. A visibility change handler recalculates
// timeLeft when the user returns to the tab.
//
// The hook accepts a MediaProvider and calls provider.play() during work
// intervals and provider.pause() during breaks or when the timer is paused.
// This replaces the duplicated play/pause logic that previously lived in each
// app's component.
//
// Two modes:
//
// 1. "quick" mode — Standard pomodoro: N repetitions of work/break.
//    Configured via workMinutes, breakMinutes, totalPomodoros.
//
// 2. "planned" mode — Custom interval sequence. The caller provides a
//    FlatInterval[] (derived from interval blocks) and the timer steps
//    through them sequentially. Work minutes / break minutes / pomodoro
//    count are not used — the intervals drive everything.
//
// The hook returns all the state and callbacks the timer UI needs, including
// computed values like progress and sessionTotalSeconds. The MediaProvider is
// also wired into the hook's bidirectional sync: if the provider supports
// setOnUserPlay/setOnUserPause (like YouTube does), the hook registers
// handlers so the user clicking play/pause on the media player starts/stops
// the timer too.

// ---- Quick mode config ----
export interface QuickPomodoroConfig {
  mode: "quick";
  provider: MediaProvider | null;
  // Optional: override default app title shown when idle/cleanup
  appTitle?: string;
}

// ---- Planned mode config ----
export interface PlannedPomodoroConfig {
  mode: "planned";
  provider: MediaProvider | null;
  // The flattened interval sequence to step through. Must be set before
  // the timer starts. Can be empty during the planning phase.
  intervals: FlatInterval[];
  appTitle?: string;
}

export type PomodoroConfig = QuickPomodoroConfig | PlannedPomodoroConfig;

// ---- Return type ----
// Everything the timer display and controls need.
export interface PomodoroState {
  // Settings (quick mode only — planned mode ignores these)
  workMinutes: number;
  breakMinutes: number;
  totalPomodoros: number;
  setWorkMinutes: (v: number) => void;
  setBreakMinutes: (v: number) => void;
  setTotalPomodoros: (v: number) => void;
  setPreset: (workMins: number, breakMins: number) => void;

  // Timer state
  isRunning: boolean;
  isWorking: boolean; // true during work intervals, false during breaks
  timeLeft: number; // seconds remaining in the current interval
  timerComplete: boolean; // true when all intervals are done
  currentPomodoro: number; // 0-based index of the current pomodoro (quick mode)
  progress: number; // 0..1 progress within the current interval
  sessionTotalSeconds: number; // total seconds in the current interval

  // Planned mode extras
  currentIntervalIndex: number;
  flatIntervals: FlatInterval[];
  currentInterval: FlatInterval | null;

  // Actions
  toggleTimer: () => void;
  resetTimer: () => void;
  skipSession: () => void;

  // Planned mode actions
  startPlannedSession: (intervals: FlatInterval[]) => void;
  cancelPlannedSession: () => void;
  isPlannedRunning: boolean; // whether in the "running" phase of planned mode
}

export function usePomodoro(config: PomodoroConfig): PomodoroState {
  const { mode, provider } = config;
  const appTitle = config.appTitle ?? "Pomodoro Player";

  // ---- Quick mode settings ----
  const [workMinutes, setWorkMinutes] = useState<number>(25);
  const [breakMinutes, setBreakMinutes] = useState<number>(5);
  const [totalPomodoros, setTotalPomodoros] = useState<number>(4);
  const [currentPomodoro, setCurrentPomodoro] = useState<number>(0);

  // ---- Planned mode state ----
  const [flatIntervals, setFlatIntervals] = useState<FlatInterval[]>([]);
  const [currentIntervalIndex, setCurrentIntervalIndex] = useState<number>(0);
  const [isPlannedRunning, setIsPlannedRunning] = useState<boolean>(false);

  // ---- Shared timer state ----
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isWorking, setIsWorking] = useState<boolean>(true);
  const [timeLeft, setTimeLeft] = useState<number>(25 * 60);
  const [timerComplete, setTimerComplete] = useState<boolean>(false);

  // ---- Refs for precise timing ----
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const endTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(false);
  const timeLeftRef = useRef<number>(25 * 60);
  // Tracks whether the timer has been started since the last reset. Used by
  // the settings-sync effect to distinguish "paused" from "idle" — we only
  // want to overwrite timeLeft with the settings value when the timer has
  // never been started (or has been explicitly reset), NOT when the user
  // merely pauses mid-session.
  const hasBeenStartedRef = useRef<boolean>(false);

  // Keep refs in sync
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  // ---- Current interval for planned mode ----
  const currentInterval =
    mode === "planned" && flatIntervals.length > 0
      ? flatIntervals[currentIntervalIndex] ?? null
      : null;

  // In planned mode, isWorking is derived from the current interval type
  useEffect(() => {
    if (mode === "planned" && currentInterval) {
      setIsWorking(currentInterval.type === "work");
    }
  }, [mode, currentInterval]);

  // ---- Computed values ----
  // For quick mode, the session duration is the current work or break duration.
  // For planned mode, it's the current interval's duration.
  const sessionTotalSeconds =
    mode === "planned"
      ? (currentInterval?.durationMinutes ?? 0) * 60
      : isWorking
        ? workMinutes * 60
        : breakMinutes * 60;

  const progress =
    sessionTotalSeconds > 0
      ? Math.min(1, Math.max(0, 1 - timeLeft / sessionTotalSeconds))
      : 0;

  // ---- Preset helper (quick mode) ----
  const setPreset = useCallback((workMins: number, breakMins: number): void => {
    setWorkMinutes(workMins);
    setBreakMinutes(breakMins);
    if (!isRunningRef.current) {
      // Update display to match new preset
      setTimeLeft(workMins * 60);
      setIsWorking(true);
    }
  }, []);

  // ---- Sync timeLeft to quick-mode settings when not running ----
  // When the user changes workMinutes or breakMinutes while the timer is idle,
  // update timeLeft so the display matches. We guard on hasBeenStartedRef so
  // that pausing (isRunning → false) does NOT reset timeLeft. The ref is only
  // cleared on explicit reset, making this safe.
  useEffect(() => {
    if (mode !== "quick" || isRunning || hasBeenStartedRef.current) return;
    if (isWorking) {
      setTimeLeft(workMinutes * 60);
    } else {
      setTimeLeft(breakMinutes * 60);
    }
  }, [mode, workMinutes, breakMinutes, isRunning, isWorking]);

  // ---- Media sync ----
  // Play media during work intervals when running, pause otherwise.
  // This is the central place where the provider gets play/pause calls.
  useEffect(() => {
    if (!provider || !provider.isReady()) return;
    if (isWorking && isRunning) {
      provider.play();
    } else {
      provider.pause();
    }
  }, [isWorking, isRunning, provider]);

  // ---- Bidirectional sync with media provider ----
  // If the provider supports it (YouTube), register callbacks so that the
  // user clicking play/pause on the media player starts/stops the timer.
  useEffect(() => {
    if (!provider) return;
    if (provider.setOnUserPlay) {
      provider.setOnUserPlay(() => {
        if (!isRunningRef.current) setIsRunning(true);
      });
    }
    if (provider.setOnUserPause) {
      provider.setOnUserPause(() => {
        if (isRunningRef.current) setIsRunning(false);
      });
    }
    return () => {
      if (provider.setOnUserPlay) provider.setOnUserPlay(null);
      if (provider.setOnUserPause) provider.setOnUserPause(null);
    };
  }, [provider]);

  // ---- Timer tick logic ----
  // This is the core engine. On start/resume, we record endTimeRef. Each tick
  // computes remaining from the current time. When remaining hits zero, we
  // transition to the next interval (quick mode) or the next flat interval
  // (planned mode).
  useEffect(() => {
    const shouldRun =
      mode === "quick"
        ? isRunning && !timerComplete
        : isRunning && !timerComplete && isPlannedRunning;

    if (!shouldRun) return;

    // Set end time on first tick after start/resume
    if (!intervalRef.current) {
      startTimeRef.current = Date.now();
      endTimeRef.current = startTimeRef.current + timeLeftRef.current * 1000;
    }

    intervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const remainingMs = endTimeRef.current - now;

      if (remainingMs <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setTimeLeft(0);

        if (mode === "quick") {
          // Quick mode transitions
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
        } else {
          // Planned mode transitions
          const nextIndex = currentIntervalIndex + 1;
          if (nextIndex >= flatIntervals.length) {
            setTimerComplete(true);
            setIsRunning(false);
          } else {
            setCurrentIntervalIndex(nextIndex);
            setTimeLeft(flatIntervals[nextIndex].durationMinutes * 60);
          }
        }
        return;
      }
      setTimeLeft(Math.ceil(remainingMs / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // timeLeft is intentionally omitted — including it would restart the
    // interval on every tick, defeating the timestamp-based approach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    isRunning,
    isWorking,
    breakMinutes,
    workMinutes,
    currentPomodoro,
    totalPomodoros,
    timerComplete,
    isPlannedRunning,
    currentIntervalIndex,
    flatIntervals,
  ]);

  // ---- Visibility change handler ----
  // When the user switches away from the tab and comes back, the setInterval
  // may have been throttled. We recalculate timeLeft from the end timestamp
  // to stay accurate.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && isRunning && !timerComplete) {
        const now = Date.now();
        const remaining = endTimeRef.current - now;
        setTimeLeft(Math.max(0, Math.ceil(remaining / 1000)));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isRunning, timerComplete]);

  // ---- Document title ----
  useEffect(() => {
    if (timerComplete) {
      document.title = "Pomodoro Complete";
    } else if (isRunning) {
      const formattedTime = formatTime(timeLeft);
      const status = isWorking ? "Work" : "Break";
      document.title = `${formattedTime} - ${status} | ${appTitle}`;
    } else {
      document.title = appTitle;
    }
    return () => { document.title = appTitle; };
  }, [timeLeft, isWorking, isRunning, timerComplete, appTitle]);

  // ---- Timer controls ----

  const toggleTimer = useCallback((): void => {
    if (timerComplete) {
      if (mode === "quick") {
        setIsWorking(true);
        setCurrentPomodoro(0);
        setTimeLeft(workMinutes * 60);
      } else {
        // Planned mode restart
        setCurrentIntervalIndex(0);
        if (flatIntervals.length > 0) {
          setTimeLeft(flatIntervals[0].durationMinutes * 60);
        }
      }
      setTimerComplete(false);
    }
    // Mark the timer as "has been started" so the settings-sync effect
    // won't clobber timeLeft on pause.
    hasBeenStartedRef.current = true;
    setIsRunning((prev) => !prev);
  }, [timerComplete, mode, workMinutes, flatIntervals]);

  const resetTimer = useCallback((): void => {
    setIsRunning(false);
    hasBeenStartedRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mode === "quick") {
      setIsWorking(true);
      setCurrentPomodoro(0);
      setTimeLeft(workMinutes * 60);
    } else {
      setCurrentIntervalIndex(0);
      if (flatIntervals.length > 0) {
        setTimeLeft(flatIntervals[0].durationMinutes * 60);
      }
    }
    setTimerComplete(false);
  }, [mode, workMinutes, flatIntervals]);

  const skipSession = useCallback((): void => {
    if (timerComplete) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mode === "quick") {
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
    } else {
      // Planned mode skip
      const nextIndex = currentIntervalIndex + 1;
      if (nextIndex >= flatIntervals.length) {
        setTimerComplete(true);
        setIsRunning(false);
      } else {
        setCurrentIntervalIndex(nextIndex);
        setTimeLeft(flatIntervals[nextIndex].durationMinutes * 60);
        startTimeRef.current = Date.now();
        endTimeRef.current =
          startTimeRef.current + flatIntervals[nextIndex].durationMinutes * 60 * 1000;
      }
    }
  }, [
    timerComplete, mode, isWorking, currentPomodoro, totalPomodoros,
    breakMinutes, workMinutes, currentIntervalIndex, flatIntervals,
  ]);

  // ---- Planned mode session management ----

  const startPlannedSession = useCallback((intervals: FlatInterval[]): void => {
    setFlatIntervals(intervals);
    setCurrentIntervalIndex(0);
    if (intervals.length > 0) {
      setTimeLeft(intervals[0].durationMinutes * 60);
    }
    setTimerComplete(false);
    setIsRunning(false);
    setIsPlannedRunning(true);
  }, []);

  const cancelPlannedSession = useCallback((): void => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlannedRunning(false);
    setTimerComplete(false);
    setFlatIntervals([]);
    setCurrentIntervalIndex(0);
  }, []);

  return {
    // Settings
    workMinutes,
    breakMinutes,
    totalPomodoros,
    setWorkMinutes,
    setBreakMinutes,
    setTotalPomodoros,
    setPreset,

    // Timer state
    isRunning,
    isWorking,
    timeLeft,
    timerComplete,
    currentPomodoro,
    progress,
    sessionTotalSeconds,

    // Planned mode extras
    currentIntervalIndex,
    flatIntervals,
    currentInterval,

    // Actions
    toggleTimer,
    resetTimer,
    skipSession,

    // Planned mode actions
    startPlannedSession,
    cancelPlannedSession,
    isPlannedRunning,
  };
}
