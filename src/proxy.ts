import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Role-gated pages and the auth pages. Candidate interview pages and APIs verify their own access.
  matcher: ["/dashboard/:path*", "/jobs/:path*", "/interviews/:path*", "/candidate/:path*", "/login", "/signup"],
};
