import { NextRequest, NextResponse } from "next/server";
import { fetchAuthSession } from "aws-amplify/auth/server";
import { runWithAmplifyServerContext } from "@/lib/amplifyServerUtils";

// Coarse gate for the admin UI. Real enforcement stays in the data layer
// (Amplify auth rules) and the admin API routes, which verify the JWT's
// Admin group themselves.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const { authenticated, isAdmin } = await runWithAmplifyServerContext({
    nextServerContext: { request, response },
    operation: async (contextSpec) => {
      try {
        const session = await fetchAuthSession(contextSpec);
        const groups =
          (session.tokens?.idToken?.payload?.["cognito:groups"] as string[]) ||
          [];
        return {
          authenticated: session.tokens !== undefined,
          isAdmin: groups.includes("Admin"),
        };
      } catch {
        return { authenticated: false, isAdmin: false };
      }
    },
  });

  if (!authenticated) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (!isAdmin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/admin-cleanup/:path*"],
};
