import { NextResponse } from "next/server";
import vm from "node:vm";
import connectToDatabase from "@/lib/mongodb";
import Question from "@/models/Question";

export async function POST(req: Request) {
  try {
    const { studentCode, questionId } = await req.json();

    if (!studentCode || !questionId) {
      return NextResponse.json({ error: "No execution payload or identity provided" }, { status: 400 });
    }

    await connectToDatabase();
    const question = await Question.findById(questionId).lean() as any;

    if (!question) {
       return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const testCases = question.testCases || [];

    // 1. Generate Wrapped Code
    const funcMatch = studentCode.match(/function\s+([a-zA-Z0-9_$]+)/);
    const entryPoint = funcMatch ? funcMatch[1] : null;

    const wrappedCode = `
      (function(global) {
        try {
          ${studentCode}
          
          global.RESULTS = [];
          const cases = ${JSON.stringify(testCases)};
          const entry = "${entryPoint}";

          for (let i = 0; i < cases.length; i++) {
             const tc = cases[i];
             const res = { index: i, actual: null, error: null, runtime: 0 }; 
             const start = Date.now();
             try {
                if (!entry || typeof eval(entry) !== 'function') {
                   throw new Error("Function signature mismatch. Reset code to default.");
                }
                
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

                let actual = eval(entry)(...args);
                if (actual === undefined) throw new Error("Logic returned undefined");

                if (typeof actual === 'number' && !Number.isInteger(actual)) {
                   actual = parseFloat(actual.toFixed(5));
                }
                if (Array.isArray(actual) || (actual !== null && typeof actual === 'object')) {
                   actual = JSON.stringify(actual);
                }

                res.actual = String(actual).trim();
             } catch(e) {
                res.error = e.message;
             }
             res.runtime = Date.now() - start;
             global.RESULTS.push(res);
          }
        } catch(e) {
           throw new Error("COMPILATION_ERROR: " + e.message);
        }
      })(this);
    `;

    // 2. Setup secure sandbox
    const sandbox: any = { RESULTS: null };
    const context = vm.createContext(sandbox);

    try {
      const script = new vm.Script(wrappedCode);
      script.runInContext(context, { timeout: 2500 });

      const results = sandbox.RESULTS;

      if (!results) {
        return NextResponse.json({ 
           success: false, 
           verdict: 'RUNTIME_ERROR', 
           message: "Evaluation engine failed to produce results." 
        });
      }

      // 3. Perform Comparison against Ground Truth (Server-side)
      const evaluatedResults = results.map((r: any, idx: number) => {
        const tc = testCases[idx];
        const expectedNorm = (tc.expectedOutput || "").toString().toLowerCase().trim();
        const actualNorm = (r.actual || "").toString().toLowerCase().trim();
        const isPassed = !r.error && (actualNorm === expectedNorm);

        // Scrub details for hidden test cases
        if (tc.isHidden) {
          return { 
            index: r.index, 
            passed: isPassed, 
            error: r.error, 
            runtime: r.runtime,
            isHidden: true // Reveal only that it passed
          };
        }

        return { 
           ...r, 
           passed: isPassed,
           isHidden: false 
        };
      });

      return NextResponse.json({
        success: true,
        results: evaluatedResults
      });

    } catch (e: any) {
      if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        return NextResponse.json({ success: false, verdict: 'TIME_LIMIT_EXCEEDED' });
      }
      return NextResponse.json({ success: false, verdict: 'RUNTIME_ERROR', message: e.message });
    }

  } catch (error: any) {
    console.error("Evaluation API Hardware Failure:", error);
    return NextResponse.json({ error: "Internal Evaluation Failure" }, { status: 500 });
  }
}
