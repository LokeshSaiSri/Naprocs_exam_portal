import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Question from '@/models/Question';

export async function POST(req: Request) {
  await dbConnect();
  try {
    const { questions } = await req.json();

    if (!Array.isArray(questions)) {
      return NextResponse.json({ success: false, error: 'Structure Mismatch: Payload must be an array.' }, { status: 400 });
    }

    // Insert many but allow partial successes if one is malformed (optional logic)
    // We'll use insertMany for speed in a placement drive context
    const results = await Question.insertMany(questions);

    return NextResponse.json({ 
      success: true, 
      count: results.length,
      message: `${results.length} unique nodes instantiated and pushed to cluster.`
    });

  } catch (error: any) {
    console.error("Bulk Ingestion Fault:", error);
    return NextResponse.json({ 
      success: false, 
      error: 'Data Validation Error: Ensure all fields map correctly to the Question schema.' 
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
