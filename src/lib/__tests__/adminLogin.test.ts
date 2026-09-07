import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { jwtVerify } from "jose";
import { POST } from "@/app/api/auth/admin-login/route";

const TEST_SECRET = "test-admin-secret-passphrase-for-vitest";

const postLogin = (passphrase: unknown) =>
  POST(new Request("http://localhost/api/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  }));

beforeEach(() => {
  process.env.ADMIN_SECRET_PASSPHRASE = TEST_SECRET;
});

afterEach(() => {
  delete process.env.ADMIN_SECRET_PASSPHRASE;
});

describe("POST /api/auth/admin-login", () => {
  it("rejects a wrong passphrase with 401 and sets no cookie", async () => {
    const res = await postLogin("wrong-passphrase");
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed (500) when ADMIN_SECRET_PASSPHRASE is not configured server-side", async () => {
    delete process.env.ADMIN_SECRET_PASSPHRASE;
    const res = await postLogin("anything");
    expect(res.status).toBe(500);
  });

  it("issues a cookie capped at 2 hours (7200s), not the old 24 hours", async () => {
    const res = await postLogin(TEST_SECRET);
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/adminAuthToken=/);

    const maxAgeMatch = setCookie?.match(/Max-Age=(\d+)/i);
    expect(maxAgeMatch).toBeTruthy();
    const maxAge = Number(maxAgeMatch?.[1]);
    expect(maxAge).toBe(60 * 60 * 2);
    expect(maxAge).toBeLessThan(60 * 60 * 24); // regression guard against the old 24h value

    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=strict/i);
  });

  it("the JWT's own exp claim matches the 2-hour cookie lifetime (both must agree)", async () => {
    const res = await postLogin(TEST_SECRET);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const token = setCookie.match(/adminAuthToken=([^;]+)/)?.[1];
    expect(token).toBeTruthy();

    const { payload } = await jwtVerify(token as string, new TextEncoder().encode(TEST_SECRET));
    expect(payload.role).toBe("admin");

    const now = Math.floor(Date.now() / 1000);
    const secondsUntilExpiry = (payload.exp as number) - now;
    // Allow a small margin for test execution time.
    expect(secondsUntilExpiry).toBeGreaterThan(60 * 60 * 2 - 10);
    expect(secondsUntilExpiry).toBeLessThanOrEqual(60 * 60 * 2);
  });
});
