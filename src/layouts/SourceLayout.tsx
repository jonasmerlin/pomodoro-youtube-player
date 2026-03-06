import React from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import type { MediaSource } from "../types";

// =============================================================================
// SourceLayout — Per-source wrapper with Quick/Planned tab bar
// =============================================================================
//
// This layout is rendered around all YouTube/Spotify/NTS session pages.
// It shows the source name in the header, provides the Quick/Planned tab
// navigation, and renders the active child route via <Outlet />.
//
// The accent color for each source is applied via a subtle color indicator
// next to the source name.
//
// We derive the source from the URL pathname (e.g. "/youtube/quick" → "youtube")
// rather than useParams, because the routes are defined with hardcoded paths
// ("/youtube", "/spotify", "/nts") instead of a ":source" param. This keeps
// routing explicit and type-safe while still letting the layout be shared.

const SOURCE_CONFIG: Record<MediaSource, { label: string; accentDot: string; description: string }> = {
  youtube: {
    label: "YouTube",
    accentDot: "bg-red-500",
    description: "Plays your chosen YouTube video only while you work.",
  },
  spotify: {
    label: "Spotify",
    accentDot: "bg-green-500",
    description: "Plays your Spotify music during work and pauses for breaks.",
  },
  nts: {
    label: "NTS Radio",
    accentDot: "bg-white border border-slate-400",
    description: "Streams NTS Radio live during work sessions.",
  },
};

const SourceLayout: React.FC = () => {
  // Extract the source segment from the pathname: "/youtube/quick" → "youtube"
  const location = useLocation();
  const source = location.pathname.split("/")[1] as MediaSource;
  const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.youtube;

  return (
    <div className="flex flex-col items-center px-6 py-8 max-w-3xl mx-auto my-8">
      {/* Back to source selection */}
      <Link
        to="/"
        className="self-start mb-4 text-sm text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
        </svg>
        All sources
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className={`w-3 h-3 rounded-full ${config.accentDot}`} />
        <h1 className="text-2xl font-semibold text-slate-900">
          Pomodoro {config.label} Player
        </h1>
      </div>
      <p className="mt-1 mb-6 text-sm text-slate-600 text-center">
        {config.description}
      </p>

      {/* Quick / Planned tab bar */}
      <div className="w-full mb-8">
        <div className="inline-flex items-center rounded-lg border border-slate-300 p-0.5 bg-white">
          <NavLink
            to={`/${source}/quick`}
            className={({ isActive }) =>
              `${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              } px-4 py-2 text-sm font-medium rounded-[7px] cursor-pointer transition-colors`
            }
          >
            Quick Session
          </NavLink>
          <NavLink
            to={`/${source}/planned`}
            className={({ isActive }) =>
              `${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              } px-4 py-2 text-sm font-medium rounded-[7px] cursor-pointer transition-colors`
            }
          >
            Planned Session
          </NavLink>
        </div>
      </div>

      {/* Active session page */}
      <Outlet />
    </div>
  );
};

export default SourceLayout;
