import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
    
    // Clear the adminAuthToken cookie by setting its expiration to the past
    // (must match the cookie name set in admin-login/route.ts and read by
    // proxy.ts -- this previously cleared a differently-named cookie that
    // was never set, so Sign Out never actually ended the session).
    response.cookies.set('adminAuthToken', '', {
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: new Date(0), 
      path: '/' 
    });

    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Logout failed' }, { status: 500 });
  }
}
