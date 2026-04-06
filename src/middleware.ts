import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bypass exact login routes
  if (pathname === '/admin/login' || pathname === '/api/auth/admin-login') {
    return NextResponse.next();
  }

  // Intercepting Generic Admin Constraints
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    
    const token = request.cookies.get('adminAuthToken')?.value;

    if (!token) {
      return handleUnauthorized(request);
    }

    try {
      const secretPassphrase = process.env.ADMIN_SECRET_PASSPHRASE;
      if (!secretPassphrase) throw new Error("Missing generic environment validation constraints");

      const secret = new TextEncoder().encode(secretPassphrase);
      
      // Execute strict JWT parsing utilizing native JOSE cryptography mapping
      await jwtVerify(token, secret);
      
      return NextResponse.next();
    } catch (error) {
      console.error("Middleware Payload Exception:", error);
      return handleUnauthorized(request);
    }
  }

  return NextResponse.next();
}

// Redirects UI users -> Login, outputs 401 JSON for APIs
function handleUnauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Unauthorized Access Pipeline' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/admin/login', request.url));
}

export const config = {
  matcher: [
    /*
     * Match all request paths traversing generic /admin and /api/admin
     */
    '/admin/:path*',
    '/api/admin/:path*'
  ],
};
