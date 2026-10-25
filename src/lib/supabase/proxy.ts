import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { homeFor, roleFromClaims } from "@/lib/auth/roles";

const ORG_PREFIXES = ["/dashboard", "/jobs", "/interviews"];
const CANDIDATE_PREFIXES = ["/candidate"];

/**
 * Refreshes the Supabase session cookie and gates routes by role (from JWT app_metadata, so no DB
 * call). This is the optimistic check; pages and actions re-verify on the server.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const role = claims?.sub ? roleFromClaims(claims) : null;
  const path = request.nextUrl.pathname;
  const redirect = (pathname: string, keepNext = false) => {
    const u = request.nextUrl.clone();
    u.pathname = pathname;
    u.search = "";
    if (keepNext) u.searchParams.set("next", path + request.nextUrl.search);
    const r = NextResponse.redirect(u);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  const orgRoute = ORG_PREFIXES.some((p) => path.startsWith(p));
  const candidateRoute = CANDIDATE_PREFIXES.some((p) => path.startsWith(p));
  if (orgRoute || candidateRoute) {
    if (!role) return redirect("/", true);
    if (orgRoute && role === "CANDIDATE") return redirect(homeFor(role));
    if (candidateRoute && role !== "CANDIDATE") return redirect(homeFor(role));
  }
  if (role && (path === "/" || path === "/login" || path === "/signup") && !request.nextUrl.searchParams.get("next")) {
    return redirect(homeFor(role));
  }
  return response;
}
