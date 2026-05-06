import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Question from '@/models/Question';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { questions } = await req.json();

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ success: false, error: 'Structure Mismatch: Payload must be a non-empty array.' }, { status: 400 });
    }

    // 1. Pre-validation: Check for required fields and valid Drive IDs
    const mongoose = await import('mongoose');
    for (const [index, q] of questions.entries()) {
      if (!q.driveId || !mongoose.Types.ObjectId.isValid(q.driveId)) {
        return NextResponse.json({ 
          success: false, 
          error: `Validation Error at Row ${index + 1}: Missing or invalid driveId. Ensure a drive is selected before uploading.` 
        }, { status: 400 });
      }
      if (!q.title || !q.content || !q.type) {
        return NextResponse.json({ 
          success: false, 
          error: `Validation Error at Row ${index + 1}: Required fields (title, content, type) are missing.` 
        }, { status: 400 });
      }
    }

    // 2. Bulk Insertion
    const results = await Question.insertMany(questions, { ordered: true });

    return NextResponse.json({ 
      success: true, 
      count: results.length,
      message: `Successfully ingested ${results.length} nodes into the master bank.`
    });

  } catch (error: any) {
    console.error("Bulk Ingestion Critical Fault:", error);
    
    // Handle Mongoose specific validation errors
    if (error.name === 'ValidationError') {
      return NextResponse.json({ 
        success: false, 
        error: 'Schema Validation Error',
        details: Object.values(error.errors).map((err: any) => err.message)
      }, { status: 422 });
    }

    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal Server Error during bulk processing.' 
    }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { ids } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid payload: "ids" must be a non-empty array.' }, { status: 400 });
    }

    const result = await Question.deleteMany({ _id: { $in: ids } });

    return NextResponse.json({ 
      success: true, 
      count: result.deletedCount,
      message: `Successfully purged ${result.deletedCount} records from master bank.` 
    });

  } catch (error: any) {
    console.error("Bulk Purge Fault:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
