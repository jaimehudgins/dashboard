import { withAuth } from "next-auth/middleware";

// NextAuth is the gate. Any path matched below requires a valid session;
// unauthenticated requests are redirected to the sign-in page.
export default withAuth({
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
});

export const config = {
  // Gate everything except: NextAuth + cron API routes (server-to-server,
  // no session cookie), Next internals, the auth pages themselves, and assets.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|auth|.*\\.svg$|.*\\.png$|.*\\.ico$).*)",
  ],
};
