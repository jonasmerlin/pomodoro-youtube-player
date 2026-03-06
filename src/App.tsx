import { Routes, Route, Navigate, Link } from "react-router-dom";
import SourceLayout from "./layouts/SourceLayout";
import YouTubeQuickSession from "./pages/YouTubeQuickSession";
import YouTubePlannedSession from "./pages/YouTubePlannedSession";
import SpotifyQuickSession from "./pages/SpotifyQuickSession";
import SpotifyPlannedSession from "./pages/SpotifyPlannedSession";
import NTSQuickSession from "./pages/NTSQuickSession";
import NTSPlannedSession from "./pages/NTSPlannedSession";

// =============================================================================
// Landing page — source picker cards
// =============================================================================
//
// Three big cards that link to /youtube/quick, /spotify/quick, /nts/quick
// respectively. Each card has the source's accent colour as a dot.

const SOURCES = [
  {
    key: "youtube",
    name: "YouTube",
    description: "Play a YouTube video during work, pause during breaks.",
    dotClass: "bg-red-500",
  },
  {
    key: "spotify",
    name: "Spotify",
    description: "Control Spotify playback — plays during work, pauses during breaks.",
    dotClass: "bg-green-500",
  },
  {
    key: "nts",
    name: "NTS Radio",
    description: "Stream NTS live radio during work, pause during breaks.",
    dotClass: "bg-white border border-slate-400",
  },
] as const;

const LandingPage: React.FC = () => (
  <div className="flex flex-col items-center px-6 py-12 max-w-3xl mx-auto my-8">
    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
      Pomodoro Player
    </h1>
    <p className="mt-3 mb-10 text-sm text-slate-500 text-center max-w-md">
      Minimal focus timer that plays your chosen media only while you work —
      and pauses it during breaks.
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
      {SOURCES.map((s) => (
        <Link
          key={s.key}
          to={`/${s.key}/quick`}
          className="group bg-white rounded-xl border border-slate-200 p-6 hover:border-slate-400 hover:shadow-sm transition-all duration-200 no-underline"
        >
          <div className="flex items-center gap-2.5 mb-3">
            <span className={`w-3 h-3 rounded-full ${s.dotClass}`} />
            <span className="text-lg font-semibold text-slate-900 group-hover:text-slate-700 transition-colors">
              {s.name}
            </span>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed">
            {s.description}
          </p>
        </Link>
      ))}
    </div>
  </div>
);

// =============================================================================
// App — top-level router
// =============================================================================
//
// Routes:
//   /                       → Landing page (source picker)
//   /:source/quick          → Quick session for that source
//   /:source/planned        → Planned session for that source
//
// The SourceLayout renders a header with the source name, accent dot, and
// Quick/Planned tab bar, plus an <Outlet /> for the child route.

const App: React.FC = () => (
  <Routes>
    <Route path="/" element={<LandingPage />} />

    <Route path="/youtube" element={<SourceLayout />}>
      <Route index element={<Navigate to="quick" replace />} />
      <Route path="quick" element={<YouTubeQuickSession />} />
      <Route path="planned" element={<YouTubePlannedSession />} />
    </Route>

    <Route path="/spotify" element={<SourceLayout />}>
      <Route index element={<Navigate to="quick" replace />} />
      <Route path="quick" element={<SpotifyQuickSession />} />
      <Route path="planned" element={<SpotifyPlannedSession />} />
    </Route>

    <Route path="/nts" element={<SourceLayout />}>
      <Route index element={<Navigate to="quick" replace />} />
      <Route path="quick" element={<NTSQuickSession />} />
      <Route path="planned" element={<NTSPlannedSession />} />
    </Route>

    {/* Fallback */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
