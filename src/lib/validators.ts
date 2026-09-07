import * as z from "zod";

// Replaces mongoose.Types.ObjectId.isValid() checks now that IDs are uuid
// (Rulebook rule #3: IDs stay opaque strings, just uuid instead of ObjectId).
export const isValidUUID = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// Shared between the registration form (email field) and the exam login
// form (identifier field, when it looks like an email), so both forms agree
// on shape. Server-side case normalization (lowercase+trim) still happens
// independently in the route handlers -- this only validates shape.
export const emailSchema = z.string().trim().email("Please enter a valid email.");

// Shared between the registration form (roll number field) and the exam
// login form (identifier field, when it doesn't look like an email).
export const rollNumberSchema = z.string().trim().min(4, "Roll number must be at least 4 characters.");

// Exam login now accepts either identifier in one field, auto-detected by
// "@" -- mirrors the same isEmail check used server-side in
// src/app/api/auth/exam-login/route.ts.
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(4, "Enter your email or roll number.")
  .refine(
    (v) => (v.includes("@") ? z.string().email().safeParse(v).success : true),
    { message: "Enter a valid email or roll number." }
  );
