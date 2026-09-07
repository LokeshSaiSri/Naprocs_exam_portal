import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";

const TEST_SECRET = "test-admin-secret-passphrase-for-vitest";

// Mock next/headers' cookies() -- adminAuth.ts calls `(await cookies()).get(...)`.
// The mock is reconfigured per test via `mockCookieValue`.
let mockCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === "adminAuthToken" && mockCookieValue !== undefined ? { value: mockCookieValue } : undefined),
  })),
}));

const { verifyAdminSession, requireAdmin } = await import("@/lib/adminAuth");

const signValidToken = async (secret: string, expiresIn: string) =>
  new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));

beforeEach(() => {
  process.env.ADMIN_SECRET_PASSPHRASE = TEST_SECRET;
  mockCookieValue = undefined;
});

afterEach(() => {
  delete process.env.ADMIN_SECRET_PASSPHRASE;
});

describe("verifyAdminSession", () => {
  it("rejects when there is no cookie at all", async () => {
    mockCookieValue = undefined;
    expect(await verifyAdminSession()).toBe(false);
  });

  it("rejects a malformed token", async () => {
    mockCookieValue = "not-a-real-jwt";
    expect(await verifyAdminSession()).toBe(false);
  });

  it("rejects a token signed with the wrong secret (forged/stale-secret token)", async () => {
    mockCookieValue = await signValidToken("a-completely-different-secret", "2h");
    expect(await verifyAdminSession()).toBe(false);
  });

  it("rejects an expired token", async () => {
    mockCookieValue = await signValidToken(TEST_SECRET, "-1s"); // already expired
    expect(await verifyAdminSession()).toBe(false);
  });

  it("accepts a validly-signed, unexpired token", async () => {
    mockCookieValue = await signValidToken(TEST_SECRET, "2h");
    expect(await verifyAdminSession()).toBe(true);
  });

  it("fails closed when ADMIN_SECRET_PASSPHRASE is not configured (never treats missing config as authorized)", async () => {
    delete process.env.ADMIN_SECRET_PASSPHRASE;
    mockCookieValue = await signValidToken(TEST_SECRET, "2h");
    expect(await verifyAdminSession()).toBe(false);
  });
});

describe("requireAdmin (Route Handler guard)", () => {
  it("returns a 401 NextResponse when unauthorized", async () => {
    mockCookieValue = undefined;
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
    const body = await result?.json();
    expect(body.error).toBeTruthy();
  });

  it("returns null (pass-through) when authorized, so the caller can immediately return it", async () => {
    mockCookieValue = await signValidToken(TEST_SECRET, "2h");
    const result = await requireAdmin();
    expect(result).toBeNull();
  });
});
