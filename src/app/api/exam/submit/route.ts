import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import ExamSession from "@/models/ExamSession";
import Candidate from "@/models/Candidate";
import Question from "@/models/Question";

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { sessionId, candidateId, finalResponses, stageAction } = body;

    if (!sessionId || !candidateId) {
      return NextResponse.json({ error: "Missing identity constraints" }, { status: 400 });
    }

    // 1. Handle Stage Transition (MCQ -> CODING)
    if (stageAction === 'MCQ_SUBMIT') {
       const session = await ExamSession.findByIdAndUpdate(
          sessionId,
          { 
             $set: { 
                responses: finalResponses, 
                currentStage: 'CODING' 
             } 
          },
          { new: true }
       );
       
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
    const session = await ExamSession.findByIdAndUpdate(
      sessionId,
      { 
        $set: { responses: finalResponses, status: 'COMPLETED' } 
      },
      { new: true }
    );
 
    if (!session) {
      return NextResponse.json({ error: "Session invalidation error" }, { status: 404 });
    }
 
    // 3. Generate Final Score calculation
    // Pull the specific questions assigned to THIS candidate
    const assignedQuestions = await Question.find({ _id: { $in: session.questionIds } }).lean();
    
    // Fallback for legacy sessions or edge cases where questionIds might be missing
    const evaluationPool = assignedQuestions.length > 0 
       ? assignedQuestions 
       : await Question.find({ _id: { $in: Object.keys(finalResponses) } }).lean();
    
    let totalScore = 0;
    const maximumPossibleScore = evaluationPool.length * 10; // 10 points per module
 
    const vm = await import("node:vm");

    for (const q of evaluationPool) {
       const userRes = finalResponses[q._id.toString()];
       
       if (q.type === 'MCQ') {
          // Precise MCQ match logic: Check if text matches q.correctAnswer
          const isCorrectIndex = typeof q.correctAnswer === 'number' || !isNaN(Number(q.correctAnswer));
          const expectedText = isCorrectIndex ? q.options[Number(q.correctAnswer)] : q.correctAnswer;
          
          if (userRes && (userRes.selectedOption === expectedText || userRes.selectedOption === q.correctAnswer)) {
             totalScore += 10;
          }
       } else if (q.type === 'CODING') {
          const studentCode = userRes?.codeStr || q.boilerplateCode || "";
          const testCases = q.testCases || [];
          
          if (testCases.length === 0) continue;

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
                         if (rawInput.startsWith('[') || rawInput.startsWith('{')) {
                           args = [JSON.parse(rawInput)];
                         } else {
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
                      readFileSync: (fd: any) => {
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
                }
             },
             process: {
                stdout: { write: (s: string) => sandbox.STDOUT.push(s) }
             }
          };

          try {
            const context = vm.createContext(sandbox);
            const script = new vm.Script(wrappedCode);
            script.runInContext(context, { timeout: 3000 });
            
            const results = sandbox.RESULTS;
            if (results && Array.isArray(results)) {
              let passedCount = 0;
              results.forEach((r: any, idx: number) => {
                const tc = testCases[idx];
                const expectedNorm = (tc.expectedOutput || "").toString().toLowerCase().trim();
                const actualNorm = (r.actual || "").toString().toLowerCase().trim();
                if (actualNorm === expectedNorm && !r.error) {
                  passedCount++;
                }
              });
              totalScore += Math.floor((passedCount / testCases.length) * 10);
            }
          } catch (e: any) {
            console.error(`Scoring VM Failure for Q ${q._id}:`, e.message);
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

    // Patch Candidate Master Instance
    await Candidate.findByIdAndUpdate(candidateId, {
       $set: {
          examScore: percentileScore,
          stage: 'EXAM_COMPLETED'
       }
    });

    return NextResponse.json({ 
       success: true, 
       finalScore: percentileScore,
       message: "Assessment fully evaluated and synced." 
    }, { status: 200 });

  } catch (error: any) {
    console.error("Exam Final Submit Pipeline Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
