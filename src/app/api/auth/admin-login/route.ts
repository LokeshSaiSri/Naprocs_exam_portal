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

    const jwt = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime('24h') // Maps cleanly for a 24-hour sprint
      .sign(secret);

    // Formulate a generic strict cookie mapped response
    const response = NextResponse.json({ success: true, message: "Authentication payload validated" }, { status: 200 });
    
    response.cookies.set('adminAuthToken', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });

    return response;

  } catch (error: any) {
    console.error("Admin Credential Parsing Error:", error);
    return NextResponse.json({ error: "Internal Server Fault" }, { status: 500 });
  }
}
