import { NextResponse } from "next/server";
import { SignJWT } from "jose";

export async function POST(req: Request) {
  try {
    const { passphrase } = await req.json();

    const secretPassphrase = process.env.ADMIN_SECRET_PASSPHRASE;

    if (!secretPassphrase) {
       return NextResponse.json({ error: "Server misconfiguration. Admin secret not set." }, { status: 500 });
    }

    if (passphrase !== secretPassphrase) {
       return NextResponse.json({ error: "Invalid generic credentials" }, { status: 401 });
    }

    // Sign the JWT bridging Next.js generic Edge limits
    const secret = new TextEncoder().encode(secretPassphrase);
    const alg = 'HS256';

    // Session length: 2 hours, not 24. A 24h cookie on a shared lab/kiosk
    // computer (the normal way this app gets used on a recruitment drive
    // day -- an admin sets up the drive on a shared machine, then students
    // use that same browser for /exam) stays valid long after the admin's
    // actual work is done. Anyone who later uses that same browser can
    // reach /admin with zero credentials just by navigating there, because
    // the cookie is still valid -- proxy.ts (src/proxy.ts) correctly
    // verifies it as a real signed session, since nothing distinguishes
    // "the admin is still here" from "the admin was here 20 hours ago and
    // forgot to sign out." 2h caps that exposure window to the length of a
    // normal setup session instead of most of a day.
    const SESSION_MAX_AGE_SECONDS = 60 * 60 * 2;

    const jwt = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
      .sign(secret);

    // Formulate a generic strict cookie mapped response
    const response = NextResponse.json({ success: true, message: "Authentication payload validated" }, { status: 200 });

    response.cookies.set('adminAuthToken', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/'
    });

    return response;

  } catch (error: any) {
    console.error("Admin Credential Parsing Error:", error);
    return NextResponse.json({ error: "Internal Server Fault" }, { status: 500 });
  }
}
