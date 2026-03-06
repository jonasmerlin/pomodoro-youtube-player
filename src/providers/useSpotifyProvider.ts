import { useState, useEffect, useRef, useCallback } from "react";
import type {
  MediaProvider,
  SpotifyPlaybackState,
  SpotifyUserProfile,
  SpotifyTokenResponse,
} from "../types";

// =============================================================================
// useSpotifyProvider — MediaProvider implementation for Spotify Web API
// =============================================================================
//
// Handles the full Spotify PKCE OAuth flow and wraps the Spotify playback
// control endpoints into a MediaProvider. The pomodoro timer calls play/pause
// and this provider translates that into PUT requests to Spotify's REST API.
//
// Also manages:
// - Token storage/refresh (localStorage, scheduled refresh before expiry)
// - User profile fetching
// - Playback state polling (every 5s when connected)
// - Auth redirect handling (code exchange on mount)
//
// The hook returns the MediaProvider interface plus all the Spotify-specific
// state the session pages need (token, userInfo, playbackState, login/logout).

// ---- Spotify constants ----
const CLIENT_ID = "53c4eb5899c84af1ab26e7de292f01a8";
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-modify-playback-state",
  "user-read-playback-state",
];

function getRedirectUri(): string {
  // Must match the redirect URI registered in the Spotify app dashboard.
  // Points to the dedicated /spotify/callback route which handles the code
  // exchange independently, then redirects back to the originating page.
  return `${window.location.origin}/spotify/callback`;
}

// ---- PKCE helpers ----

function generateCodeVerifier(length = 128): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let text = "";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// ---- Return type ----

export interface UseSpotifyProviderResult {
  provider: MediaProvider;
  token: string | null;
  error: string | null;
  isLoading: boolean;
  userInfo: SpotifyUserProfile | null;
  playbackState: SpotifyPlaybackState | null;
  handleLogin: () => Promise<void>;
  handleLogout: () => void;
}

export function useSpotifyProvider(): UseSpotifyProviderResult {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<SpotifyUserProfile | null>(null);
  const [playbackState, setPlaybackState] = useState<SpotifyPlaybackState | null>(null);

  const refreshTimeoutRef = useRef<number | null>(null);
  // Guard against duplicate play/pause calls from rapid timer transitions
  const programmaticChangeRef = useRef(false);

  const REDIRECT_URI = getRedirectUri();

  // ---- Token refresh ----
  // Attempts to refresh the access token using the stored refresh_token.
  // Returns true on success. Schedules the next refresh ~60s before expiry.
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const existingRefresh = localStorage.getItem("spotify_refresh_token");
    if (!existingRefresh) return false;

    try {
      const payload = new URLSearchParams();
      payload.append("client_id", CLIENT_ID);
      payload.append("grant_type", "refresh_token");
      payload.append("refresh_token", existingRefresh);

      const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload,
      });

      if (!response.ok) return false;

      const data = await response.json() as Partial<SpotifyTokenResponse> & {
        expires_in: number;
        access_token: string;
      };

      const newExpiresAt = Date.now() + data.expires_in * 1000;
      localStorage.setItem("spotify_access_token", data.access_token);
      localStorage.setItem("spotify_expires_in", String(data.expires_in));
      localStorage.setItem("spotify_expires_at", String(newExpiresAt));
      if (data.refresh_token) {
        localStorage.setItem("spotify_refresh_token", data.refresh_token);
      }
      setToken(data.access_token);

      // Schedule next refresh
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      const delay = Math.max(5_000, newExpiresAt - Date.now() - 60_000);
      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshAccessToken();
      }, delay);

      return true;
    } catch (err) {
      console.error("Failed to refresh Spotify token", err);
      return false;
    }
  }, []);

  // ---- Get valid access token (refresh if needed) ----
  const getValidAccessToken = useCallback(async (): Promise<string | null> => {
    const currentToken = localStorage.getItem("spotify_access_token");
    const expiresAtStr = localStorage.getItem("spotify_expires_at");
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : null;

    if (currentToken && expiresAt && Date.now() < expiresAt - 5_000) {
      return currentToken;
    }
    const ok = await refreshAccessToken();
    return ok ? localStorage.getItem("spotify_access_token") : null;
  }, [refreshAccessToken]);

  // ---- Get user info ----
  const getUserInfo = useCallback(async (accessToken: string): Promise<void> => {
    try {
      const response = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 401) {
        const ok = await refreshAccessToken();
        if (ok) return getUserInfo(localStorage.getItem("spotify_access_token") || accessToken);
      }

      if (!response.ok) throw new Error("HTTP status " + response.status);

      const data = await response.json() as SpotifyUserProfile;
      setUserInfo(data);
    } catch (err) {
      setError(`Failed to get user info: ${(err as Error).message}`);
    }
  }, [refreshAccessToken]);

  // ---- Get playback state ----
  const getPlaybackState = useCallback(async (accessToken: string): Promise<void> => {
    try {
      const response = await fetch("https://api.spotify.com/v1/me/player", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 401) {
        const ok = await refreshAccessToken();
        if (ok) return getPlaybackState(localStorage.getItem("spotify_access_token") || accessToken);
      }

      if (response.status === 204) {
        setPlaybackState({ message: "No active device found" });
        return;
      }

      if (response.status === 403) {
        const errorData = await response.json().catch(() => null);
        const errorMsg = errorData?.error?.message || "Access forbidden";
        if (errorMsg.includes("Premium") || errorMsg.includes("premium")) {
          setError("Spotify Premium is required to control playback.");
        } else {
          setError(`Playback access denied: ${errorMsg}. This app may be in development mode.`);
        }
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMsg = errorData?.error?.message || `HTTP status ${response.status}`;
        throw new Error(errorMsg);
      }

      const data = await response.json() as SpotifyPlaybackState;
      setPlaybackState(data);
    } catch (err) {
      setError(`Failed to get playback state: ${(err as Error).message}`);
    }
  }, [refreshAccessToken]);

  // ---- Login ----
  const handleLogin = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    const codeVerifier = generateCodeVerifier();
    localStorage.setItem("spotify_code_verifier", codeVerifier);
    // Remember where the user was so we can navigate back after token exchange
    localStorage.setItem("spotify_return_path", window.location.pathname);

    try {
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const authUrl = new URL(AUTH_ENDPOINT);
      authUrl.searchParams.append("client_id", CLIENT_ID);
      authUrl.searchParams.append("response_type", "code");
      authUrl.searchParams.append("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.append("scope", SCOPES.join(" "));
      authUrl.searchParams.append("code_challenge_method", "S256");
      authUrl.searchParams.append("code_challenge", codeChallenge);
      window.location.href = authUrl.toString();
    } catch (err) {
      setIsLoading(false);
      setError(`Failed to generate challenge: ${(err as Error).message}`);
    }
  }, [REDIRECT_URI]);

  // ---- Logout ----
  const handleLogout = useCallback(() => {
    localStorage.removeItem("spotify_access_token");
    localStorage.removeItem("spotify_refresh_token");
    localStorage.removeItem("spotify_expires_in");
    localStorage.removeItem("spotify_expires_at");
    localStorage.removeItem("spotify_code_verifier");
    setToken(null);
    setUserInfo(null);
    setPlaybackState(null);
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  // ---- Init: handle auth callback or restore session on mount ----
  useEffect(() => {
    const init = async () => {
      // Try to restore an existing session from localStorage.
      // The actual OAuth code exchange is handled by the SpotifyCallback page
      // at /spotify/callback — by the time this hook mounts, tokens are
      // already in localStorage if the user has connected.
      const storedToken = localStorage.getItem("spotify_access_token");
      const expiresAtStr = localStorage.getItem("spotify_expires_at");
      const storedRefresh = localStorage.getItem("spotify_refresh_token");
      const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : null;

      if (storedToken && expiresAt && Date.now() < expiresAt) {
        setToken(storedToken);
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
        const delay = Math.max(5_000, expiresAt - Date.now() - 60_000);
        refreshTimeoutRef.current = window.setTimeout(() => {
          refreshAccessToken();
        }, delay);
        await getUserInfo(storedToken);
        await getPlaybackState(storedToken);
        return;
      }

      if (storedRefresh) {
        const ok = await refreshAccessToken();
        const newToken = localStorage.getItem("spotify_access_token");
        if (ok && newToken) {
          await getUserInfo(newToken);
          await getPlaybackState(newToken);
        }
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Poll playback state every 5s when connected ----
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      const t = localStorage.getItem("spotify_access_token");
      if (t) getPlaybackState(t);
    }, 5000);
    return () => clearInterval(interval);
  }, [token, getPlaybackState]);

  // ---- MediaProvider: play ----
  const play = useCallback(async () => {
    const validToken = await getValidAccessToken();
    if (!validToken) return;

    try {
      programmaticChangeRef.current = true;
      const res = await fetch("https://api.spotify.com/v1/me/player/play", {
        method: "PUT",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      if (res.status === 401) {
        const ok = await refreshAccessToken();
        if (ok) {
          const t = localStorage.getItem("spotify_access_token");
          await fetch("https://api.spotify.com/v1/me/player/play", {
            method: "PUT",
            headers: { Authorization: `Bearer ${t}` },
          });
        }
      } else if (res.status === 403) {
        const errorData = await res.json().catch(() => null);
        const errorMsg = errorData?.error?.message || "Access forbidden";
        if (errorMsg.includes("Premium") || errorMsg.includes("premium")) {
          setError("Spotify Premium is required to control playback.");
        } else {
          setError(`Cannot start playback: ${errorMsg}`);
        }
      } else if (res.status === 404) {
        setError("No active device found. Please open Spotify on your device.");
      }

      // Refresh playback state after a short delay
      setTimeout(() => {
        const t = localStorage.getItem("spotify_access_token");
        if (t) getPlaybackState(t);
        programmaticChangeRef.current = false;
      }, 1000);
    } catch (err) {
      setError(`Failed to start playback: ${(err as Error).message}`);
      programmaticChangeRef.current = false;
    }
  }, [getValidAccessToken, refreshAccessToken, getPlaybackState]);

  // ---- MediaProvider: pause ----
  const pause = useCallback(async () => {
    const validToken = await getValidAccessToken();
    if (!validToken) return;

    try {
      programmaticChangeRef.current = true;
      const res = await fetch("https://api.spotify.com/v1/me/player/pause", {
        method: "PUT",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      if (res.status === 401) {
        const ok = await refreshAccessToken();
        if (ok) {
          const t = localStorage.getItem("spotify_access_token");
          await fetch("https://api.spotify.com/v1/me/player/pause", {
            method: "PUT",
            headers: { Authorization: `Bearer ${t}` },
          });
        }
      } else if (res.status === 403) {
        const errorData = await res.json().catch(() => null);
        const errorMsg = errorData?.error?.message || "Access forbidden";
        if (errorMsg.includes("Premium") || errorMsg.includes("premium")) {
          setError("Spotify Premium is required to control playback.");
        } else {
          setError(`Cannot pause playback: ${errorMsg}`);
        }
      } else if (res.status === 404) {
        setError("No active device found. Please open Spotify on your device.");
      }

      setTimeout(() => {
        const t = localStorage.getItem("spotify_access_token");
        if (t) getPlaybackState(t);
        programmaticChangeRef.current = false;
      }, 1000);
    } catch (err) {
      setError(`Failed to pause playback: ${(err as Error).message}`);
      programmaticChangeRef.current = false;
    }
  }, [getValidAccessToken, refreshAccessToken, getPlaybackState]);

  const isReady = useCallback(() => !!token, [token]);

  const cleanup = useCallback(() => {
    // Nothing to clean up for Spotify — the REST API is stateless
  }, []);

  // Build a stable provider ref
  const providerRef = useRef<MediaProvider>({ play, pause, isReady, cleanup });
  useEffect(() => {
    providerRef.current.play = play;
    providerRef.current.pause = pause;
    providerRef.current.isReady = isReady;
    providerRef.current.cleanup = cleanup;
  }, [play, pause, isReady, cleanup]);

  return {
    provider: providerRef.current,
    token,
    error,
    isLoading,
    userInfo,
    playbackState,
    handleLogin,
    handleLogout,
  };
}
