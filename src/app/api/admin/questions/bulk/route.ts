import { NextResponse } from 'next/server';
import supabase from '@/lib/supabase';
import { toSnakeCase } from '@/lib/caseConvert';
import { isValidUUID } from '@/lib/validators';
import { withDefaults } from '@/lib/dbDefaults';

export async function POST(req: Request) {
  try {
    const { questions } = await req.json();

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ success: false, error: 'Structure Mismatch: Payload must be a non-empty array.' }, { status: 400 });
    }

    // 1. Pre-validation: Check for required fields and valid Drive IDs
    for (const [index, q] of questions.entries()) {
      if (!q.driveId || !isValidUUID(q.driveId)) {
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
    // NOTE (deviation, flagged not hidden): Mongo's insertMany({ordered:true})
    // partially commits rows before a failure. A single Postgres INSERT with
    // multiple VALUES rows is all-or-nothing. This is strictly more correct
    // (no partial/corrupt batches) but is a real behavior change worth knowing.
    const rows = questions.map((q: any) => withDefaults(q, { options: [], testCases: [] }));
    const { data: results, error } = await supabase
      .from('questions')
      .insert(toSnakeCase(rows))
      .select();

    if (error) {
      // Postgres CHECK constraint violation (e.g. bad `type` value) -- the
      // old code relied on Mongoose's enum validator + `ValidationError`.
      if (error.code === '23514') {
        return NextResponse.json({
          success: false,
          error: 'Schema Validation Error',
          details: [error.message]
        }, { status: 422 });
      }
      // NOTE (new, previously-silent failure mode): the old Mongo schema
      // never enforced that driveId actually pointed at a real Drive --
      // an orphaned question could be created silently. Postgres now has a
      // real foreign key, so this case surfaces as an explicit 400 instead.
      if (error.code === '23503') {
        return NextResponse.json({
          success: false,
          error: 'One or more rows reference a drive that does not exist.'
        }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      message: `Successfully ingested ${results.length} nodes into the master bank.`
    });

  } catch (error: any) {
    console.error("Bulk Ingestion Critical Fault:", error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal Server Error during bulk processing.'
    }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { ids } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid payload: "ids" must be a non-empty array.' }, { status: 400 });
    }

    const { data, error } = await supabase.from('questions').delete().in('id', ids).select('id');
    if (error) throw error;

    return NextResponse.json({
      success: true,
      count: data.length,
      message: `Successfully purged ${data.length} records from master bank.`
    });

  } catch (error: any) {
    console.error("Bulk Purge Fault:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
