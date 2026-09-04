import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { isPistonLanguage, executeViaPiston } from "@/lib/pistonExecute";

const robustNormalizeOutput = (s: string) => (s || "")
  .toString()
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l !== "")
  .join('\n')
  .toLowerCase();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, candidateId, finalResponses, stageAction } = body;

    if (!sessionId || !candidateId) {
      return NextResponse.json({ error: "Missing identity constraints" }, { status: 400 });
    }

    // 0. Hard Time Limit Enforcement (Server-Side Safety)
    const { data: candidateDoc, error: candidateError } = await supabase
      .from("candidates").select("*").eq("id", candidateId).maybeSingle();
    if (candidateError) throw candidateError;

    if (!candidateDoc) {
       return NextResponse.json({ error: "Candidate identity mismatch" }, { status: 401 });
    }

    const { data: driveDoc, error: driveError } = await supabase
      .from("drives").select("*").eq("id", candidateDoc.drive_id).maybeSingle();
    if (driveError) throw driveError;

    if (driveDoc && driveDoc.exam_end) {
       const now = new Date();
       const cutoff = new Date(new Date(driveDoc.exam_end).getTime() + 120000); // 2 minute network grace period
       if (now > cutoff) {
          return NextResponse.json({
             error: "Assessment window strictly expired.",
             details: "The global cutoff time for this drive has passed. Contact your administrator."
          }, { status: 403 });
       }
    }

    // 1. Handle Stage Transition (MCQ -> CODING)
    if (stageAction === 'MCQ_SUBMIT') {
       const { data: session, error: transitionError } = await supabase
         .from("exam_sessions")
         .update({ responses: finalResponses, current_stage: 'CODING' })
         .eq("id", sessionId)
         .select()
         .maybeSingle();
       if (transitionError) throw transitionError;

       if (!session) {
          return NextResponse.json({ error: "Session transition error" }, { status: 404 });
       }

       return NextResponse.json({
          success: true,
          message: "MCQ Stage Submitted. Proceeding to Coding Section.",
          nextStage: 'CODING'
       }, { status: 200 });
    }

    // 2. Full Completion (CODING -> END)
    const { data: session, error: completionError } = await supabase
      .from("exam_sessions")
      .update({ responses: finalResponses, status: 'COMPLETED' })
      .eq("id", sessionId)
      .select()
      .maybeSingle();
    if (completionError) throw completionError;

    if (!session) {
      return NextResponse.json({ error: "Session invalidation error" }, { status: 404 });
    }

    // 3. Generate Final Score calculation
    // Pull the specific questions assigned to THIS candidate
    const { data: assignedQuestions, error: assignedError } = await supabase
      .from("questions").select("*").in("id", session.question_ids || []);
    if (assignedError) throw assignedError;

    // Fallback for legacy sessions or edge cases where questionIds might be missing
    let evaluationPool = assignedQuestions || [];
    if (evaluationPool.length === 0) {
       const { data: fallbackQuestions, error: fallbackError } = await supabase
         .from("questions").select("*").in("id", Object.keys(finalResponses));
       if (fallbackError) throw fallbackError;
       evaluationPool = fallbackQuestions || [];
    }

    let totalScore = 0;
    const maximumPossibleScore = evaluationPool.length * 10; // 10 points per module

    const vm = await import("node:vm");

    for (const q of evaluationPool) {
       const userRes = finalResponses[q.id];

       if (q.type === 'MCQ') {
          // Precise MCQ match logic: Check if text matches q.correctAnswer
          const isCorrectIndex = typeof q.correct_answer === 'number' || !isNaN(Number(q.correct_answer));
          const expectedText = isCorrectIndex ? q.options[Number(q.correct_answer)] : q.correct_answer;

          if (userRes && (userRes.selectedOption === expectedText || userRes.selectedOption === q.correct_answer)) {
             totalScore += 10;
          }
       } else if (q.type === 'CODING') {
          const studentCode = userRes?.codeStr || q.boilerplate_code || "";
          const testCases = q.test_cases || [];
          const language = userRes?.language;

          if (testCases.length === 0) continue;

          // Multi-language path: same convention as exam/evaluate -- full
          // program, stdin -> stdout, via self-hosted Piston. JavaScript
          // (absent/undefined for backward compatibility, or explicit
          // 'javascript') keeps the exact existing in-process vm path below.
          if (isPistonLanguage(language)) {
             let passedCount = 0;
             for (const tc of testCases) {
                try {
                   const { stdout, stderr, exitCode } = await executeViaPiston(language, studentCode, (tc.input || "").toString());
                   const actual = stdout.trim();
                   if (exitCode === 0 && robustNormalizeOutput(actual) === robustNormalizeOutput(tc.expectedOutput)) {
                      passedCount++;
                   }
                } catch (e: any) {
                   console.error(`Piston Scoring Failure for Q ${q.id}:`, e.message);
                }
             }
             totalScore += Math.floor((passedCount / testCases.length) * 10);
             // This server-side pass is the ONLY authoritative grading --
             // write its own testsPassed/totalTests back into the stored
             // response so the exam-report (which reads this field) can
             // never disagree with the score actually awarded. Previously
             // the report relied on whatever the client's own separate
             // pre-submit /api/exam/evaluate call happened to produce, which
             // could diverge from this authoritative pass (that's exactly
             // what happened to a real candidate's Java submission -- see
             // SUPABASE_MIGRATION.md).
             finalResponses[q.id] = { ...userRes, testsPassed: passedCount, totalTests: testCases.length };
             continue;
          }

          // 1. Generate Universal Wrapped Code
          const funcMatch = studentCode.match(/function\s+([a-zA-Z0-9_$]+)/);
          const entryPoint = funcMatch ? funcMatch[1] : null;

          const wrappedCode = `
            (function(global) {
              global.RESULTS = [];
              const cases = ${JSON.stringify(testCases)};
              const entry = "${entryPoint}";

              for (let i = 0; i < cases.length; i++) {
                 const tc = cases[i];
                 const res = { index: i, actual: null, error: null };

                 global.STDOUT = [];
                 global.STDIN_CONTENT = (tc.input || "").toString();

                 try {
                    (function() {
                      ${studentCode}
                      if (global.STDOUT.length === 0 && entry && typeof eval(entry) === 'function') {
                         let args = [];
                         const rawInput = (tc.input || "").trim();

                         // Robust Input Dispatch: Try JSON, fallback to comma-split
                         try {
                           if (rawInput.startsWith('[') || rawInput.startsWith('{')) {
                             args = [JSON.parse(rawInput)];
                           } else {
                             throw new Error("Force comma split");
                           }
                         } catch(e) {
                           args = rawInput.split(',').map(v => {
                              const s = v.trim();
                              if (!isNaN(s) && s !== "" && !s.startsWith("0b") && !s.startsWith("0x")) return Number(s);
                              if (s === 'true') return true;
                              if (s === 'false') return false;
                              return s;
                           });
                         }

                         let retValue = eval(entry)(...args);
                         if (retValue !== undefined) {
                            if (Array.isArray(retValue) || (retValue !== null && typeof retValue === 'object')) {
                               retValue = JSON.stringify(retValue);
                            }
                            global.STDOUT.push(String(retValue));
                         }
                      }
                    })();
                    res.actual = global.STDOUT.join('\\n').trim();
                 } catch(e) {
                    res.error = e.message;
                 }
                 global.RESULTS.push(res);
              }
            })(this);
          `;

          // 2. Setup Secure Sandbox with Mocks
          const sandbox: any = {
             RESULTS: null,
             STDOUT: [],
             STDIN_CONTENT: "",
             Buffer: Buffer,
             require: (id: string) => {
                if (id === 'fs') {
                   return {
                      readFileSync: (fd: any, encoding?: string) => {
                         if (fd === 0 || fd === '/dev/stdin') return sandbox.STDIN_CONTENT;
                         throw new Error("FS restricted");
                      }
                   };
                }
                throw new Error("Module restricted");
             },
             console: {
                log: (...args: any[]) => {
                   sandbox.STDOUT.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
                },
                info: (...args: any[]) => sandbox.console.log(...args),
                error: (...args: any[]) => sandbox.console.log(...args),
                warn: (...args: any[]) => sandbox.console.log(...args),
             },
             process: {
                stdout: { write: (s: string) => sandbox.STDOUT.push(s) }
             }
          };

          try {
            const context = vm.createContext(sandbox);
            const script = new vm.Script(wrappedCode);
            script.runInContext(context, { timeout: 3500 });

            const results = sandbox.RESULTS;

            // Robust Normalizer for scored comparison
            const robustNormalize = (s: string) => (s || "")
              .toString()
              .replace(/\r\n/g, '\n')
              .split('\n')
              .map(l => l.trim())
              .filter(l => l !== "")
              .join('\n')
              .toLowerCase();

            if (results && Array.isArray(results)) {
              let passedCount = 0;
              results.forEach((r: any, idx: number) => {
                const tc = testCases[idx];
                const expectedNorm = robustNormalize(tc.expectedOutput);
                const actualNorm = robustNormalize(r.actual);
                if (actualNorm === expectedNorm && !r.error) {
                  passedCount++;
                }
              });
              totalScore += Math.floor((passedCount / testCases.length) * 10);
              // Keep the stored response's testsPassed/totalTests in sync
              // with this authoritative server-side pass (see the Piston
              // branch above for why this matters for the exam-report).
              finalResponses[q.id] = { ...userRes, testsPassed: passedCount, totalTests: testCases.length };
            }
          } catch (e: any) {
            console.error(`Scoring VM Failure for Q ${q.id}:`, e.message);
            // If execution fails, we use the client's reported testsPassed as fallback
            // but usually this means the code was invalid or timed out.
            if (userRes && userRes.testsPassed > 0) {
               totalScore += Math.floor((userRes.testsPassed / userRes.totalTests) * 10);
            }
          }
       }
    }

    const percentileScore = maximumPossibleScore > 0
       ? Math.floor((totalScore / maximumPossibleScore) * 100)
       : 0;

    // The step-2 write above stored finalResponses BEFORE this scoring loop
    // filled in the authoritative testsPassed/totalTests for coding answers
    // (needed the session row back first to know which questions to grade).
    // Persist the corrected copy now so the exam-report reads figures that
    // actually match the score just computed.
    const { error: responsesPatchError } = await supabase
      .from("exam_sessions")
      .update({ responses: finalResponses })
      .eq("id", sessionId);
    if (responsesPatchError) throw responsesPatchError;

    // Automatic cutoff-based advancement: a candidate who meets or beats the
    // drive's passing_cutoff skips straight to TECH_ROUND instead of sitting
    // in EXAM_COMPLETED waiting on a manual drag. Below cutoff: unchanged
    // behavior -- stays EXAM_COMPLETED for an admin to review by hand (not
    // auto-rejected; admins can still move anyone manually either way).
    const cutoff = driveDoc?.passing_cutoff;
    const qualifiesForNextRound = typeof cutoff === 'number' && percentileScore >= cutoff;
    const finalStage = qualifiesForNextRound ? 'TECH_ROUND' : 'EXAM_COMPLETED';

    // Patch Candidate Master Instance
    const { error: patchError } = await supabase
      .from("candidates")
      .update({ exam_score: percentileScore, stage: finalStage })
      .eq("id", candidateId);
    if (patchError) throw patchError;

    return NextResponse.json({
       success: true,
       finalScore: percentileScore,
       stage: finalStage,
       message: qualifiesForNextRound
         ? `Assessment fully evaluated. Score met the ${cutoff}% cutoff -- advanced to Tech Round.`
         : "Assessment fully evaluated and synced."
    }, { status: 200 });

  } catch (error: any) {
    console.error("Exam Final Submit Pipeline Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
