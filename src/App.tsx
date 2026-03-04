import { useState } from "react";
import type { ActiveTab } from "./types";
import QuickSession from "./QuickSession";
import PlannedSession from "./PlannedSession";

// App shell: renders the title, tab bar, and whichever session mode is active.
// The two tabs are fully independent — switching tabs unmounts the previous one,
// so timer/player state resets. This is intentional: you pick a mode, use it,
// and you're done.
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("quick");

  return (
    <div className="flex flex-col items-center px-6 py-8 max-w-3xl mx-auto my-8">
      <h1 className="text-2xl font-semibold text-slate-900">
        Pomodoro YouTube Player
      </h1>
      <p className="mt-2 mb-6 text-sm text-slate-600 text-center">
        Minimal focus timer that plays your chosen YouTube video only while you
        work.
      </p>

      {/* Tab bar */}
      <div className="w-full mb-8">
        <div className="inline-flex items-center rounded-lg border border-slate-300 p-0.5 bg-white">
          <button
            onClick={() => setActiveTab("quick")}
            className={`${
              activeTab === "quick"
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-50"
            } px-4 py-2 text-sm font-medium rounded-[7px] cursor-pointer transition-colors`}
          >
            Quick Session
          </button>
          <button
            onClick={() => setActiveTab("planned")}
            className={`${
              activeTab === "planned"
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-50"
            } px-4 py-2 text-sm font-medium rounded-[7px] cursor-pointer transition-colors`}
          >
            Planned Session
          </button>
        </div>
      </div>

      {/* Active tab content */}
      {activeTab === "quick" ? <QuickSession /> : <PlannedSession />}
    </div>
  );
};

export default App;
