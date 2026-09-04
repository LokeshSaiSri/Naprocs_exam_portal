import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase, toSnakeCase } from "@/lib/caseConvert";
import { withDefaults } from "@/lib/dbDefaults";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const driveId = searchParams.get("driveId");

    let query = supabase.from("questions").select("*").order("updated_at", { ascending: false });
    if (driveId) query = query.eq("drive_id", driveId);

    const { data: questions, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, questions: toCamelCase(questions) });
  } catch (error: any) {
    console.error("Fetch Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Support either single object or array of objects
    const items = Array.isArray(body) ? body : [body];

    // Validate minimally
    for (const item of items) {
      if (!['MCQ', 'CODING'].includes(item.type) || !item.title || !item.content) {
        return NextResponse.json({ error: "Invalid question schema provided." }, { status: 400 });
      }

      // Strict constraints for coding module logic
      if (item.type === 'CODING' && (!item.testCases || item.testCases.length === 0)) {
         return NextResponse.json({ error: "Coding questions require at least one test case." }, { status: 400 });
      }
    }

    const rows = items.map((item) => withDefaults(item, { options: [], testCases: [] }));
    const { data: newQuestions, error } = await supabase
      .from("questions")
      .insert(toSnakeCase(rows))
      .select();

    if (error) {
      if (error.code === "23503") {
        return NextResponse.json({ error: "Referenced drive does not exist." }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      count: newQuestions.length,
      message: "Successfully pushed to master bank."
    }, { status: 201 });

  } catch (error: any) {
    console.error("Ingestion Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
