import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase, toSnakeCase } from "@/lib/caseConvert";
import { requireAdmin } from "@/lib/adminAuth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const { id } = await params;
    const body = await req.json();

    // Minimal validation matching the main POST route
    if (body.type === 'CODING' && (!body.testCases || body.testCases.length === 0)) {
        return NextResponse.json({ error: "Coding questions require at least one test case." }, { status: 400 });
    }

    const { data: updatedQuestion, error } = await supabase
      .from("questions")
      .update(toSnakeCase(body))
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;

    if (!updatedQuestion) {
        return NextResponse.json({ error: "Question Not Found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, question: toCamelCase(updatedQuestion) });

  } catch (error: any) {
    console.error("Update Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const { id } = await params;

    const { data: deleted, error } = await supabase
      .from("questions")
      .delete()
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;

    if (!deleted) {
        return NextResponse.json({ error: "Question Not Found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Successfully purged from master bank." });

  } catch (error: any) {
    console.error("Purge Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
