import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal fluent mock of the Supabase client: every chainable method
// returns the same singleton, and the "terminal" call (either .maybeSingle()
// or a bare `await` of the chain via .then) consumes the next queued
// response, in call order. Good enough to drive the specific call sequences
// examTiming.ts makes without standing up a real database.
const { mockSupabase, enqueue, resetQueue } = vi.hoisted(() => {
  const queue: any[] = [];
  const chain: any = {};
  ["from", "update", "insert", "delete", "select", "eq", "in", "neq", "order"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(queue.shift() ?? { data: null, error: null }));
  chain.then = (resolve: any) => resolve(queue.shift() ?? { data: null, error: null });
  return {
    mockSupabase: chain,
    enqueue: (result: any) => queue.push(result),
    resetQueue: () => {
      queue.length = 0;
    },
  };
});

vi.mock("@/lib/supabase", () => ({ default: mockSupabase }));

const { ensureSessionDeadline, isPastDeadline, coerceEndReason, finalizeSession, SUBMIT_GRACE_MS } = await import(
  "@/lib/examTiming"
);

beforeEach(() => {
  resetQueue();
  mockSupabase.update.mockClear();
});

describe("isPastDeadline", () => {
  it("is false before the deadline", () => {
    expect(isPastDeadline(new Date(Date.now() + 60_000))).toBe(false);
  });

  it("is false just past the deadline but within the grace window", () => {
    expect(isPastDeadline(new Date(Date.now() - 1_000), SUBMIT_GRACE_MS)).toBe(false);
  });

  it("is true once past deadline + grace", () => {
    expect(isPastDeadline(new Date(Date.now() - (SUBMIT_GRACE_MS + 5_000)))).toBe(true);
  });
});

describe("coerceEndReason", () => {
  it("passes through a valid reason", () => {
    expect(coerceEndReason("TIME_EXPIRED")).toBe("TIME_EXPIRED");
  });

  it("falls back to MANUAL for anything invalid or missing", () => {
    expect(coerceEndReason("not-a-real-reason")).toBe("MANUAL");
    expect(coerceEndReason(undefined)).toBe("MANUAL");
    expect(coerceEndReason(null)).toBe("MANUAL");
  });
});

describe("ensureSessionDeadline", () => {
  it("returns the existing deadline without writing to the DB if already set", async () => {
    const existing = new Date(Date.now() + 10_000).toISOString();
    const session = { id: "s1", start_time: new Date().toISOString(), deadline: existing };
    const result = await ensureSessionDeadline(session, { exam_duration: 60, exam_end: null });
    expect(result.toISOString()).toBe(existing);
    expect(mockSupabase.update).not.toHaveBeenCalled();
  });

  it("computes start_time + duration and persists it when missing", async () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const session = { id: "s2", start_time: start.toISOString(), deadline: null };
    enqueue({ error: null }); // the .update(...).eq(...) write

    const result = await ensureSessionDeadline(session, { exam_duration: 60, exam_end: null });

    expect(result.getTime()).toBe(start.getTime() + 60 * 60_000);
    expect(mockSupabase.update).toHaveBeenCalledWith({ deadline: result.toISOString() });
    // Self-heals the passed-in object too, so a caller holding the same
    // reference sees the computed deadline without re-fetching.
    expect(session.deadline).toBe(result.toISOString());
  });

  it("caps the deadline at the drive's exam_end when duration would run past it", async () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const driveEnd = new Date("2026-01-01T00:30:00.000Z"); // only 30 min away, duration is 60
    const session = { id: "s3", start_time: start.toISOString(), deadline: null };
    enqueue({ error: null });

    const result = await ensureSessionDeadline(session, { exam_duration: 60, exam_end: driveEnd.toISOString() });

    expect(result.getTime()).toBe(driveEnd.getTime());
  });
});

describe("finalizeSession idempotency", () => {
  // Regression test for the double-submit race found in submit/route.ts:
  // two near-simultaneous finalize calls for the same session (e.g. a
  // HIGH-severity violation firing the same tick as timer expiry) must not
  // both re-run scoring and both patch the candidate's score/stage.
  it("reports the existing result instead of re-scoring when the session is already finalized", async () => {
    enqueue({ data: null, error: null }); // completing update finds 0 rows (not IN_PROGRESS anymore)
    enqueue({ data: { id: "s1" }, error: null }); // session still exists
    enqueue({ data: { exam_score: 82, stage: "TECH_ROUND" }, error: null }); // existing candidate result

    const result = await finalizeSession({
      sessionId: "s1",
      candidateId: "c1",
      driveDoc: { passing_cutoff: 70 },
      finalResponses: {},
      reason: "MANUAL",
    });

    expect(result).toEqual({
      success: true,
      alreadyFinalized: true,
      finalScore: 82,
      stage: "TECH_ROUND",
    });
  });

  it("reports not found if the session genuinely doesn't exist", async () => {
    enqueue({ data: null, error: null }); // completing update finds 0 rows
    enqueue({ data: null, error: null }); // and the session doesn't exist at all

    const result = await finalizeSession({
      sessionId: "does-not-exist",
      candidateId: "c1",
      driveDoc: { passing_cutoff: 70 },
      finalResponses: {},
      reason: "MANUAL",
    });

    expect(result).toEqual({ success: false, notFound: true });
  });
});
