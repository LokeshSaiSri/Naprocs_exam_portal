// Not importing the `server-only` package here (would be a new dependency
// just for a redundant guard) -- this module is only ever imported from
// Route Handlers (route.ts), which Next.js already never bundles to the
// client, so there's no real risk of this leaking into client code.
import { cache } from "react";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

// Defense-in-depth Data Access Layer, per Next.js's own guidance
// (node_modules/next/dist/docs/01-app/02-guides/authentication.md,
// "Creating a Data Access Layer"): Proxy (src/proxy.ts) is the primary gate
// for every /admin/* and /api/admin/* request, but the docs explicitly warn
// "Proxy ... should not be your only line of defense in protecting your
// data. The majority of security checks should be performed as close as
// possible to your data source." Today src/proxy.ts is a genuine single
// point of failure -- if it were ever skipped for any request (a future
// matcher edit, a hosting-layer quirk, anything), every /api/admin/* route
// would trust the request unconditionally. This re-verifies the exact same
// adminAuthToken JWT directly inside the route handler, independent of
// whether the proxy ran.
//
// cache() memoizes this per request (React's request-scoped cache, not a
// cross-request cache) so a route that happens to call it more than once
// only verifies the JWT once.
export const verifyAdminSession = cache(async (): Promise<boolean> => {
  const secretPassphrase = process.env.ADMIN_SECRET_PASSPHRASE;
  if (!secretPassphrase) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get("adminAuthToken")?.value;
  if (!token) return false;

  try {
    const secret = new TextEncoder().encode(secretPassphrase);
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
});

// Convenience wrapper for Route Handlers: returns a ready-to-return 401
// NextResponse if the caller isn't a verified admin, or null if they are.
// Usage at the top of every /api/admin/* handler:
//
//   const unauthorized = await requireAdmin();
//   if (unauthorized) return unauthorized;
export async function requireAdmin() {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized Access Pipeline" }, { status: 401 });
  }
  return null;
}
