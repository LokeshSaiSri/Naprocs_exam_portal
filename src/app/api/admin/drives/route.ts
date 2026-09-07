import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase, toSnakeCase } from "@/lib/caseConvert";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const { data: drives, error } = await supabase
      .from("drives")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, drives: toCamelCase(drives) });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch drives" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const body = await req.json();

    // Generate slug if not provided
    if (!body.slug && body.title) {
      body.slug = body.title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    }

    const { data: drive, error } = await supabase
      .from("drives")
      .insert(toSnakeCase(body))
      .select()
      .single();

    if (error) {
      // Postgres unique_violation === old Mongo error.code === 11000
      if (error.code === "23505") {
        return NextResponse.json({ error: "A drive with this slug already exists" }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, drive: toCamelCase(drive) }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to create drive" }, { status: 500 });
  }
}
