import { describe, it, expect } from "vitest";
import { emailSchema, rollNumberSchema, loginIdentifierSchema, isValidUUID } from "@/lib/validators";

describe("loginIdentifierSchema", () => {
  it("accepts a valid email", () => {
    expect(loginIdentifierSchema.safeParse("candidate@example.com").success).toBe(true);
  });

  it("accepts a roll-number-shaped string", () => {
    expect(loginIdentifierSchema.safeParse("CS-2024-042").success).toBe(true);
  });

  it("rejects a malformed email (contains @ but isn't valid)", () => {
    expect(loginIdentifierSchema.safeParse("not-an-email@").success).toBe(false);
  });

  it("rejects a too-short identifier", () => {
    expect(loginIdentifierSchema.safeParse("abc").success).toBe(false);
  });
});

describe("emailSchema / rollNumberSchema", () => {
  it("emailSchema rejects non-email strings", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rollNumberSchema enforces a minimum length", () => {
    expect(rollNumberSchema.safeParse("ab").success).toBe(false);
    expect(rollNumberSchema.safeParse("ABCD").success).toBe(true);
  });
});

describe("isValidUUID", () => {
  it("accepts a well-formed uuid", () => {
    expect(isValidUUID("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("rejects non-uuid strings", () => {
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID(12345)).toBe(false);
  });
});
