import { GET as queueGet } from "@/app/api/partner-responses/route";
import { GET as mailGet } from "@/app/api/mail/threads/route";

// Dashboard readers use the saved queue once enabled. A broken queue surfaces
// an error instead of silently starting expensive Gmail scans on every tab.
export async function GET(request: Request) {
  const result = await queueGet(new Request(new URL("/api/partner-responses?summary=1", request.url), { headers: request.headers }));
  if (!result.ok) return result;
  const body = await result.clone().json();
  if (body.configured) return result;
  return mailGet(new Request(new URL("/api/mail/threads?view=all", request.url), { headers: request.headers }));
}
