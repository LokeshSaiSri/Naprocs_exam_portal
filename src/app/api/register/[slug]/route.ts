import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Drive from "@/models/Drive";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    await connectToDatabase();
    const drive = await Drive.findOne({ slug });
    
    if (!drive) {
      return NextResponse.json({ error: "Invalid registration link" }, { status: 404 });
    }

    const now = new Date();
    let status = "ACTIVE";
    if (now < new Date(drive.regStart)) status = "PENDING";
    if (now > new Date(drive.regEnd)) status = "CLOSED";
    if (!drive.isExamActive) status = "DEACTIVATED";

    return NextResponse.json({ 
      success: true, 
      drive: {
        _id: drive._id,
        title: drive.title,
        regStart: drive.regStart,
        regEnd: drive.regEnd,
        status,
        slug: drive.slug
      } 
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch drive info" }, { status: 500 });
  }
}
