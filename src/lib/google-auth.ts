// Headless Google access for server-side callers (the MCP server) that have no
// browser session. Uses a stored refresh token (GOOGLE_REFRESH_TOKEN) with the
// same OAuth client as NextAuth. Because the OAuth app is "Internal", the
// refresh token does not expire.

export const isGoogleServerConfigured = !!process.env.GOOGLE_REFRESH_TOKEN;

let cached: { token: string; expiresAt: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      "GOOGLE_REFRESH_TOKEN is not set — visit /api/google/refresh-token while signed in to capture it.",
    );
  }
  // Reuse a still-valid access token (warm serverless instances keep this).
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Google token refresh failed: ${data.error_description || data.error || res.status}`,
    );
  }
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}
