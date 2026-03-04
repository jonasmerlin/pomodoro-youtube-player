import React, { useState, type ChangeEvent } from "react";
import type { VideoHistoryItem } from "../types";
import { extractVideoId } from "../utils";

interface VideoInputProps {
  videoHistory: VideoHistoryItem[];
  onSubmit: (videoId: string, url: string) => void;
  onRemoveFromHistory: (id: string) => void;
  onClearHistory: () => void;
  onLoadFromHistory: (item: VideoHistoryItem) => void;
  buttonLabel?: string;
  placeholder?: string;
  // When true, clear the URL text input after a successful submit.
  // Quick Session leaves it (shows what's loaded), Planned Session clears it
  // so the user can quickly paste another URL.
  clearOnSubmit?: boolean;
}

// Reusable video URL input with a toggleable history panel.
// Used by both Quick Session (single video loading) and Planned Session (video queue building).
// The parent controls what happens on submit and history click via callbacks.
const VideoInput: React.FC<VideoInputProps> = ({
  videoHistory,
  onSubmit,
  onRemoveFromHistory,
  onClearHistory,
  onLoadFromHistory,
  buttonLabel = "Load Video",
  placeholder = "Paste YouTube URL here",
  clearOnSubmit = false,
}) => {
  const [videoUrl, setVideoUrl] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const handleUrlSubmit = () => {
    const id = extractVideoId(videoUrl);
    if (id) {
      onSubmit(id, videoUrl);
      if (clearOnSubmit) setVideoUrl("");
    } else {
      alert("Invalid YouTube URL. Please enter a valid URL.");
    }
  };

  const handleLoadFromHistory = (item: VideoHistoryItem) => {
    setVideoUrl(item.url);
    setShowHistory(false);
    onLoadFromHistory(item);
  };

  return (
    <div className="w-full mb-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={videoUrl}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setVideoUrl(e.target.value)
          }
          placeholder={placeholder}
          className="flex-1 px-3.5 py-2.5 bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleUrlSubmit();
          }}
        />
        <button
          onClick={handleUrlSubmit}
          className="bg-slate-900 text-white px-4 py-2.5 rounded-md hover:bg-slate-800 transition-colors duration-200 font-medium cursor-pointer"
        >
          {buttonLabel}
        </button>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="px-3 py-2.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors duration-200 font-medium cursor-pointer"
          title="Show video history"
          aria-expanded={showHistory}
          aria-controls="history-panel"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>

      {/* Video History Panel */}
      {showHistory && (
        <div
          id="history-panel"
          className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                    Video History
                  </h3>
                  <p className="text-xs text-slate-500">
                    {videoHistory.length} video
                    {videoHistory.length !== 1 ? "s" : ""} saved
                  </p>
                </div>
              </div>
              {videoHistory.length > 0 && (
                <button
                  onClick={onClearHistory}
                  className="px-3 py-1.5 bg-white text-red-600 text-sm font-medium rounded-md border border-slate-200 hover:border-red-200 hover:bg-red-50 transition-colors duration-200 cursor-pointer"
                >
                  <span className="flex items-center space-x-2">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    <span>Clear All</span>
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {videoHistory.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-xl mx-auto mb-3 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h4 className="text-base font-medium text-slate-700 mb-1">
                  No videos yet
                </h4>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Add a YouTube URL above. Recently played videos will appear
                  here.
                </p>
              </div>
            ) : (
              <div className="p-2">
                {videoHistory.map((item) => (
                  <div
                    key={item.id}
                    className="group relative bg-white rounded-lg p-3 mb-2 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => handleLoadFromHistory(item)}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="relative flex-shrink-0">
                        <div className="w-20 h-12 bg-slate-100 rounded-md overflow-hidden">
                          {item.thumbnail ? (
                            <img
                              src={item.thumbnail}
                              alt={item.title || "Video thumbnail"}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`;
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-slate-500"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between">
                          <h4 className="text-sm font-medium text-slate-900 leading-tight line-clamp-2">
                            {item.title || (
                              <span className="text-slate-500 italic">
                                Loading title...
                              </span>
                            )}
                          </h4>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-slate-500">
                          <div className="flex items-center space-x-1">
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
                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.1a3 3 0 105.656-5.656l-1.102 1.1a3 3 0 01-5.656 0l4-4z"
                              />
                            </svg>
                            <span className="truncate max-w-32 lg:max-w-48">
                              {item.url}
                            </span>
                          </div>
                          <span className="text-slate-300">&bull;</span>
                          <div className="flex items-center space-x-1">
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
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span>
                              {new Date(item.addedAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFromHistory(item.id);
                        }}
                        className="flex-shrink-0 w-8 h-8 border border-transparent hover:border-red-200 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition-colors duration-150 cursor-pointer flex items-center justify-center"
                        title="Remove from history"
                        aria-label={`Remove ${item.title ?? "video"} from history`}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoInput;
