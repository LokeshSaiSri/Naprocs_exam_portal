import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Drive from "@/models/Drive";
import Candidate from "@/models/Candidate";
import Question from "@/models/Question";

export async function GET() {
  try {
    await connectToDatabase();
    const drives = await Drive.find({}).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, drives });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch drives" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    
    // Generate slug if not provided
    if (!body.slug && body.title) {
      body.slug = body.title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    }

    const drive = await Drive.create(body);
    return NextResponse.json({ success: true, drive }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "A drive with this slug already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create drive" }, { status: 500 });
  }
}
