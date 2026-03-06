import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SpotifyTokenResponse } from "../types";

// =============================================================================
// SpotifyCallback — OAuth callback handler
// =============================================================================
//
// This is a standalone page mounted at /spotify/callback. Spotify redirects
// here after the user grants permission. It does exactly one thing: exchange
// the authorization code for tokens, store them in localStorage, then navigate
// back to wherever the user came from (saved in spotify_return_path).
//
// This page does NOT use useSpotifyProvider — it handles the token exchange
// inline so it can run without any provider context. Once tokens are in
// localStorage, the provider hook in the destination page will pick them up
// automatically on mount.

const CLIENT_ID = "53c4eb5899c84af1ab26e7de292f01a8";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

function getRedirectUri(): string {
  return `${window.location.origin}/spotify/callback`;
}

const SpotifyCallback: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const exchangeCode = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const authError = urlParams.get("error");

      if (authError) {
        setError(`Spotify authorization failed: ${authError}`);
        return;
      }

      if (!code) {
        // No code and no error — shouldn't be here, go back to Spotify page
        navigate("/spotify/quick", { replace: true });
        return;
      }

      // Strip the query params so the code isn't re-processed on refresh
      window.history.replaceState({}, document.title, window.location.pathname);

      try {
        const codeVerifier = localStorage.getItem("spotify_code_verifier");
        if (!codeVerifier) throw new Error("No code verifier found in storage");

        const payload = new URLSearchParams();
        payload.append("client_id", CLIENT_ID);
        payload.append("grant_type", "authorization_code");
        payload.append("code", code);
        payload.append("redirect_uri", getRedirectUri());
        payload.append("code_verifier", codeVerifier);

        const response = await fetch(TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: payload,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.error_description || `HTTP ${response.status}`);
        }

        const data = (await response.json()) as SpotifyTokenResponse;

        const expiresAt = Date.now() + data.expires_in * 1000;
        localStorage.setItem("spotify_access_token", data.access_token);
        localStorage.setItem("spotify_refresh_token", data.refresh_token);
        localStorage.setItem("spotify_expires_in", String(data.expires_in));
        localStorage.setItem("spotify_expires_at", String(expiresAt));

        // Navigate to wherever the user started the login flow from.
        // Default to /spotify/quick if no return path was saved.
        const returnPath = localStorage.getItem("spotify_return_path") || "/spotify/quick";
        localStorage.removeItem("spotify_return_path");
        navigate(returnPath, { replace: true });
      } catch (err) {
        setError(`Token exchange failed: ${(err as Error).message}`);
      }
    };

    exchangeCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center px-6 py-16 max-w-lg mx-auto my-8">
        <div className="w-full bg-red-50 border border-red-200 text-red-800 px-5 py-4 rounded-lg mb-6">
          <strong className="font-bold">Connection failed: </strong>
          <span>{error}</span>
        </div>
        <button
          onClick={() => navigate("/spotify/quick", { replace: true })}
          className="text-slate-600 hover:text-slate-800 text-sm font-medium"
        >
          Back to Spotify
        </button>
      </div>
    );
  }

  // Brief loading state while the token exchange happens
  return (
    <div className="flex flex-col items-center px-6 py-16 max-w-lg mx-auto my-8">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500 mb-4" />
      <p className="text-slate-500 text-sm">Connecting to Spotify...</p>
    </div>
  );
};

export default SpotifyCallback;
