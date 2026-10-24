import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Recruiter pages and auth pages only. Candidate/companion/API routes use Proctra tokens.
  matcher: ["/dashboard/:path*", "/jobs/:path*", "/interviews/:path*", "/login", "/signup"],
};
