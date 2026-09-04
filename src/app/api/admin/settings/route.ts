import { NextResponse } from 'next/server';
import supabase from '@/lib/supabase';
import { toCamelCase, toSnakeCase } from '@/lib/caseConvert';

export async function GET() {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    // Ensure we only ever have ONE settings row (matches old findOne-or-create).
    let settings = existing;
    if (!settings) {
      const { data: created, error: createError } = await supabase
        .from('settings')
        .insert({})
        .select()
        .single();
      if (createError) throw createError;
      settings = created;
    }

    return NextResponse.json({ success: true, settings: toCamelCase(settings) });
  } catch (error) {
    console.error("Settings Fetch Error:", error);
    return NextResponse.json({ success: false, error: 'Database Fault' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const payload = toSnakeCase(body);

    const { data: existing, error: fetchError } = await supabase
      .from('settings')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (fetchError) throw fetchError;

    let settings;
    if (!existing) {
      const { data: created, error: createError } = await supabase
        .from('settings')
        .insert(payload)
        .select()
        .single();
      if (createError) throw createError;
      settings = created;
    } else {
      // Direct field assignment to ensure new fields are captured (matches old behavior).
      const { data: updated, error: updateError } = await supabase
        .from('settings')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (updateError) throw updateError;
      settings = updated;
    }

    return NextResponse.json({ success: true, settings: toCamelCase(settings) });
  } catch (error) {
    console.error("Settings Persist Error:", error);
    return NextResponse.json({ success: false, error: 'Failed to persist configurations' }, { status: 500 });
  }
}
