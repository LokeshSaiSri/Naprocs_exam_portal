import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { formatToIST } from "@/lib/time";
import crypto from "crypto";
import { withRetry, isTransientStorageError } from "@/lib/withRetry";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const driveId = formData.get("driveId") as string;

    if (!driveId) {
      return NextResponse.json({ error: "No target recruitment drive specified" }, { status: 400 });
    }

    // Enforce Drive-Specific Scheduling Window
    const { data: drive, error: driveError } = await supabase.from("drives").select("*").eq("id", driveId).maybeSingle();
    if (driveError) throw driveError;
    if (!drive) {
      return NextResponse.json({ error: "Invalid recruitment drive" }, { status: 404 });
    }

    if (!drive.is_exam_active) {
      return NextResponse.json({
        error: "Registration for this drive is currently deactivated."
      }, { status: 403 });
    }

    const now = new Date();
    const GRACE_PERIOD = 2 * 60 * 1000; // 2 minutes buffer

    if (drive.reg_start && now < new Date(drive.reg_start)) {
      return NextResponse.json({
        error: `Registration for this drive opens on ${formatToIST(drive.reg_start)}`
      }, { status: 403 });
    }
    if (drive.reg_end && now.getTime() > new Date(drive.reg_end).getTime() + GRACE_PERIOD) {
      return NextResponse.json({
        error: "The registration window for this batch has closed."
      }, { status: 403 });
    }
    const name = formData.get("name") as string;
    // Normalize case/whitespace at write time so every row is canonical from
    // here on -- this is what makes case-insensitive login (email OR roll
    // number) reliable without special-casing the lookup. See
    // supabase/migrations/008_normalize_candidate_identifiers.sql for the
    // matching backfill of rows that predate this.
    const email = ((formData.get("email") as string) || "").trim().toLowerCase();
    const phone = formData.get("phone") as string;
    const collegeRollNumber = ((formData.get("collegeRollNumber") as string) || "").trim().toUpperCase();
    const resumeFile = formData.get("resume") as File;

    if (!name || !email || !phone || !collegeRollNumber || !resumeFile) {
      return NextResponse.json({ error: "Missing required fields or resume file" }, { status: 400 });
    }

    // Generate random 6-digit access PIN
    const accessPin = Math.floor(100000 + Math.random() * 900000).toString();

    // Process and Save File
    // Part 4 decision (2026-09-01): resumes now go to Supabase Storage
    // (a PRIVATE bucket -- candidate PII, never public) instead of inline
    // base64. `resume_url` now holds a storage object PATH, not a data URI;
    // the admin candidates route resolves it to a short-lived signed URL at
    // read time (see admin/candidates/route.ts).
    let resumePath = "";
    if (resumeFile) {
      // Validate PDF and size
      if (resumeFile.type !== "application/pdf") {
        return NextResponse.json({ error: "Only PDF resumes are supported" }, { status: 400 });
      }
      if (resumeFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Resume file size must be under 5MB" }, { status: 413 });
      }

      const bytes = await resumeFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      resumePath = `${driveId}/${crypto.randomUUID()}.pdf`;
      // Found via load testing: under a burst of concurrent uploads, Supabase
      // Storage's own connection pool can return a transient 429 ("Too many
      // connections issued to the database"). Retry briefly before giving up.
      try {
        await withRetry(
          async () => {
            const { error: uploadError } = await supabase.storage
              .from("resumes")
              .upload(resumePath, buffer, { contentType: "application/pdf" });
            if (uploadError) throw uploadError;
          },
          { retries: 4, baseDelayMs: 250, isRetryable: isTransientStorageError }
        );
      } catch (error: any) {
        if (isTransientStorageError(error)) {
          return NextResponse.json({
            error: "Registration is experiencing very high traffic right now. Please try again in a few seconds."
          }, { status: 503 });
        }
        throw error;
      }
    }

    // Create Candidate
    // Part 4 decision (2026-09-01, fixed not just ported): the old
    // check-then-insert race condition is closed. There's no separate
    // pre-check SELECT anymore -- the DB's unique constraints on email and
    // college_roll_number are the sole source of truth, and a violation is
    // caught below and turned into the same friendly 409 the old pre-check
    // produced only in the non-race case.
    const { data: newCandidate, error: createError } = await supabase
      .from("candidates")
      .insert({
        name,
        email,
        phone,
        college_roll_number: collegeRollNumber,
        resume_url: resumePath,
        access_pin: accessPin,
        drive_id: driveId,
      })
      .select()
      .single();

    if (createError) {
      if (createError.code === "23505") {
        return NextResponse.json({ error: "Candidate with this email or roll number already registered" }, { status: 409 });
      }
      throw createError;
    }

    return NextResponse.json(
      {
        success: true,
        message: "Registration successful. Resume uploaded.",
        accessPin,
        candidateId: newCandidate.id
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Registration Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
