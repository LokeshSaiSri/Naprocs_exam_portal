import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Question from "@/models/Question";

export async function GET() {
  try {
    await connectToDatabase();
    const questions = await Question.find({}).sort({ updatedAt: -1 });
    return NextResponse.json({ success: true, questions });
  } catch (error: any) {
    console.error("Fetch Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();

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

    // Use insertMany for bulk ingestion performance
    const newQuestions = await Question.insertMany(items);

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
