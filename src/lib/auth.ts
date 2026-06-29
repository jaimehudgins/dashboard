import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

async function refreshAccessToken(token: {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
}) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      // Google returns expires_in (seconds); convert to absolute timestamp
      expiresAt: Math.floor(Date.now() / 1000) + refreshedTokens.expires_in,
      // Keep existing refresh token if a new one wasn't returned
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

// Single-user gate. Hardcoded fallback so the app fails closed even if the
// optional LEO_ALLOWED_EMAIL env var is unset.
const ALLOWED_EMAIL = process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org";

// Requested up front; must be a subset of the OAuth consent screen's scopes.
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ user }) {
      // Only the single allowed account may sign in.
      const email = user.email;
      if (!email || email !== ALLOWED_EMAIL) {
        return `/auth/error?error=AccessDenied`;
      }
      return true;
    },
    async jwt({ token, account }) {
      // Initial sign in - persist OAuth tokens
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      // Return token if it hasn't expired yet (with 60 second buffer)
      if (
        token.expiresAt &&
        Date.now() < (token.expiresAt as number) * 1000 - 60000
      ) {
        return token;
      }

      // Token has expired; try to refresh it
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      // Surface refresh errors so the client can prompt re-authentication
      if (token.error) {
        session.error = token.error as string;
      }
      return session;
    },
  },
};
