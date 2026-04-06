import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
    
    // Clear the admin_token cookie by setting its expiration to the past
    response.cookies.set('admin_token', '', { 
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
