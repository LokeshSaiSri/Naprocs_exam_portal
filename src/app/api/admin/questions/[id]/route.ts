import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Question from "@/models/Question";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const body = await req.json();
    
    // Minimal validation matching the main POST route
    if (body.type === 'CODING' && (!body.testCases || body.testCases.length === 0)) {
        return NextResponse.json({ error: "Coding questions require at least one test case." }, { status: 400 });
    }

    const updatedQuestion = await Question.findByIdAndUpdate(id, body, { new: true });
    
    if (!updatedQuestion) {
        return NextResponse.json({ error: "Question Not Found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, question: updatedQuestion });
    
  } catch (error: any) {
    console.error("Update Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const { id } = await params;
    
    const deleted = await Question.findByIdAndDelete(id);
    if (!deleted) {
        return NextResponse.json({ error: "Question Not Found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Successfully purged from master bank." });
    
  } catch (error: any) {
    console.error("Purge Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
