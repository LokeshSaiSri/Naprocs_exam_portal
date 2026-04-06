import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Settings from '@/models/Settings';

export async function GET() {
  await dbConnect();
  try {
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = await Settings.create({});
    }
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Database Fault' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  await dbConnect();
  try {
    const body = await req.json();
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = new Settings(body);
    } else {
      // Direct field assignment to ensure new fields (like isExamActive) are captured
      Object.keys(body).forEach(key => {
        (settings as any)[key] = body[key];
      });
    }
    await settings.save();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to persist configurations' }, { status: 500 });
  }
}
