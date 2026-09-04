import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { data: drive, error } = await supabase.from("drives").select("*").eq("slug", slug).maybeSingle();
    if (error) throw error;

    if (!drive) {
      return NextResponse.json({ error: "Invalid registration link" }, { status: 404 });
    }

    const now = new Date();
    const GRACE_PERIOD = 2 * 60 * 1000; // 2 minutes buffer

    let status = "ACTIVE";
    if (now < new Date(drive.reg_start)) status = "PENDING";
    if (now.getTime() > new Date(drive.reg_end).getTime() + GRACE_PERIOD) status = "CLOSED";
    if (!drive.is_exam_active) status = "DEACTIVATED";

    return NextResponse.json({
      success: true,
      drive: {
        _id: drive.id,
        title: drive.title,
        regStart: drive.reg_start,
        regEnd: drive.reg_end,
        examStart: drive.exam_start,
        examEnd: drive.exam_end,
        examDuration: drive.exam_duration,
        status,
        slug: drive.slug
      }
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch drive info" }, { status: 500 });
  }
}
